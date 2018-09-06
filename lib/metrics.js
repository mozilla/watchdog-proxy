"use strict";

const request = require("request-promise-native");

const { TILES_STAGE_URL, TILES_PROD_URL } = require("./constants");

const Metrics = (module.exports = {
  ping: async (data = {}) => {
    // Accept a METRICS_URL env var override or select URL based on NODE_ENV
    let url;
    if (process.env.METRICS_URL) {
      url = process.env.METRICS_URL;
    } else {
      url =
        process.env.NODE_ENV === "production"
          ? TILES_PROD_URL
          : TILES_STAGE_URL;
    }
    return request.post({
      url,
      headers: { "Content-Type": "application/json" },
      json: true,
      body: Object.assign(
        {
          topic: "watchdog-proxy",
          timestamp: Date.now(),
        },
        data
      ),
    });
  },

  newItem: ({ consumer_name, watchdog_id, type }) =>
    Metrics.ping({
      event: "new_item",
      consumer_name,
      watchdog_id,
      type,
    }),

  pollerHeartbeat: ({
    poller_id,
    items_in_queue,
    items_in_progress,
    items_in_waiting,
  }) =>
    Metrics.ping({
      event: "poller_heartbeat",
      poller_id,
      items_in_queue,
      items_in_progress,
      items_in_waiting,
    }),

  workerWorks: ({
    consumer_name,
    worker_id,
    watchdog_id,
    photodna_tracking_id,
    is_match,
    is_error,
    timing_retrieved,
    timing_sent,
    timing_received,
    timing_submitted,
  }) =>
    Metrics.ping({
      event: "worker_works",
      consumer_name,
      worker_id,
      watchdog_id,
      photodna_tracking_id,
      is_match,
      is_error,
      timing_retrieved,
      timing_sent,
      timing_received,
      timing_submitted,
    }),
});
