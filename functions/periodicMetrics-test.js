const { expect } = require("chai");
const sinon = require("sinon");

const { resetMocks, mocks, constants } = global;

const periodicMetrics = require("./periodicMetrics");

describe("functions/periodicMetrics.handler", () => {
  const subject = periodicMetrics.handler;

  beforeEach(() => {
    resetMocks();
  });

  it("should exit when execution time is close to expired", async () => {
    process.env.METRICS_PING_PERIOD = 100;
    const event = {};
    const getRemainingTimeInMillis = sinon.stub().returns(100);
    const context = {
      awsRequestId: "foo",
      getRemainingTimeInMillis,
    };

    await subject(event, context);

    const sqsCalls = mocks.getQueueAttributes.args;
    expect(sqsCalls.length).to.equal(0);
  });

  it("should send a metrics ping based on queue status", async () => {
    const event = {};
    const getRemainingTimeInMillis = sinon
      .stub()
      .onCall(0)
      .returns(1101)
      .onCall(1)
      .returns(90);
    const context = {
      awsRequestId: "foo",
      getRemainingTimeInMillis,
    };

    await subject(event, context);

    const sqsCalls = mocks.getQueueAttributes.args;
    expect(sqsCalls.length).to.equal(1);

    const postCalls = mocks.requestPost.args;
    expect(postCalls.length).to.equal(1);

    const {
      ApproximateNumberOfMessages,
      ApproximateNumberOfMessagesDelayed,
      ApproximateNumberOfMessagesNotVisible,
    } = constants.QueueAttributes;

    expect(postCalls[0][0].body).to.deep.include({
      event: "poller_heartbeat",
      poller_id: context.awsRequestId,
      items_in_queue: ApproximateNumberOfMessages,
      items_in_waiting: ApproximateNumberOfMessagesDelayed,
      items_in_progress: ApproximateNumberOfMessagesNotVisible,
    });
  });
});
