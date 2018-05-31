"use strict";

const AWS = require("aws-sdk");
const S3 = new AWS.S3({ apiVersion: "2006-03-01" });
const SQS = new AWS.SQS({ apiVersion: "2012-11-05" });
const request = require("request-promise-native");
const Metrics = require("../lib/metrics");

module.exports.handler = async function(
  { ReceiptHandle, Body },
  { awsRequestId }
) {
  const {
    QUEUE_NAME,
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
  } = JSON.parse(Body);

  try {
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

    const { QueueUrl } = await SQS.getQueueUrl({
      QueueName: QUEUE_NAME
    }).promise();

    await SQS.deleteMessage({ QueueUrl, ReceiptHandle }).promise();

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
  } catch (err) {
    console.log("REQUEST ERROR", err);
  }
};
