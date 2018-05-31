const { expect } = require("chai");
const sinon = require("sinon");

const {
  resetMocks,
  makePromiseFn,
  mocks,
  env: { CONFIG_TABLE, QUEUE_NAME, PROCESS_QUEUE_FUNCTION },
  constants: { QueueUrl },
  constantsModule
} = global;

const awsRequestId = "test-uuid";

const { EXECUTION_MUTEX_KEY, RATE_LIMIT } = global.constantsModule;

const Metrics = require("../lib/metrics");
const pollQueue = require("./pollQueue");

const wait = delay => new Promise(resolve => setTimeout(resolve, delay));

describe("functions/pollQueue.handler", () => {
  const subject = pollQueue.handler;

  const logMethods = ["log", "warn", "info", "time", "timeEnd"];

  let metricsStub;

  beforeEach(() => {
    resetMocks();
    logMethods.forEach(name => sinon.spy(console, name));
    metricsStub = sinon.stub(Metrics, "pollerHeartbeat");
  });

  afterEach(() => {
    logMethods.forEach(name => console[name].restore());
    metricsStub.restore();
  });

  it("should exit if another instance is already running", async () => {
    mocks.putItem.returns({
      promise: () => {
        throw "Fail";
      }
    });

    await subject();

    expect(mocks.putItem.called).to.be.true;
    const putArg = mocks.putItem.firstCall.args[0];
    expect(putArg.TableName).to.equal(CONFIG_TABLE);
    expect(putArg.Item.key).to.equal(EXECUTION_MUTEX_KEY);
    expect(console.warn.firstCall.args).to.deep.equal([
      "Could not acquire execution mutex",
      "Fail"
    ]);
    expect(metricsStub.callCount).to.equal(0);
  });

  it("should exit when remaining execution time is close to exhausted", async () => {
    const getRemainingTimeInMillis = sinon.stub().returns(500);

    await subject({}, { awsRequestId, getRemainingTimeInMillis });

    expect(mocks.putItem.called).to.be.true;
    const putArg = mocks.putItem.firstCall.args[0];
    expect(mocks.putItem.firstCall.args[0].TableName).to.equal(CONFIG_TABLE);
    expect(putArg.Item.key).to.equal(EXECUTION_MUTEX_KEY);

    expect(getRemainingTimeInMillis.called).to.be.true;

    const infoArgs = console.info.args.map(([msg]) => msg);
    expect(infoArgs).to.deep.equal([
      "Execution mutex acquired",
      "Sending heartbeat metrics",
      "Poller start",
      "Poller exit",
      "Execution mutex released",
      "Sending heartbeat metrics"
    ]);

    expect(metricsStub.callCount).to.equal(2);

    expect(mocks.deleteItem.called).to.be.true;
    const deleteArg = mocks.deleteItem.firstCall.args[0];
    expect(deleteArg.TableName).to.equal(CONFIG_TABLE);
    expect(deleteArg.Key.key).to.equal(EXECUTION_MUTEX_KEY);
  });

  it("should process one message by invoking one lambda function", async () => {
    const requestId = "8675309";
    const messageBody = { requestId, testing: "testing" };
    const Messages = [{ Body: JSON.stringify(messageBody) }];

    mocks.receiveMessage.returns(makePromiseFn({ Messages }));

    const getRemainingTimeInMillis = sinon.stub();
    [20000, 2000, 200, 20].forEach((time, idx) =>
      getRemainingTimeInMillis.onCall(idx).returns(time)
    );

    Object.assign(constantsModule, {
      POLL_DELAY: 10
    });

    await subject({}, { awsRequestId, getRemainingTimeInMillis });

    expect(mocks.getQueueUrl.called).to.be.true;
    expect(mocks.getQueueUrl.lastCall.args[0]).to.deep.equal({
      QueueName: QUEUE_NAME
    });

    expect(mocks.receiveMessage.callCount).to.equal(1);
    expect(mocks.receiveMessage.lastCall.args[0]).to.deep.include({
      QueueUrl,
      MaxNumberOfMessages: RATE_LIMIT,
      MessageAttributeNames: ["All"]
    });

    expect(mocks.invoke.callCount).to.equal(1);
    expect(mocks.invoke.args[0][0]).to.deep.equal({
      FunctionName: PROCESS_QUEUE_FUNCTION,
      InvocationType: "Event",
      LogType: "None",
      Payload: JSON.stringify(Messages[0])
    });

    const infoArgs = console.info.args.map(([msg]) => msg);
    expect(infoArgs).to.deep.equal([
      "Execution mutex acquired",
      "Sending heartbeat metrics",
      "Poller start",
      "Sending heartbeat metrics",
      "Pausing for",
      "Remaining",
      "Poller exit",
      "Execution mutex released",
      "Sending heartbeat metrics"
    ]);

    expect(metricsStub.callCount).to.equal(3);
    const metricsCall = metricsStub.args[0][0];
    expect(metricsCall.poller_id).to.equal(awsRequestId);
    expect(metricsCall).to.include.keys(
      "items_in_queue",
      "items_in_progress",
      "items_in_waiting"
    );

    const timeEndArgs = console.timeEnd.args.map(([msg]) => msg);
    expect(timeEndArgs).to.deep.equal([
      "SQS",
      `Message ${requestId}`,
      "Worker batch",
      "pollQueue 1"
    ]);
  });

  it("should respect rate limiting in message processing", async () => {
    Object.assign(constantsModule, {
      RATE_LIMIT: 5,
      RATE_PERIOD: 250,
      MAX_LONG_POLL_PERIOD: 20,
      POLL_DELAY: 50
    });

    const testMessages = [];
    for (let i = 0; i < 20; i++) {
      testMessages.push({
        Body: JSON.stringify({ requestId: i, testing: "testing" })
      });
    }

    const mockReceiveMessage = ({ MaxNumberOfMessages }) => ({
      promise: async () => {
        await wait(50);
        return { Messages: testMessages.splice(0, MaxNumberOfMessages) };
      }
    });

    mocks.receiveMessage.callsFake(mockReceiveMessage);

    const executionPeriod = 1500;
    const limitTime = Date.now() + executionPeriod;
    const getRemainingTimeInMillis = sinon
      .stub()
      .callsFake(() => limitTime - Date.now());

    const startTime = Date.now();
    await subject({}, { awsRequestId, getRemainingTimeInMillis });
    const endTime = Date.now();

    const duration = endTime - startTime;
    const calls = mocks.invoke.callCount;
    const resultRate = calls / (duration / constantsModule.RATE_PERIOD);
    const yieldMessages = console.log.args.filter(([msg]) =>
      msg.includes("Yielding")
    );

    expect(resultRate < constantsModule.RATE_LIMIT).to.be.true;
    expect(yieldMessages.length > 0).to.be.true;
  });
});
