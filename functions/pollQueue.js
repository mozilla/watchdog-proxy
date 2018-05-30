"use strict";

const AWS = require("aws-sdk");
const DBD = new AWS.DynamoDB.DocumentClient();
const SQS = new AWS.SQS({ apiVersion: "2012-11-05" });
const Lambda = new AWS.Lambda({ apiVersion: "2015-03-31" });

// Running list of timestamps for hits on rate limit
let rateHits;

module.exports.handler = async function(event, context) {
  const constants = require("../lib/constants");
  const { POLL_DELAY } = constants;

  try {
    await acquireExecutionLock(process.env, constants);
  } catch (err) {
    console.warn("Could not acquire execution mutex", err);
    return;
  }
  console.info("Execution mutex acquired");

  rateHits = [];
  let polls = 0;
  console.info("Poller start");
  while (Math.floor(context.getRemainingTimeInMillis() / 1000) >= 1) {
    try {
      const tname = `pollQueue ${++polls}`;
      console.time(tname);
      await pollQueue(process.env, constants, context);
      console.timeEnd(tname);
    } catch (err) {
      console.error("Error in pollQueue", err);
      return;
    }
    console.info("Pausing for", POLL_DELAY, "ms");
    await wait(POLL_DELAY);
    console.info("Remaining", context.getRemainingTimeInMillis(), "ms");
  }
  console.info("Poller exit");

  try {
    await releaseExecutionLock(process.env, constants);
  } catch (err) {
    console.warn("Could not release execution mutex", err);
    return;
  }
  console.info("Execution mutex released");
};

const wait = delay => new Promise(resolve => setTimeout(resolve, delay));

const acquireExecutionLock = (
  { CONFIG_TABLE },
  { EXECUTION_MUTEX_KEY, EXECUTION_MUTEX_TTL }
) =>
  DBD.put({
    TableName: CONFIG_TABLE,
    Item: {
      key: EXECUTION_MUTEX_KEY,
      value: Date.now() + EXECUTION_MUTEX_TTL
    },
    ConditionExpression: "#key <> :key OR (#key = :key AND #value < :value)",
    ExpressionAttributeNames: { "#key": "key", "#value": "value" },
    ExpressionAttributeValues: {
      ":key": EXECUTION_MUTEX_KEY,
      ":value": Date.now()
    }
  }).promise();

const releaseExecutionLock = (
  { CONFIG_TABLE },
  { EXECUTION_MUTEX_KEY, EXECUTION_MUTEX_TTL }
) =>
  DBD.delete({
    TableName: CONFIG_TABLE,
    Key: { key: EXECUTION_MUTEX_KEY }
  }).promise();

async function pollQueue(
  { QUEUE_NAME, PROCESS_QUEUE_FUNCTION },
  { MAX_LONG_POLL_PERIOD, RATE_PERIOD, RATE_LIMIT },
  context
) {
  // Calculate seconds remaining for poller execution, using maximum for
  // long poll or whatever time we have left
  const WaitTimeSeconds = Math.min(
    MAX_LONG_POLL_PERIOD,
    Math.floor(context.getRemainingTimeInMillis() / 1000)
  );
  if (WaitTimeSeconds <= 0) {
    console.log("Out of time");
    return;
  }

  // Slide the rate limit window and calculate available hits
  const rateWindowStart = Date.now() - RATE_PERIOD;
  rateHits = rateHits.filter(item => item > rateWindowStart);
  const MaxNumberOfMessages = RATE_LIMIT - rateHits.length;
  if (MaxNumberOfMessages <= 0) {
    console.log("Yielding to limit rate");
    return;
  }

  // Long-poll for SQS messages up to rate limit or execution timeout
  console.time("SQS");
  const { QueueUrl } = await SQS.getQueueUrl({
    QueueName: QUEUE_NAME
  }).promise();
  const receiveResult = await SQS.receiveMessage({
    QueueUrl,
    WaitTimeSeconds,
    MaxNumberOfMessages,
    MessageAttributeNames: ["All"]
  }).promise();
  console.timeEnd("SQS");

  // Process the messages received from queue
  const messages = receiveResult.Messages || [];
  if (messages.length > 0) {
    // Invoke the workers in parallel, since we're only ever going
    // to invoke up to the rate limit
    console.time("Worker batch");
    await Promise.all(
      messages.map(async message => {
        const messageBody = JSON.parse(message.Body);

        const mtname = `Message ${messageBody.requestId}`;
        console.time(mtname);

        // Record a hit for rate limit
        rateHits.push(Date.now());

        // Invoke the process function for queue item
        await Lambda.invoke({
          FunctionName: PROCESS_QUEUE_FUNCTION,
          InvocationType: "Event",
          LogType: "None",
          Payload: JSON.stringify(message)
        }).promise();

        console.timeEnd(mtname);
      })
    );
    console.timeEnd("Worker batch");
  }
}
