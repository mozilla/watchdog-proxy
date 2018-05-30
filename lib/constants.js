module.exports = {
  DEFAULT_HAWK_ALGORITHM: "sha256",
  DEV_CREDENTIALS: {
    devuser: {
      key: "devkey",
      algorithm: "sha256"
    }
  },
  RATE_LIMIT: 5,
  RATE_PERIOD: 1000,
  MAX_LONG_POLL_PERIOD: 20,
  POLL_DELAY: 100,
  EXECUTION_MUTEX_KEY: "pollQueueExecutionExpires",
  EXECUTION_MUTEX_TTL: 50 * 1000
};
