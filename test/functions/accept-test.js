// const { URL } = require("url");
const { expect } = require("chai");
const sinon = require("sinon");
const Hawk = require("hawk");
const AWS = require("aws-sdk");

const {
  DEV_CREDENTIALS,
  DEFAULT_HAWK_ALGORITHM
} = require("../../lib/constants");

const mocks = {
  putObject: (AWS.S3.prototype.putObject = sinon.stub()),
  getQueueUrl: (AWS.SQS.prototype.getQueueUrl = sinon.stub()),
  sendMessage: (AWS.SQS.prototype.sendMessage = sinon.stub()),
  getItem: (AWS.DynamoDB.DocumentClient.prototype.get = sinon.stub())
};

const accept = require("../../functions/accept");

const mkp = out => ({ promise: () => Promise.resolve(out) });

const CREDENTIALS_TABLE = "test-credentials";
const QUEUE_NAME = "test-queue";
const CONTENT_BUCKET = "test-bucket";
const QueueUrl = "https://example.com/sqs/";
const ETag = '"abcdef1234567890"';
const MessageId = "abba123";
const requestId = "8675309";

describe("functions/accept.post", () => {
  beforeEach(() => {
    Object.assign(process.env, {
      QUEUE_NAME,
      CONTENT_BUCKET,
      CREDENTIALS_TABLE
    });
    mocks.putObject.returns(mkp({ ETag }));
    mocks.getQueueUrl.returns(mkp({ QueueUrl }));
    mocks.sendMessage.returns(mkp({ MessageId }));
    mocks.getItem.returns(mkp({}));
    Object.values(mocks).forEach(mock => mock.resetHistory());
  });

  const acceptPost = async ({
    httpMethod,
    proto,
    host,
    port,
    path,
    id,
    key,
    algorithm,
    body
  }) => {
    const hawkResult = Hawk.client.header(
      `${proto}://${host}:${port}${path}`,
      httpMethod,
      { credentials: { id, key, algorithm } }
    );
    const headers = {
      Host: host,
      "X-Forwarded-Port": port,
      Authorization: hawkResult.header
    };
    return accept.post(
      { path, httpMethod, headers, body, requestContext: { path, requestId } },
      {}
    );
  };

  describe("Hawk authentication", () => {
    const expectHawkUnauthorized = result => {
      expect(result.statusCode).to.equal(401);
      expect(result.headers["WWW-Authenticate"]).to.equal("Hawk");
    };

    it("responds with 401 Unauthorized with disabled dev credentials", async () => {
      process.env.ENABLE_DEV_AUTH = null;
      process.env.DISABLE_AUTH_CACHE = "1";
      const id = "devuser";
      const { key, algorithm } = DEV_CREDENTIALS[id];
      const result = await acceptPost({
        httpMethod: "POST",
        proto: "https",
        host: "example.com",
        port: 443,
        path: "/prod/accept",
        id,
        key,
        algorithm
      });
      expectHawkUnauthorized(result);
    });

    it("responds with 401 Unauthorized with bad id", async () => {
      process.env.ENABLE_DEV_AUTH = "1";
      process.env.DISABLE_AUTH_CACHE = "1";

      const badid = "somerando";
      const key = "realkey";

      mocks.getItem.returns(mkp({}));

      const result = await acceptPost({
        httpMethod: "POST",
        proto: "https",
        host: "example.com",
        port: 443,
        path: "/prod/accept",
        id: badid,
        key,
        algorithm: DEFAULT_HAWK_ALGORITHM
      });

      expect(mocks.getItem.lastCall.args[0]).to.deep.equal({
        TableName: CREDENTIALS_TABLE,
        Key: { id: badid },
        AttributesToGet: ["key", "algorithm"]
      });
      expectHawkUnauthorized(result);
    });

    it("responds with 401 Unauthorized with bad key", async () => {
      process.env.ENABLE_DEV_AUTH = "1";
      process.env.DISABLE_AUTH_CACHE = "1";

      const id = "realuser";
      const key = "realkey";
      const badkey = "badkey";
      const algorithm = "sha256";

      mocks.getItem.returns(mkp({ Item: { key, algorithm } }));

      const result = await acceptPost({
        httpMethod: "POST",
        proto: "https",
        host: "example.com",
        port: 443,
        path: "/prod/accept",
        id,
        key: badkey,
        algorithm: DEFAULT_HAWK_ALGORITHM
      });

      expect(mocks.getItem.lastCall.args[0]).to.deep.equal({
        TableName: CREDENTIALS_TABLE,
        Key: { id },
        AttributesToGet: ["key", "algorithm"]
      });
      expectHawkUnauthorized(result);
    });

    it("responds with 200 OK with enabled dev credentials", async () => {
      process.env.ENABLE_DEV_AUTH = "1";
      process.env.DISABLE_AUTH_CACHE = "1";
      const id = "devuser";
      const { key, algorithm } = DEV_CREDENTIALS[id];
      const result = await acceptPost({
        httpMethod: "POST",
        proto: "https",
        host: "example.com",
        port: 443,
        path: "/prod/accept",
        id,
        key,
        algorithm
      });

      expect(mocks.putObject.args[0][0]).to.deep.equal({
        Bucket: CONTENT_BUCKET,
        Key: requestId,
        Body: "THIS WILL BE AN IMAGE SOMEDAY"
      });
      expect(mocks.getQueueUrl.args[0][0]).to.deep.equal({
        QueueName: QUEUE_NAME
      });
      const message = mocks.sendMessage.args[0][0];
      const messageBody = JSON.parse(message.MessageBody);
      expect(messageBody.requestId).to.equal(requestId);
      expect(message.QueueUrl).to.equal(QueueUrl);
      expect(result.statusCode).to.equal(200);
    });

    it("responds with 200 OK with real valid credentials", async () => {
      process.env.ENABLE_DEV_AUTH = "1";
      process.env.DISABLE_AUTH_CACHE = "1";

      const id = "realuser";
      const key = "realkey";
      const algorithm = "sha256";

      mocks.getItem.returns(mkp({ Item: { key, algorithm } }));

      const result = await acceptPost({
        httpMethod: "POST",
        proto: "https",
        host: "example.com",
        port: 443,
        path: "/prod/accept",
        id,
        key,
        algorithm
      });

      expect(mocks.getItem.lastCall.args[0]).to.deep.equal({
        TableName: CREDENTIALS_TABLE,
        Key: { id },
        AttributesToGet: ["key", "algorithm"]
      });
      expect(result.statusCode).to.equal(200);
    });
  });
});
