"use strict";
const { logError } = require("./utils.js");

const Raven = require("raven");

module.exports = () => {
  const { SENTRY_DSN, GIT_COMMIT } = process.env;
  Raven.config(SENTRY_DSN, { release: GIT_COMMIT }).install(err =>
    logError("Sentry install failed", err)
  );
  return Raven;
};
