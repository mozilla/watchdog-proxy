"use strict";

const AWS = require("aws-sdk");
const SQS = new AWS.SQS({ apiVersion: "2012-11-05" });
const Sentry = require("../lib/sentry");
const Metrics = require("../lib/metrics");
const { wait } = require("../lib/utils.js");

const Raven = Sentry();

module.exports.handler = async function(event = {}, context = {}) {
  const log = require("../lib/logging")({
    name: "periodicMetrics",
    event,
    context,
  });

  const { DEFAULT_METRICS_PING_PERIOD } = require("../lib/constants");

  const { METRICS_PING_PERIOD } = process.env;

  const pingPeriod =
    parseInt(METRICS_PING_PERIOD, 10) || DEFAULT_METRICS_PING_PERIOD;

  let pingCount = 0;
  log.debug("start");
  while (context.getRemainingTimeInMillis() > pingPeriod + 1000) {
    try {
      await sendHeartbeatMetrics(log, process.env, context);
      pingCount++;
    } catch (err) {
      Raven.captureException(err);
      log.error("error", { err });
    }
    log.verbose("pause", {
      pingPeriod,
      remaining: context.getRemainingTimeInMillis(),
    });
    await wait(pingPeriod);
  }
  log.verbose("exit", { pingCount });
  log.info("summary");
};

const sendHeartbeatMetrics = async (
  log,
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
  log.debug("getQueueAttributesDuration", {
    duration: apiEndTime - apiStartTime,
  });

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
  log.debug("pingData", { pingData });
  return Metrics.pollerHeartbeat(pingData);
};
