"use strict";

const AWS = require("aws-sdk");
const S3 = new AWS.S3({ apiVersion: "2006-03-01" });
const SQS = new AWS.SQS({ apiVersion: "2012-11-05" });
const request = require("request-promise-native");
const { QUEUE_NAME, CONTENT_BUCKET } = process.env;

module.exports.handler = async function({ ReceiptHandle, Body }, context) {
  const { requestId } = JSON.parse(Body);

  console.log("MESSAGE BODY", requestId);

  try {
    const getResult = await S3.getObject({
      Bucket: CONTENT_BUCKET,
      Key: requestId
    }).promise();
    console.log("GET", getResult);

    await S3.deleteObject({
      Bucket: CONTENT_BUCKET,
      Key: requestId
    }).promise();

    await request(
      `https://webhook.site/c0a8dd46-1405-4172-a99a-0646663f3dc2?requestId=${requestId}`
    );
  } catch (err) {
    console.log("REQUEST ERROR", err);
  }

  const { QueueUrl } = await SQS.getQueueUrl({
    QueueName: QUEUE_NAME
  }).promise();
  await SQS.deleteMessage({ QueueUrl, ReceiptHandle }).promise();
};
