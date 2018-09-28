// Configure logging and wrap mozlog methods in decorators that automatically
// include function context and event information
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

module.exports = ({ name, event, context, isRequest = false }) => {
  const startTime = Date.now();

  const selector = isRequest ? selectRequest : selectBase;

  const log = mozlog(name);

  const out = {};
  out.commonFields = {
    version: GIT_COMMIT,
  };
  LOG_LEVELS.forEach(
    level =>
      (out[level] = (op, fields = {}) =>
        log[level](
          op,
          selector({
            startTime,
            event,
            context,
            fields,
            commonFields: out.commonFields,
          })
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

const selectRequest = ({
  startTime,
  event,
  context,
  fields = {},
  commonFields = {},
}) =>
  Object.assign(
    selectRequestEvent(event),
    selectBase({ startTime, context, fields })
  );

const selectBase = ({ startTime, context, fields = {}, commonFields = {} }) =>
  Object.assign(
    { timestamp: Date.now(), t: Date.now() - startTime },
    selectContext(context),
    commonFields,
    fields
  );

// https://docs.aws.amazon.com/lambda/latest/dg/eventsources.html#eventsources-api-gateway-request
const selectRequestEvent = ({
  path,
  httpMethod: method,
  headers: {
    Host: hostname,
    "User-Agent": agent,
    "X-Forwarded-For": remoteAddressChain,
  },
}) => ({
  path,
  method,
  remoteAddressChain,
  agent,
  hostname,
});

// https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
const selectContext = ({
  awsRequestId: rid,
  functionName,
  functionVersion,
  memoryLimitInMB,
}) => ({
  rid,
  functionName,
  functionVersion,
  memoryLimitInMB,
});
