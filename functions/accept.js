"use strict";

const Hawk = require("hawk");
const AWS = require("aws-sdk");
const S3 = new AWS.S3({ apiVersion: "2006-03-01" });
const SQS = new AWS.SQS({ apiVersion: "2012-11-05" });
const documentClient = new AWS.DynamoDB.DocumentClient();
const { DEV_CREDENTIALS, DEFAULT_HAWK_ALGORITHM } = require("../lib/constants");

module.exports.post = async function(event, context) {
  const { NODE_ENV, QUEUE_NAME, CONTENT_BUCKET } = process.env;
  const {
    headers,
    // body,
    queryStringParameters,
    requestContext: { path, requestId }
  } = event;
  const {
    Host: host,
    Authorization: authorization,
    "X-Forwarded-Port": port = 80
  } = headers;

  const responseBody = { requestId, env: NODE_ENV };

  try {
    responseBody.hawk = await authenticate({
      method: "POST",
      path,
      queryStringParameters,
      host,
      port,
      authorization
    });
  } catch (err) {
    return response(
      401,
      { error: err.message },
      { "WWW-Authenticate": "Hawk" }
    );
  }

  const result = await S3.putObject({
    Bucket: CONTENT_BUCKET,
    Key: requestId,
    Body: "THIS WILL BE AN IMAGE SOMEDAY"
  }).promise();
  responseBody.s3Result = result;

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

  return response(200, responseBody);
};

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: Object.assign({ "Content-Type": "application/json" }, headers),
    body: JSON.stringify(body)
  };
}

async function authenticate({
  method = "POST",
  path,
  queryStringParameters,
  host,
  port,
  authorization
}) {
  const request = {
    method,
    url: path,
    host,
    port,
    authorization
  };
  return Hawk.server.authenticate(request, lookupCredentials, {});
}

// In-memory credentials lookup cache, only lasts until next deployment or
// container is recycled. Saves a DynamoDB hit and ~900ms for most requests
const credentialsCache = {};

async function lookupCredentials(id) {
  const {
    ENABLE_DEV_AUTH,
    DISABLE_AUTH_CACHE,
    CREDENTIALS_TABLE: TableName
  } = process.env;

  let out;

  if (ENABLE_DEV_AUTH === "1" && id in DEV_CREDENTIALS) {
    out = DEV_CREDENTIALS[id];
  } else if (DISABLE_AUTH_CACHE !== "1" && id in credentialsCache) {
    out = credentialsCache[id];
  } else {
    const result = await documentClient
      .get({
        TableName,
        Key: { id },
        AttributesToGet: ["key", "algorithm"]
      })
      .promise();
    if (!result.Item) {
      out = null;
    } else {
      const {
        Item: { key, algorithm = DEFAULT_HAWK_ALGORITHM }
      } = result;
      out = credentialsCache[id] = { id, key, algorithm };
    }
  }

  return out;
}
