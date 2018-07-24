const sinon = require("sinon");
const AWS = require("aws-sdk");
const request = require("request-promise-native");
const mockRequire = require("mock-require");

global.env = {
  CONFIG_TABLE: "test-config",
  CREDENTIALS_TABLE: "test-credentials",
  HITRATE_TABLE: "test-hitrate",
  QUEUE_NAME: "test-queue",
  CONTENT_BUCKET: "test-bucket",
  PROCESS_QUEUE_FUNCTION: "process-queue-item",
  UPSTREAM_SERVICE_URL: "https://api.example.com/v1.0/Match",
  UPSTREAM_SERVICE_KEY: "1234567890"
};

global.constants = {
  ETag: '"ae1e7accaab42504a930ecc6e6aa34c2"',
  QueueUrl: "https://example.com/sqs/",
  QueueAttributes: {
    ApproximateNumberOfMessages: 200,
    ApproximateNumberOfMessagesDelayed: 20,
    ApproximateNumberOfMessagesNotVisible: 2
  },
  MessageId: "abba123",
  requestId: "8675309",
  ReceiptHandle: "5551212",
  defaultS3GetObjectResponse: {
    AcceptRanges: "bytes",
    Expiration:
      'expiry-date="Sat, 09 Jun 2018 00:00:00 GMT", rule-id="DailyCleanup"',
    LastModified: "2018-05-09T22:56:51.000Z",
    ContentLength: 20,
    ETag: '"ae1e7accaab42504a930ecc6e6aa34c2"',
    ContentType: "image/jpeg",
    Metadata: {},
    Body: new Buffer("THIS IS NOT AN IMAGE")
  }
};

const defaultConstantsModule = Object.assign({}, require("./constants"), {
  RATE_PERIOD: 500,
  RATE_LIMIT: 2,
  RATE_WAIT: 10,
  MIN_HEARTBEAT_PERIOD: 0
});
global.constantsModule = Object.assign({}, defaultConstantsModule);
mockRequire("./constants", global.constantsModule);

global.mocks = {};
global.makePromiseFn = out => ({ promise: () => Promise.resolve(out) });
global.makePromiseStub = out => sinon.stub().returns(global.makePromiseFn(out));

global.resetMocks = () => {
  const {
    mocks,
    makePromiseStub,
    constants: { QueueUrl, QueueAttributes, MessageId, ETag }
  } = global;

  Object.assign(global.constantsModule, defaultConstantsModule);
  Object.assign(process.env, global.env);
  Object.values(global.mocks).forEach(mock => mock.resetHistory());

  const pSQS = AWS.SQS.prototype;
  const pS3 = AWS.S3.prototype;
  const pDocumentClient = AWS.DynamoDB.DocumentClient.prototype;
  const pLambda = AWS.Lambda.prototype;

  Object.assign(mocks, {
    deleteMessage: (pSQS.deleteMessage = makePromiseStub({})),
    queryItems: (pDocumentClient.query = makePromiseStub({})),
    scanItems: (pDocumentClient.scan = makePromiseStub({ Count: 0 })),
    getItem: (pDocumentClient.get = makePromiseStub({})),
    putItem: (pDocumentClient.put = makePromiseStub({})),
    deleteItem: (pDocumentClient.delete = makePromiseStub({})),
    getQueueAttributes: (pSQS.getQueueAttributes = makePromiseStub({
      Attributes: QueueAttributes
    })),
    getQueueUrl: (pSQS.getQueueUrl = makePromiseStub({ QueueUrl })),
    getSignedUrl: (pS3.getSignedUrl = sinon.stub().returns("")),
    putObject: (pS3.putObject = makePromiseStub({ ETag })),
    deleteObject: (pS3.deleteObject = makePromiseStub({})),
    requestPost: (request.post = sinon.stub().resolves({})),
    sendMessage: (pSQS.sendMessage = makePromiseStub({ MessageId })),
    receiveMessage: (pSQS.receiveMessage = makePromiseStub({ MessageId })),
    invoke: (pLambda.invoke = makePromiseStub({}))
  });
};

global.resetMocks();
