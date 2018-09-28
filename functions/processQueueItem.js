"use strict";

const AWS = require("aws-sdk");
const S3 = new AWS.S3({ apiVersion: "2006-03-01" });
const SES = new AWS.SES({ apiVersion: "2010-12-01" });
const documentClient = new AWS.DynamoDB.DocumentClient();
const request = require("request-promise-native");
const { RATE_LIMIT, RATE_PERIOD, RATE_WAIT } = require("../lib/constants");
const Sentry = require("../lib/sentry");
const Metrics = require("../lib/metrics");
const { wait, epochNow } = require("../lib/utils.js");

const Raven = Sentry();

exports.handler = async function(event = {}, context = {}) {
  const { Records } = event;
  const log = require("../lib/logging")({
    name: "processQueueItem",
    event,
    context,
  });

  const results = [];
  for (let idx = 0; idx < Records.length; idx++) {
    const result = await exports.handleOne(Records[idx], context);
    results.push(result);
  }

  log.debug("done", { resultCount: results.length });
  log.info("summary", { recordCount: Records.length });
  return results;
};

const emailSubject = ({ id, user }) =>
  `[watchdog-proxy] Positive match for ${user} (${id})`;

const emailBody = ({
  id,
  datestamp,
  user,
  notes,
  imageUrl,
  requestUrl,
  responseUrl,
  expirationDate,
  upstreamServiceResponse,
}) => `
Watchdog ID:
${id}

Client application:
${user}

Datestamp:
${datestamp}

Notes:
${notes}

Match metadata:
${JSON.stringify(upstreamServiceResponse, null, " ")}

NOTE: The following URLs will expire and stop working after ${expirationDate}.

Image URL:
${imageUrl}

Request JSON:
${requestUrl}

Response JSON:
${responseUrl}
`;

