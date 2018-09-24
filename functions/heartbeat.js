"use strict";

module.exports.handler = async function(event = {}, context = {}) {
  const log = require("../lib/logging")({
    name: "heartbeat",
    isRequest: true,
    event,
    context,
  });
  log.info("summary");
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "OK" }),
  };
};
