const { expect } = require("chai");

// NOTE: Import the test subject as late as possible so that the mocks work
const heartbeat = require("./heartbeat");

describe("functions/heartbeat.handler", () => {
  it("responds with 200 OK", async () => {
    const result = await heartbeat.handler({
      path: "/dev/__heartbeat__",
      httpMethod: "GET",
      headers: {},
    });
    expect(result.statusCode).to.equal(200);
    expect(JSON.parse(result.body)).to.deep.equal({ status: "OK" });
  });
});
