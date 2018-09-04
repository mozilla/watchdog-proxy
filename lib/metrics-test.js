const { expect } = require("chai");
const { mocks } = global;
const { TILES_STAGE_URL, TILES_PROD_URL } = require("./constants");
const Metrics = require("./metrics");

describe("lib/metrics", () => {
  beforeEach(() => {
    global.resetMocks();
  });

  describe("Metrics", () => {
    describe("ping", () => {
      const subject = Metrics.ping;

      const expectPostURL = async url => {
        await subject({ foo: true });
        expect(mocks.requestPost.called).to.be.true;
        expect(mocks.requestPost.args[0][0].url).to.equal(url);
      };

      it("uses METRICS_URL env var when available", async () => {
        process.env.METRICS_URL = "https://example.com";
        await expectPostURL(process.env.METRICS_URL);
        delete process.env.METRICS_URL;
      });

      it("uses staging URL when NODE_ENV===development", async () => {
        process.env.NODE_ENV = "development";
        await expectPostURL(TILES_STAGE_URL);
      });

      it("uses production URL when NODE_ENV===production", async () => {
        process.env.NODE_ENV = "production";
        await expectPostURL(TILES_PROD_URL);
      });
    });

    const expectPostBody = async (subject, event, params) => {
      await subject(Object.assign({ ignored: "extra" }, params));
      const body = mocks.requestPost.args[0][0].body;
      expect(body).to.include.key("timestamp");
      // Hacky test to assert that the timestamp is roughly equivalent to the
      // current time in milliseconds - e.g. not an ISO8601 string or other
      expect(Date.now() - parseInt(body.timestamp) < 1000).to.be.true;
      delete body.timestamp;
      expect(body).to.deep.equal(
        Object.assign(
          {
            topic: "watchdog-proxy",
            event,
          },
          params
        )
      );
    };

    describe("newItem", () => {
      const subject = Metrics.newItem;
      it("sends expected properties", async () => {
        await expectPostBody(subject, "new_item", {
          consumer_name: "foo",
          watchdog_id: "bar",
          type: "baz",
        });
      });
    });

    describe("pollerHeartbeat", () => {
      const subject = Metrics.pollerHeartbeat;
      it("sends expected properties", async () => {
        await expectPostBody(subject, "poller_heartbeat", {
          poller_id: "123",
          items_in_queue: "456",
          items_in_progress: "789",
          items_in_waiting: "012",
        });
      });
    });

    describe("workerWorks", () => {
      const subject = Metrics.workerWorks;
      it("sends expected properties", async () => {
        await expectPostBody(subject, "worker_works", {
          consumer_name: "qwe",
          worker_id: "ytr",
          watchdog_id: "rty",
          photodna_tracking_id: "uio",
          is_match: "asd",
          is_error: "fgh",
          timing_retrieved: "jkl",
          timing_sent: "zxc",
          timing_received: "vbn",
          timing_submitted: "mnb",
        });
      });
    });
  });
});
