const { expect } = require("chai");

const {
  mocks,
  env: {
    QUEUE_NAME,
    CONTENT_BUCKET,
    UPSTREAM_SERVICE_URL,
    UPSTREAM_SERVICE_KEY
  },
  constants: { QueueUrl, ReceiptHandle }
} = global;

// NOTE: Import the test subject as late as possible so that the mocks work
const processQueueItem = require("./processQueueItem");

describe("functions/processQueueItem.handler", () => {
  beforeEach(() => {
    global.resetMocks();
  });

  it("hits negative_uri on negative match from upstream service", async () => {
    mocks.requestPost
      .onCall(0)
      .resolves(negativeMatchResponse)
      .onCall(1)
      .resolves({});
    await expectCommonItemProcessed(false);
  });

  it("hits positive_uri on positive match from upstream service", async () => {
    mocks.requestPost
      .onCall(0)
      .resolves(positiveMatchResponse)
      .onCall(1)
      .resolves({});
    await expectCommonItemProcessed(true);
  });

  const expectCommonItemProcessed = async positive => {
    const Body = makeBody();
    const signedImageUrl = "https://example.s3.amazonaws.com/someimage";

    mocks.getSignedUrl.returns(signedImageUrl);

    await processQueueItem.handler({ ReceiptHandle, Body });

    expect(mocks.getSignedUrl.lastCall.args).to.deep.equal([
      "getObject",
      {
        Bucket: CONTENT_BUCKET,
        Key: defaultMessage.image
      }
    ]);

    expect(mocks.requestPost.args[0][0]).to.deep.equal({
      url: `${UPSTREAM_SERVICE_URL}?enhance`,
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": UPSTREAM_SERVICE_KEY
      },
      json: true,
      body: {
        DataRepresentation: "URL",
        Value: signedImageUrl
      }
    });

    expect(mocks.requestPost.args[1][0]).to.deep.equal({
      url: defaultMessage[positive ? "positive_uri" : "negative_uri"],
      headers: {
        "Content-Type": "application/json"
      },
      json: true,
      body: {
        watchdog_id: defaultMessage.id,
        positive
      }
    });

    const putObjectCall = mocks.putObject.args[0][0];
    expect(putObjectCall.Bucket).to.equal(CONTENT_BUCKET);
    expect(putObjectCall.Key).to.equal(`${defaultMessage.image}-response.json`);
    expect(putObjectCall.ContentType).to.equal("application/json");
    expect(JSON.parse(putObjectCall.Body)).to.deep.equal({
      id: defaultMessage.id,
      user: defaultMessage.user,
      negative_uri: defaultMessage.negative_uri,
      positive_uri: defaultMessage.positive_uri,
      positive_email: defaultMessage.positive_email,
      notes: defaultMessage.notes,
      image: defaultMessage.image,
      response: positive ? positiveMatchResponse : negativeMatchResponse
    });

    expect(mocks.getQueueUrl.lastCall.args[0]).to.deep.equal({
      QueueName: QUEUE_NAME
    });

    expect(mocks.deleteMessage.lastCall.args[0]).to.deep.equal({
      QueueUrl,
      ReceiptHandle
    });
  };
});

const negativeMatchResponse = {
  Status: {
    Code: 3000,
    Description: "OK",
    Exception: null
  },
  ContentId: null,
  IsMatch: false,
  MatchDetails: {
    AdvancedInfo: [],
    MatchFlags: []
  },
  XPartnerCustomerId: null,
  TrackingId:
    "WUS_418b5903425346a1b1451821c5cd06ee_57c7457ae3a97812ecf8bde9_ddba296dab39454aa00cf0b17e0eb7bf",
  EvaluateResponse: null
};

const positiveMatchResponse = {
  Status: {
    Code: 3000,
    Description: "OK",
    Exception: null
  },
  ContentId: null,
  IsMatch: true,
  MatchDetails: {
    AdvancedInfo: [],
    MatchFlags: [
      {
        AdvancedInfo: [
          {
            Key: "MatchId",
            Value: "117721"
          }
        ],
        Source: "Test",
        Violations: ["A1"]
      }
    ]
  },
  XPartnerCustomerId: null,
  TrackingId:
    "WUS_418b5903425346a1b1451821c5cd06ee_57c7457ae3a97812ecf8bde9_0709e0136ee342e993092edceecbc407",
  EvaluateResponse: null
};

const defaultMessage = {
  upstreamServiceUrl: UPSTREAM_SERVICE_URL,
  id: "8675309",
  user: "devuser",
  negative_uri: "https://example.com/negative?id=123",
  positive_uri: "https://example.com/positive?id=123",
  positive_email: "foo@example.com",
  notes: "this is a test",
  image: "image-8675309"
};

const makeBody = (message = {}) =>
  JSON.stringify(Object.assign({}, defaultMessage, message));
