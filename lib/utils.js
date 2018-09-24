const crypto = require("crypto");

const jsonPretty = data => JSON.stringify(data, null, " ");

const md5 = data =>
  crypto
    .createHash("md5")
    .update(data)
    .digest("hex");

const wait = delay => new Promise(resolve => setTimeout(resolve, delay));

const epochNow = () => Math.floor(Date.now() / 1000);

module.exports = {
  jsonPretty,
  md5,
  wait,
  epochNow,
};
