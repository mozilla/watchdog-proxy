"use strict";

const AWS = require("aws-sdk");
const SQS = new AWS.SQS({ apiVersion: "2012-11-05" });
const Metrics = require("../lib/metrics");
const { logDebug, logInfo, jsonPretty, wait } = require("../lib/utils.js");

module.exports.handler = async function(event, context) {
  const { DEFAULT_METRICS_PING_PERIOD } = require("../lib/constants");

  const { METRICS_PING_PERIOD } = process.env;

  const pingPeriod =
    parseInt(METRICS_PING_PERIOD, 10) || DEFAULT_METRICS_PING_PERIOD;

  let pingCount = 0;
  logInfo("Periodic metrics monitor start");
  while (context.getRemainingTimeInMillis() > pingPeriod + 1000) {
    try {
      await sendHeartbeatMetrics(process.env, context);
      pingCount++;
    } catch (err) {
      logInfo("Failed to send periodic metrics", err);
    }
    logDebug(
      "Pausing for",
      pingPeriod,
      "ms",
      context.getRemainingTimeInMillis(),
      "ms remaining"
    );
    await wait(pingPeriod);
  }
  logInfo(`Periodic metrics monitor exit, pingCount=${pingCount}`);
};

const sendHeartbeatMetrics = async (
  { QUEUE_NAME },
  { awsRequestId: poller_id }
) => {
  const apiStartTime = Date.now();
  const { QueueUrl } = await SQS.getQueueUrl({
    QueueName: QUEUE_NAME,
  }).promise();
  const attribsResult = await SQS.getQueueAttributes({
    QueueUrl,
    AttributeNames: [
      "ApproximateNumberOfMessages",
      "ApproximateNumberOfMessagesDelayed",
      "ApproximateNumberOfMessagesNotVisible",
    ],
  }).promise();
  const apiEndTime = Date.now();
  logDebug("SQS.getQueueAttributes duration", apiEndTime - apiStartTime, "ms");

  const {
    ApproximateNumberOfMessages,
    ApproximateNumberOfMessagesDelayed,
    ApproximateNumberOfMessagesNotVisible,
  } = attribsResult.Attributes || {};

  const pingData = {
    poller_id,
    items_in_queue: parseInt(ApproximateNumberOfMessages, 10),
    items_in_progress: parseInt(ApproximateNumberOfMessagesNotVisible, 10),
    items_in_waiting: parseInt(ApproximateNumberOfMessagesDelayed, 10),
  };
  logDebug("pingData", jsonPretty(pingData));
  return Metrics.pollerHeartbeat(pingData);
};
