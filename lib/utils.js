const crypto = require("crypto");

const makeLog = (name, enable) => (...args) => {
  if (!enable) {
    return;
  }
  console.log(`[${name}]`, ...args);
};

const { LOG_INFO = "1", LOG_ERROR = "1", LOG_DEBUG = "0" } = process.env;

const logError = makeLog("error", LOG_ERROR === "1");

const logDebug = makeLog("debug", LOG_DEBUG === "1");

const logInfo = makeLog("info", LOG_INFO === "1");

const jsonPretty = data => JSON.stringify(data, null, " ");

const md5 = data =>
  crypto
    .createHash("md5")
    .update(data)
    .digest("hex");

const wait = delay => new Promise(resolve => setTimeout(resolve, delay));

const epochNow = () => Math.floor(Date.now() / 1000);

module.exports = {
  makeLog,
  logDebug,
  logInfo,
  logError,
  jsonPretty,
  md5,
  wait,
  epochNow,
};
