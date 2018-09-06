const sinon = require("sinon");
const { expect } = require("chai");

const {
  makePromiseFn,
  mocks,
  env: { CONTENT_BUCKET, UPSTREAM_SERVICE_URL, UPSTREAM_SERVICE_KEY },
  constants: { ReceiptHandle },
} = global;

const awsRequestId = "test-uuid";

const Metrics = require("../lib/metrics");
const processQueueItem = require("./processQueueItem");

describe("functions/processQueueItem.handler", () => {
  let metricsStub;

  beforeEach(() => {
    global.resetMocks();
    metricsStub = sinon.stub(Metrics, "workerWorks");
  });

  afterEach(() => {
    metricsStub.restore();
  });

  it("hits negative_uri on negative match from upstream service", async () => {
    mocks.requestPost
      .onCall(0)
      .resolves(negativeMatchResponse)
      .onCall(1)
      .resolves({});
    await expectCommonItemProcessed(false);

    expect(mocks.sendEmail.called).to.be.false;

    const deleteCalls = mocks.deleteObject.args;
    expect(deleteCalls[0][0]).to.deep.equal({
      Bucket: CONTENT_BUCKET,
      Key: `${defaultMessage.image}`,
    });
    expect(deleteCalls[1][0]).to.deep.equal({
      Bucket: CONTENT_BUCKET,
      Key: `${defaultMessage.image}-request.json`,
    });
  });

  it("hits positive_uri on positive match from upstream service", async () => {
    const {
      id,
      user,
      negative_uri,
      positive_uri,
      positive_email,
      notes,
      image,
    } = defaultMessage;

    mocks.requestPost
      .onCall(0)
      .resolves(positiveMatchResponse)
      .onCall(1)
      .resolves({});
    await expectCommonItemProcessed(true);

    expect(mocks.sendEmail.called).to.be.true;
    const sendEmailCall = mocks.sendEmail.args[0][0];
    expect(sendEmailCall).to.deep.include({
      Source: global.env.EMAIL_FROM,
      Destination: {
        ToAddresses: [defaultMessage.positive_email],
      },
    });
    [id, user].forEach(v =>
      expect(sendEmailCall.Message.Subject.Data).to.include(v)
    );
    [id, user, notes].forEach(v =>
      expect(sendEmailCall.Message.Body.Text.Data).to.include(v)
    );

    const putObjectCall = mocks.putObject.args[0][0];
    expect(putObjectCall.Bucket).to.equal(CONTENT_BUCKET);
    expect(putObjectCall.Key).to.equal(`${defaultMessage.image}-response.json`);
    expect(putObjectCall.ContentType).to.equal("application/json");
    expect(JSON.parse(putObjectCall.Body)).to.deep.equal({
      id,
      user,
      negative_uri,
      positive_uri,
      positive_email,
      notes,
      image,
      response: positiveMatchResponse,
    });
  });

  it("pauses for rate limiting", async () => {
    // Mock the hitrate table, but only the first three should matter.
    mocks.scanItems
      .onCall(0)
      .returns(makePromiseFn({ Count: 3 }))
      .onCall(1)
      .returns(makePromiseFn({ Count: 2 }))
      .onCall(2)
      .returns(makePromiseFn({ Count: 1 }))
      .onCall(3)
      .returns(makePromiseFn({ Count: 1 }));

    mocks.requestPost
      .onCall(0)
      .resolves(negativeMatchResponse)
      .onCall(1)
      .resolves({});

    await expectCommonItemProcessed(false);

    // Scan should be called 3 times to reflect pausing for rate limit.
    const scanCalls = mocks.scanItems.args;
    expect(scanCalls.length).to.equal(3);
  });

  const expectCommonItemProcessed = async positive => {
    const body = makeBody();
    const signedImageUrl = "https://example.s3.amazonaws.com/some-image";
    const signedRequestUrl = "https://example.s3.amazonaws.com/some-request";
    const signedResponseUrl = "https://example.s3.amazonaws.com/some-response";
    process.env.METRICS_URL = "https://example.com";

    mocks.getSignedUrl
      .onCall(0)
      .returns(signedImageUrl)
      .onCall(1)
      .returns(signedImageUrl)
      .onCall(2)
      .returns(signedRequestUrl)
      .onCall(3)
      .returns(signedResponseUrl);

    await processQueueItem.handler(
      { Records: [{ receiptHandle: ReceiptHandle, body }] },
      { awsRequestId }
    );

    expect(mocks.getSignedUrl.args[0]).to.deep.equal([
      "getObject",
      {
        Bucket: CONTENT_BUCKET,
        Expires: 600,
        Key: defaultMessage.image,
      },
    ]);

    expect(mocks.requestPost.args[0][0]).to.deep.equal({
      url: `${UPSTREAM_SERVICE_URL}?enhance`,
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": UPSTREAM_SERVICE_KEY,
      },
      json: true,
      body: {
        DataRepresentation: "URL",
        Value: signedImageUrl,
      },
    });

    expect(mocks.requestPost.args[1][0]).to.deep.equal({
      url: defaultMessage[positive ? "positive_uri" : "negative_uri"],
      headers: {
        "Content-Type": "application/json",
      },
      json: true,
      body: {
        watchdog_id: defaultMessage.id,
        notes: defaultMessage.notes,
        response: positive ? positiveMatchResponse : negativeMatchResponse,
        positive,
      },
    });

    const response = positive ? positiveMatchResponse : negativeMatchResponse;
    expect(metricsStub.called).to.be.true;
    expect(metricsStub.args[0][0]).to.deep.include({
      consumer_name: defaultMessage.user,
      worker_id: awsRequestId,
      watchdog_id: defaultMessage.id,
      photodna_tracking_id: response.TrackingId,
      is_error: false,
      is_match: response.IsMatch,
    });
    expect(metricsStub.args[0][0]).to.include.keys(
      "timing_sent",
      "timing_received",
      "timing_submitted"
    );
  };
});

const negativeMatchResponse = {
  Status: {
    Code: 3000,
    Description: "OK",
    Exception: null,
  },
  ContentId: null,
  IsMatch: false,
  MatchDetails: {
    AdvancedInfo: [],
    MatchFlags: [],
  },
  XPartnerCustomerId: null,
  TrackingId:
    "WUS_418b5903425346a1b1451821c5cd06ee_57c7457ae3a97812ecf8bde9_ddba296dab39454aa00cf0b17e0eb7bf",
  EvaluateResponse: null,
};

const positiveMatchResponse = {
  Status: {
    Code: 3000,
    Description: "OK",
    Exception: null,
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
            Value: "117721",
          },
        ],
        Source: "Test",
        Violations: ["A1"],
      },
    ],
  },
  XPartnerCustomerId: null,
  TrackingId:
    "WUS_418b5903425346a1b1451821c5cd06ee_57c7457ae3a97812ecf8bde9_0709e0136ee342e993092edceecbc407",
  EvaluateResponse: null,
};

const defaultMessage = {
  datestamp: "2018-07-31T12:00:00Z",
  upstreamServiceUrl: UPSTREAM_SERVICE_URL,
  id: "8675309",
  user: "devuser",
  negative_uri: "https://example.com/negative?id=123",
  positive_uri: "https://example.com/positive?id=123",
  positive_email: "foo@example.com",
  notes: "this is a test",
  image: "image-8675309",
};

const makeBody = (message = {}) =>
  JSON.stringify(Object.assign({}, defaultMessage, message));
