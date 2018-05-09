const { expect } = require("chai");

// NOTE: Import the test subject as late as possible so that the mocks work
const pollQueue = require("./pollQueue");

describe("functions/pollQueue.handler", () => {
  it("should exist", () => {
    expect(pollQueue.handler).to.not.be.undefined;
  });
});