exports.handleOne = async function(event, context) {
  const log = require("../lib/logging")({
    name: "processQueueItem.worker",
    event,
    context,
  });
  log.info("summary");

  const { body } = event;
  const { awsRequestId } = context;

  const {
    HITRATE_TABLE,
    CONTENT_BUCKET: Bucket,
    UPSTREAM_SERVICE_KEY,
    EMAIL_FROM,
    EMAIL_TO,
    EMAIL_EXPIRES,
  } = process.env;

  log.verbose("env", {
    HITRATE_TABLE,
    Bucket,
    EMAIL_FROM,
    EMAIL_TO,
    EMAIL_EXPIRES,
  });

  const parsedBody = JSON.parse(body);
  log.verbose("parsedBody", { parsedBody });

  const {
    datestamp,
    upstreamServiceUrl,
    id,
    user,
    negative_uri,
    positive_uri,
    positive_email,
    notes,
    image,
  } = parsedBody;

  // Start constructing metrics ping data here, so that if there are any
  // exceptions we can at least send out a partially filled-in ping with
  // is_error: true
  const metricsPing = {
    consumer_name: user,
    worker_id: awsRequestId,
    watchdog_id: id,
    photodna_tracking_id: null,
    is_match: false,
    is_error: false,
    timing_sent: null,
    timing_received: null,
    timing_submitted: null,
  };

  log.info("processing", { id });

  try {
    // Pause if we're at the rate limit for current expiration window
    let rateLimited = false;
    do {
      const data = await documentClient
        .scan({
          TableName: HITRATE_TABLE,
          FilterExpression: "expiresAt > :now",
          ExpressionAttributeValues: { ":now": epochNow() },
        })
        .promise();

      log.verbose("hitRateData", { data });

      if (data.Count >= RATE_LIMIT) {
        log.info("pausing");
        rateLimited = true;
        await wait(RATE_WAIT);
      } else {
        rateLimited = false;
      }
    } while (rateLimited);

    // Count the current request in hitrate
    const hitRatePutResult = await documentClient
      .put({
        TableName: HITRATE_TABLE,
        Item: {
          id,
          timestamp: epochNow(),
          expiresAt: epochNow() + Math.floor(RATE_PERIOD / 1000),
        },
      })
      .promise();

    log.verbose("hitRatePutResult", { hitRatePutResult });

    const imageUrl = S3.getSignedUrl("getObject", {
      Bucket,
      Key: image,
      Expires: 600, // 5 minutes
    });

    log.verbose("imageUrl", { imageUrl });

    metricsPing.timing_sent = Date.now() - Date.parse(datestamp);

    const timingReceivedStart = Date.now();
    const upstreamServiceResponse = await request.post({
      url: `${upstreamServiceUrl}?enhance`,
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": UPSTREAM_SERVICE_KEY,
      },
      json: true,
      body: {
        DataRepresentation: "URL",
        Value: imageUrl,
      },
    });
    metricsPing.timing_received = Date.now() - timingReceivedStart;
    metricsPing.photodna_tracking_id = upstreamServiceResponse.TrackingId;

    log.verbose("upstreamServiceResponse", { upstreamServiceResponse });

    const { IsMatch } = upstreamServiceResponse;
    metricsPing.is_match = IsMatch;

    if (!IsMatch) {
      // On negative match, clean up the image and request details.
      const deleteResult = await Promise.all([
        S3.deleteObject({ Bucket, Key: `${image}` }).promise(),
        S3.deleteObject({ Bucket, Key: `${image}-request.json` }).promise(),
      ]);
      log.verbose("deleteResult", { deleteResult });
    } else {
      // On positive match, store the details of the match response.
      const putResult = await S3.putObject({
        Bucket,
        Key: `${image}-response.json`,
        ContentType: "application/json",
        Body: JSON.stringify({
          id,
          user,
          negative_uri,
          positive_uri,
          positive_email,
          notes,
          image,
          response: upstreamServiceResponse,
        }),
      }).promise();

      log.verbose("putResult", { putResult });

      // Send an email alert on positive match, if addresses are available.
      const ToAddresses = [];
      if (positive_email) {
        ToAddresses.push(positive_email);
      }
      if (EMAIL_TO) {
        ToAddresses.push(EMAIL_TO);
      }
      if (EMAIL_FROM && ToAddresses.length) {
        const URL_TTL_IN_SEC = parseInt(EMAIL_EXPIRES, 10);
        const imageUrl = S3.getSignedUrl("getObject", {
          Bucket,
          Key: image,
          Expires: URL_TTL_IN_SEC,
        });

        const requestUrl = S3.getSignedUrl("getObject", {
          Bucket,
          Key: `${image}-request.json`,
          Expires: URL_TTL_IN_SEC,
        });

        const responseUrl = S3.getSignedUrl("getObject", {
          Bucket,
          Key: `${image}-response.json`,
          Expires: URL_TTL_IN_SEC,
        });

        const expirationDate = new Date(
          Date.now() + URL_TTL_IN_SEC * 1000
        ).toISOString();

        const emailParams = {
          Source: EMAIL_FROM,
          Destination: { ToAddresses },
          Message: {
            Subject: {
              Charset: "UTF-8",
              Data: emailSubject({ id, user }),
            },
            Body: {
              Text: {
                Charset: "UTF-8",
                Data: emailBody({
                  id,
                  datestamp,
                  user,
                  notes,
                  imageUrl,
                  requestUrl,
                  responseUrl,
                  expirationDate,
                  upstreamServiceResponse,
                }),
              },
            },
          },
        };
        log.verbose("emailParams", { emailParams });

        const emailResult = await SES.sendEmail(emailParams).promise();
        log.verbose("emailResult", { emailResult });
        log.info("sentEmail", { messageId: emailResult.MessageId });
      }
    }

    const timingSubmittedStart = Date.now();
    const upstreamIsError =
      !upstreamServiceResponse ||
      !upstreamServiceResponse.Status ||
      upstreamServiceResponse.Status.Code !== 3000;
    const callbackResult = await request.post({
      url: IsMatch ? positive_uri : negative_uri,
      headers: {
        "Content-Type": "application/json",
      },
      json: true,
      body: {
        watchdog_id: id,
        positive: upstreamServiceResponse.IsMatch,
        notes,
        error: upstreamIsError,
        response: upstreamServiceResponse,
      },
    });
    metricsPing.timing_submitted = Date.now() - timingSubmittedStart;
    log.verbose("callbackResult", { callbackResult });
  } catch (err) {
    Raven.captureException(err);
    metricsPing.is_error = true;
    log.error("callbackError", { err });
    throw err;
  }

  const metricsResult = await Metrics.workerWorks(metricsPing);
  log.verbose("metricsResult", { metricsResult });
  return id;
};
