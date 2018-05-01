"use strict";

const AWS = require("aws-sdk");
const DBD = new AWS.DynamoDB.DocumentClient();
const SQS = new AWS.SQS({ apiVersion: "2012-11-05" });
const Lambda = new AWS.Lambda({ apiVersion: "2015-03-31" });

const { CONFIG_TABLE, QUEUE_NAME, PROCESS_QUEUE_FUNCTION } = process.env;

const RATE_LIMIT = 5;
const RATE_PERIOD = 1000;
const MAX_LONG_POLL_PERIOD = 20;
const POLL_DELAY = 100;
const EXECUTION_MUTEX_KEY = "pollQueueExecutionExpires";
const EXECUTION_MUTEX_TTL = 50 * 1000;

const wait = delay => new Promise(resolve => setTimeout(resolve, delay));

// Running list of timestamps for hits on rate limit
let rateHits = [];

module.exports.handler = async function(event, context) {
  const now = Date.now();

  try {
    await DBD.put({
      TableName: CONFIG_TABLE,
      Item: {
        key: EXECUTION_MUTEX_KEY,
        value: now + EXECUTION_MUTEX_TTL
      },
      ConditionExpression: "#key <> :key OR (#key = :key AND #value < :value)",
      ExpressionAttributeNames: { "#key": "key", "#value": "value" },
      ExpressionAttributeValues: {
        ":key": EXECUTION_MUTEX_KEY,
        ":value": Date.now()
      }
    }).promise();
  } catch (err) {
    console.warn("Could not acquire execution mutex", err);
    return;
  }
  console.info("Execution mutex acquired");

  let polls = 0;
  console.log("Poller start");
  do {
    try {
      const tname = `pollQueue ${++polls}`;
      console.time(tname);
      await pollQueue(context);
      console.timeEnd(tname);
    } catch (err) {
      console.error("Error in pollQueue", err);
      return;
    }
    await wait(POLL_DELAY);
    console.log("Remaining", context.getRemainingTimeInMillis(), "ms");
  } while (Math.floor(context.getRemainingTimeInMillis() / 1000) > 1);
  console.log("Poller exit");

  try {
    await DBD.delete({
      TableName: CONFIG_TABLE,
      Key: { key: EXECUTION_MUTEX_KEY }
    }).promise();
  } catch (err) {
    console.warn("Could not release execution mutex", err);
    return;
  }
  console.info("Execution mutex released");
};

async function pollQueue(context) {
  // Calculate seconds remaining for poller execution, using maximum for
  // long poll or whatever time we have left
  const WaitTimeSeconds = Math.min(
    MAX_LONG_POLL_PERIOD,
    Math.floor(context.getRemainingTimeInMillis() / 1000) - 1
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
