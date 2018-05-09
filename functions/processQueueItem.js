"use strict";

const AWS = require("aws-sdk");
const S3 = new AWS.S3({ apiVersion: "2006-03-01" });
const SQS = new AWS.SQS({ apiVersion: "2012-11-05" });
const request = require("request-promise-native");

module.exports.handler = async function({ ReceiptHandle, Body }) {
  const { QUEUE_NAME, CONTENT_BUCKET, UPSTREAM_SERVICE_URL } = process.env;

  const {
    id,
    user,
    negative_uri,
    positive_uri,
    positive_email,
    notes,
    image
  } = JSON.parse(Body);

  console.log("MESSAGE BODY", {
    id,
    user,
    negative_uri,
    positive_uri,
    positive_email,
    notes,
    image
  });

  try {
    const imageKey = `image-${id}`;

    const getResult = await S3.getObject({
      Bucket: CONTENT_BUCKET,
      Key: imageKey
    }).promise();
    console.log("GET", getResult);

    await S3.deleteObject({
      Bucket: CONTENT_BUCKET,
      Key: imageKey
    }).promise();

    await request.get(`${UPSTREAM_SERVICE_URL}?id=${id}`);
  } catch (err) {
    console.log("REQUEST ERROR", err);
  }

  const { QueueUrl } = await SQS.getQueueUrl({
    QueueName: QUEUE_NAME
  }).promise();
  await SQS.deleteMessage({ QueueUrl, ReceiptHandle }).promise();
};
