const makeLog = (name, enable) => (...args) => {
  if (!enable) {
    return;
  }
  console.log(`[${name}]`, ...args);
};

const { LOG_INFO = "1", LOG_DEBUG = "0" } = process.env;

const logDebug = makeLog("debug", LOG_DEBUG === "1");

const logInfo = makeLog("info", LOG_INFO === "1");

const jsonPretty = data => JSON.stringify(data, null, " ");

module.exports = {
  makeLog,
  logDebug,
  logInfo,
  jsonPretty
};
