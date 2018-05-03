"use strict";

const AWS = require("aws-sdk");
const S3 = new AWS.S3({ apiVersion: "2006-03-01" });
const SQS = new AWS.SQS({ apiVersion: "2012-11-05" });

const { QUEUE_NAME, CONTENT_BUCKET } = process.env;
module.exports.handler = async function(
  { requestContext: { requestId } },
  context
) {
  console.time("accept");
  const responseCode = 200;
  const responseBody = { requestId };

  console.time("acceptS3");
  const result = await S3.putObject({
    Bucket: CONTENT_BUCKET,
    Key: requestId,
    Body: "THIS WILL BE AN IMAGE SOMEDAY"
  }).promise();
  responseBody.s3Result = result;
  console.timeEnd("acceptS3");

  console.time("acceptSQS");
  const { QueueUrl } = await SQS.getQueueUrl({
    QueueName: QUEUE_NAME
  }).promise();
  const { MessageId } = await SQS.sendMessage({
    MessageBody: JSON.stringify({
      nowish: Date.now(),
      requestId
    }),
    QueueUrl
  }).promise();
  responseBody.sqsResult = "SUCCESS " + MessageId;
  console.timeEnd("acceptSQS");

  console.timeEnd("accept");
  return {
    statusCode: responseCode,
    body: JSON.stringify(responseBody)
  };
};
