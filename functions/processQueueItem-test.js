const { expect } = require("chai");
const sinon = require("sinon");
const AWS = require("aws-sdk");
const request = require("request-promise-native");

const {
  mocks,
  env: { CREDENTIALS_TABLE, QUEUE_NAME, CONTENT_BUCKET, UPSTREAM_SERVICE_URL },
  constants: { QueueUrl, MessageId, ReceiptHandle }
} = global;

// NOTE: Import the test subject as late as possible so that the mocks work
const processQueueItem = require("./processQueueItem");

describe("functions/processQueueItem.handler", () => {
  beforeEach(() => {
    global.resetMocks();
  });

  it("should exist", async () => {
    expect(processQueueItem.handler).to.not.be.undefined;
  });

  it("should make a request to the upstream service and original client", async () => {
    const Body = makeBody();

    const result = await processQueueItem.handler({ ReceiptHandle, Body });

    console.log("RESULT", result);

    const imageKey = `image-${defaultMessage.id}`;

    expect(mocks.getObject.args[0][0]).to.deep.equal({
      Bucket: CONTENT_BUCKET,
      Key: imageKey
    });

    expect(mocks.deleteObject.args[0][0]).to.deep.equal({
      Bucket: CONTENT_BUCKET,
      Key: imageKey
    });

    expect(mocks.requestGet.lastCall.args[0]).to.equal(
      `${UPSTREAM_SERVICE_URL}?id=${defaultMessage.id}`
    );

    expect(mocks.getQueueUrl.lastCall.args[0]).to.deep.equal({
      QueueName: QUEUE_NAME
    });

    expect(mocks.deleteMessage.lastCall.args[0]).to.deep.equal({
      QueueUrl,
      ReceiptHandle
    });
  });
});

const defaultMessage = {
  id: "8675309",
  user: "devuser",
  negative_uri: "https://example.com/negative?id=123",
  positive_uri: "https://example.com/positive?id=123",
  image: "123-456-789-1011"
};

const makeBody = (message = {}) =>
  JSON.stringify(Object.assign({}, defaultMessage, message));
