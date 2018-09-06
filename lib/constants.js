module.exports = {
  DEFAULT_HAWK_ALGORITHM: "sha256",
  DEV_CREDENTIALS: {
    devuser: {
      key: "devkey",
      algorithm: "sha256",
    },
  },
  RATE_LIMIT: 5,
  RATE_PERIOD: 1000,
  RATE_WAIT: 100,
  MAX_LONG_POLL_PERIOD: 20,
  POLL_DELAY: 100,
  DEFAULT_METRICS_PING_PERIOD: 1000,
  TILES_STAGE_URL: "https://onyx_tiles.stage.mozaws.net/v3/links/ping-centre",
  TILES_PROD_URL: "https://tiles.services.mozilla.com/v3/links/ping-centre",
};
