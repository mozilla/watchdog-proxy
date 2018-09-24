// Configure logging and wrap mozlog methods in decorators that automatically
// include function context and event information
module.exports = ({ name, event, context, isRequest = false }) => {
  const {
    LOG_LEVEL = "info",
    LOG_FORMAT = "heka",
    LOG_DEBUG = "0",
    GIT_COMMIT = "",
  } = process.env;

  const mozlog = require("mozlog")({
    app: "watchdog-proxy",
    level: LOG_LEVEL,
    fmt: LOG_FORMAT,
    debug: LOG_DEBUG === "1",
  });

  const log = mozlog(name);
  const selector = isRequest ? selectRequest : selectBase;

  const out = {};
  out.commonFields = {
    version: GIT_COMMIT,
  };
  LOG_LEVELS.forEach(
    level =>
      (out[level] = (op, fields = {}) =>
        log[level](
          op,
          selector({ event, context, fields, commonFields: out.commonFields })
        ))
  );
  return out;
};

const LOG_LEVELS = [
  "trace",
  "verbose",
  "debug",
  "info",
  "warn",
  "error",
  "critical",
];

const selectRequest = ({ event, context, fields = {}, commonFields = {} }) =>
  Object.assign(selectRequestEvent(event), selectBase({ context, fields }));

const selectBase = ({ context, fields = {}, commonFields = {} }) =>
  Object.assign(
    { timestamp: Date.now() },
    selectContext(context),
    commonFields,
    fields
  );

// https://docs.aws.amazon.com/lambda/latest/dg/eventsources.html#eventsources-api-gateway-request
const selectRequestEvent = ({
  path,
  httpMethod: method,
  headers: { Host: hostname, "User-Agent": agent },
}) => ({
  path,
  method,
  agent,
  hostname,
});

// https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
const selectContext = ({
  awsRequestId,
  functionName,
  functionVersion,
  memoryLimitInMB,
}) => ({
  awsRequestId,
  functionName,
  functionVersion,
  memoryLimitInMB,
});
