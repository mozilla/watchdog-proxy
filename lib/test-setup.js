const sinon = require("sinon");
const AWS = require("aws-sdk");
const request = require("request-promise-native");

global.env = {
  CREDENTIALS_TABLE: "test-credentials",
  QUEUE_NAME: "test-queue",
  CONTENT_BUCKET: "test-bucket",
  UPSTREAM_SERVICE_URL: "https://api.example.com/v1.0/Match"
};

global.constants = {
  ETag: '"ae1e7accaab42504a930ecc6e6aa34c2"',
  QueueUrl: "https://example.com/sqs/",
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

global.mocks = {
  deleteMessage: (AWS.SQS.prototype.deleteMessage = sinon.stub()),
  deleteObject: (AWS.S3.prototype.deleteObject = sinon.stub()),
  getItem: (AWS.DynamoDB.DocumentClient.prototype.get = sinon.stub()),
  getObject: (AWS.S3.prototype.getObject = sinon.stub()),
  getQueueUrl: (AWS.SQS.prototype.getQueueUrl = sinon.stub()),
  putObject: (AWS.S3.prototype.putObject = sinon.stub()),
  requestGet: (request.get = sinon.stub()),
  requestPost: (request.post = sinon.stub()),
  sendMessage: (AWS.SQS.prototype.sendMessage = sinon.stub())
};

global.makePromiseFn = out => ({ promise: () => Promise.resolve(out) });

global.resetMocks = () => {
  const {
    mocks,
    makePromiseFn,
    constants: { QueueUrl, MessageId, ETag, defaultS3GetObjectResponse }
  } = global;

  Object.assign(process.env, global.env);

  Object.values(global.mocks).forEach(mock => mock.resetHistory());

  mocks.requestGet.resolves(true);
  mocks.requestPost.resolves(true);

  mocks.deleteMessage.returns(makePromiseFn({}));
  mocks.deleteObject.returns(makePromiseFn({}));
  mocks.getItem.returns(makePromiseFn({}));
  mocks.getObject.returns(makePromiseFn(defaultS3GetObjectResponse));
  mocks.getQueueUrl.returns(makePromiseFn({ QueueUrl }));
  mocks.putObject.returns(makePromiseFn({ ETag }));
  mocks.sendMessage.returns(makePromiseFn({ MessageId }));
};
