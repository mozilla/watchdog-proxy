"use strict";

const AWS = require("aws-sdk");
const S3 = new AWS.S3({ apiVersion: "2006-03-01" });
const SQS = new AWS.SQS({ apiVersion: "2012-11-05" });
const request = require("request-promise-native");

module.exports.handler = async function({ ReceiptHandle, Body }) {
  const { QUEUE_NAME, CONTENT_BUCKET, UPSTREAM_SERVICE_KEY } = process.env;

  const {
    upstreamServiceUrl,
    id,
    // user,
    negative_uri,
    positive_uri,
    // positive_email,
    // notes,
    image
  } = JSON.parse(Body);

  try {
    const imageUrl = S3.getSignedUrl("getObject", {
      Bucket: CONTENT_BUCKET,
      Key: image
    });

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

    await request.post({
      url: upstreamServiceResponse.IsMatch ? positive_uri : negative_uri,
      headers: {
        "Content-Type": "application/json"
      },
      json: true,
      body: {
        watchdog_id: id,
        positive: upstreamServiceResponse.IsMatch
      }
    });

    const { QueueUrl } = await SQS.getQueueUrl({
      QueueName: QUEUE_NAME
    }).promise();

    await SQS.deleteMessage({ QueueUrl, ReceiptHandle }).promise();
  } catch (err) {
    console.log("REQUEST ERROR", err);
  }
};
