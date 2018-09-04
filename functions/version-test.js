const { expect } = require("chai");
const packageMeta = require("../package.json");

// NOTE: Import the test subject as late as possible so that the mocks work
const version = require("./version");

describe("functions/version.handler", () => {
  it("responds with deployed version information", async () => {
    const GIT_COMMIT = "8675309";
    process.env.GIT_COMMIT = GIT_COMMIT;
    const result = await version.handler({
      path: "/dev/__version__",
      httpMethod: "GET",
    });
    expect(result.statusCode).to.equal(200);
    expect(JSON.parse(result.body)).to.deep.equal({
      commit: GIT_COMMIT,
      version: packageMeta.version,
      source: packageMeta.repository.url,
    });
  });
});
