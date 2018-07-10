"use strict";

const AWS = require("aws-sdk");
const S3 = new AWS.S3({ apiVersion: "2006-03-01" });
const documentClient = new AWS.DynamoDB.DocumentClient();
const request = require("request-promise-native");
const { RATE_LIMIT, RATE_PERIOD, RATE_WAIT } = require("../lib/constants");
const Metrics = require("../lib/metrics");

exports.handler = async function({ Records }, context) {
  console.log("Received", Records.length, "messages to process");
  const results = [];
  for (let idx = 0; idx < Records.length; idx++) {
    const result = await exports.handleOne(Records[idx], context);
    results.push(result);
  }
  console.log("Finished processing batch of", results.length, "messages");
  return results;
};

const wait = delay => new Promise(resolve => setTimeout(resolve, delay));
const epochNow = () => Math.floor(Date.now() / 1000);

exports.handleOne = async function({ receiptHandle, body }, { awsRequestId }) {
  const {
    HITRATE_TABLE,
    CONTENT_BUCKET: Bucket,
    UPSTREAM_SERVICE_KEY
  } = process.env;

  const {
    datestamp,
    upstreamServiceUrl,
    id,
    user,
    negative_uri,
    positive_uri,
    positive_email,
    notes,
    image
  } = JSON.parse(body);

  console.log("Processing queue item", id);

  try {
    // Pause if we're at the rate limit for current expiration window
    let rateLimited = false;
    do {
      const data = await documentClient
        .scan({
          TableName: HITRATE_TABLE,
          FilterExpression: "expiresAt > :now",
          ExpressionAttributeValues: { ":now": epochNow() }
        })
        .promise();
      if (data.Count >= RATE_LIMIT) {
        console.log("Pausing for rate limit", epochNow());
        rateLimited = true;
        await wait(RATE_WAIT);
      } else {
        rateLimited = false;
      }
    } while (rateLimited);

    // Count the current request in hitrate
    await documentClient
      .put({
        TableName: HITRATE_TABLE,
        Item: {
          id,
          timestamp: epochNow(),
          expiresAt: epochNow() + Math.floor(RATE_PERIOD / 1000)
        }
      })
      .promise();

    const imageUrl = S3.getSignedUrl("getObject", {
      Bucket,
      Key: image
    });

    const timingSent = Date.now() - Date.parse(datestamp);

    const timingReceivedStart = Date.now();
    const upstreamServiceResponse = await request.post({
      url: `${upstreamServiceUrl}?enhance`,
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": UPSTREAM_SERVICE_KEY
      },
      json: true,
      body: {
        DataRepresentation: "URL",
        Value: imageUrl
      }
    });
    const timingReceived = Date.now() - timingReceivedStart;

    const { IsMatch } = upstreamServiceResponse;
    if (!IsMatch) {
      // On negative match, clean up the image and request details.
      await Promise.all([
        S3.deleteObject({ Bucket, Key: `${image}` }).promise(),
        S3.deleteObject({ Bucket, Key: `${image}-request.json` }).promise()
      ]);
    } else {
      // On positive match, store the details of the match response.
      await S3.putObject({
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
          response: upstreamServiceResponse
        })
      }).promise();
    }

    const timingSubmittedStart = Date.now();
    await request.post({
      url: IsMatch ? positive_uri : negative_uri,
      headers: {
        "Content-Type": "application/json"
      },
      json: true,
      body: {
        watchdog_id: id,
        positive: upstreamServiceResponse.IsMatch
      }
    });
    const timingSubmitted = Date.now() - timingSubmittedStart;

    await Metrics.workerWorks({
      consumer_name: user,
      worker_id: awsRequestId,
      watchdog_id: id,
      photodna_tracking_id: upstreamServiceResponse.TrackingId,
      is_error: false,
      is_match: upstreamServiceResponse.IsMatch,
      timing_sent: timingSent,
      timing_received: timingReceived,
      timing_submitted: timingSubmitted
    });

    return id;
  } catch (err) {
    console.log("REQUEST ERROR", err);
    throw err;
  }
};
