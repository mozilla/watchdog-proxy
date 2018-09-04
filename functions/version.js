"use strict";
const packageMeta = require("../package.json");

module.exports.handler = async function(event, context) {
  const { GIT_COMMIT: commit = "" } = process.env;
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commit,
      version: packageMeta.version,
      source: packageMeta.repository.url,
    }),
  };
};
