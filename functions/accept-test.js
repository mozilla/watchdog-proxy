const { expect } = require("chai");
const Hawk = require("hawk");

const { DEV_CREDENTIALS, DEFAULT_HAWK_ALGORITHM } = require("../lib/constants");

const {
  mocks,
  makePromiseFn,
  env: { UPSTREAM_SERVICE_URL, CREDENTIALS_TABLE, QUEUE_NAME, CONTENT_BUCKET },
  constants: { QueueUrl, requestId }
} = global;

const accept = require("./accept");

describe("functions/accept.post", () => {
  beforeEach(() => {
    global.resetMocks();
    process.env.ENABLE_DEV_AUTH = "1";
    process.env.DISABLE_AUTH_CACHE = "1";
  });

  describe("Hawk authentication", () => {
    const expectHawkUnauthorized = result => {
      expect(result.statusCode).to.equal(401);
      expect(result.headers["WWW-Authenticate"]).to.equal("Hawk");
    };

    it("responds with 401 Unauthorized with disabled dev credentials", async () => {
      process.env.ENABLE_DEV_AUTH = null;

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
      const badid = "somerando";
      const key = "realkey";

      mocks.getItem.returns(makePromiseFn({}));

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
      const id = "realuser";
      const key = "realkey";
      const badkey = "badkey";
      const algorithm = "sha256";

      mocks.getItem.returns(makePromiseFn({ Item: { key, algorithm } }));

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

    it("responds with 201 Created with enabled dev credentials", async () => {
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

      // Dev credentials don't hit the database
      expect(mocks.getItem.notCalled).to.be.true;
      expect(result.statusCode).to.equal(201);
    });

    it("responds with 201 Created with real valid credentials", async () => {
      const id = "realuser";
      const key = "realkey";
      const algorithm = "sha256";

      mocks.getItem.returns(makePromiseFn({ Item: { key, algorithm } }));

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
      expect(result.statusCode).to.equal(201);
    });
  });

  describe("Content submission", () => {
    it("responds with 400 if missing a required field", async () => {
      const id = "devuser";
      const { key, algorithm } = DEV_CREDENTIALS[id];
      const body = Object.assign({}, DEFAULT_POST_BODY);
      delete body.image;

      const result = await acceptPost({
        httpMethod: "POST",
        proto: "https",
        host: "example.com",
        port: 443,
        path: "/prod/accept",
        id,
        key,
        algorithm,
        body
      });

      expect(result.statusCode).to.equal(400);
      expect(JSON.parse(result.body).error).to.equal(
        'Required "image" is missing'
      );
    });

    it("accepts a properly authorized image submission", async () => {
      const id = "devuser";
      const { key, algorithm } = DEV_CREDENTIALS[id];
      const imageContent = "1234";
      const imageContentType = "image/jpeg";
      const body = Object.assign({}, DEFAULT_POST_BODY, {
        image: {
          filename: "image.jpg",
          contentType: imageContentType,
          content: imageContent
        }
      });

      const result = await acceptPost({
        httpMethod: "POST",
        proto: "https",
        host: "example.com",
        port: 443,
        path: "/prod/accept",
        id,
        key,
        algorithm,
        body
      });

      const imageKey = `image-${requestId}`;

      expect(mocks.putObject.args[0][0]).to.deep.equal({
        Bucket: CONTENT_BUCKET,
        Key: imageKey,
        Body: new Buffer(imageContent),
        ContentType: imageContentType
      });
      expect(mocks.getQueueUrl.args[0][0]).to.deep.equal({
        QueueName: QUEUE_NAME
      });

      const message = mocks.sendMessage.args[0][0];
      const messageBody = JSON.parse(message.MessageBody);

      expect(message.QueueUrl).to.equal(QueueUrl);
      expect("datestamp" in messageBody).to.be.true;
      expect(messageBody.upstreamServiceUrl).to.equal(UPSTREAM_SERVICE_URL);
      expect(messageBody.id).to.equal(requestId);
      expect(messageBody.user).to.equal(id);
      ["negative_uri", "positive_uri", "positive_email", "notes"].forEach(
        name => expect(messageBody[name]).to.equal(body[name])
      );
      expect(messageBody.image).to.equal(imageKey);

      expect(mocks.putObject.args[1][0]).to.deep.equal({
        Bucket: CONTENT_BUCKET,
        Key: `${imageKey}-request.json`,
        Body: message.MessageBody,
        ContentType: "application/json"
      });

      expect(result.statusCode).to.equal(201);
    });
  });
});

const DEFAULT_POST_BODY = {
  negative_uri: "https://example.com/negative",
  positive_uri: "https://example.com/positive",
  positive_email: "positive@example.com",
  notes: "foobar",
  image: {
    filename: "image.jpg",
    contentType: "image/jpeg",
    content: "1234123412341234"
  }
};

async function acceptPost({
  httpMethod,
  proto,
  host,
  port,
  path,
  id,
  key,
  algorithm,
  body = DEFAULT_POST_BODY
}) {
  const { contentType, encodedBody } = buildBody(body);
  const hawkResult = Hawk.client.header(
    `${proto}://${host}:${port}${path}`,
    httpMethod,
    { credentials: { id, key, algorithm } }
  );
  const headers = {
    Host: host,
    "X-Forwarded-Port": port,
    "Content-Type": contentType,
    Authorization: hawkResult.header
  };
  return accept.post(
    {
      path,
      httpMethod,
      headers,
      body: encodedBody,
      requestContext: { path, requestId }
    },
    {}
  );
}

function buildBody(data) {
  const boundary = "--------------------------065117214804889366770750";
  const contentType = `multipart/form-data; boundary=${boundary}`;

  const encString = (name, value) =>
    `Content-Disposition: form-data; name="${name}"\r\n` +
    "\r\n" +
    value +
    "\r\n";

  const encFile = (name, { filename, contentType, content }) =>
    `Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n` +
    "\r\n" +
    content +
    "\r\n";

  const encodedBody = [
    `--${boundary}\r\n`,
    Object.entries(data)
      .map(
        ([name, value]) =>
          typeof value == "string"
            ? encString(name, value)
            : encFile(name, value)
      )
      .join("--" + boundary + "\r\n"),
    `--${boundary}--`
  ].join("");

  return { contentType, encodedBody };
}
