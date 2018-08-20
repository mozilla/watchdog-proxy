# Watchdog Metrics
*Last Update: 2018-06-08*

## Analysis
Questions we want to answer with metrics data include:

- Overall throughput performance:
  - Consumer submission to submission to PhotoDNA (time in queue)
  - Response from PhotoDNA (time waiting for reply)
  - Response to consumer API (time to reply)
  - The sum of the above to give an easy health measure
- Throughput data for positive identifications since they require
  manual intervention:
  - Number of positively flagged images
    - Breakdown of images not yet reviewed and under review
  - Number of images confirmed vs falsely identified
- The number of items in the message queue
- Total number of images processed
  - Breakdown of positive vs negative responses

Each of these should be available globally, as well as broken down per consumer
application.


## Collection
This project uses Ping Centre to collect metrics data.  Pings will be sent as
JSON blobs.  All pings will include the following fields:
- *topic*: used by Ping Centre. In this case always "watchdog-proxy": string
- *timestamp*: Using UNIX epoch time in milliseconds (i.e. `Date.now()` in JavaScript): number


## Events
Additional fields submitted are described below.

### A new item is submitted from a consumer
- *consumer_name*: the name of the consumer submitting the request: string
- *event*: "new_item": string
- *watchdog_id*: the ID assigned to the task: string
- *type*: Content-Type of item submitted (eg. 'image/png' or 'image/jpg'): string

Example:
```
{
  "topic": "watchdog-proxy",
  "timestamp": "1534784298646",

  "consumer_name": "screenshots",
  "event": "new_item",
  "watchdog_id": "9ad08ec4-be1a-4327-b4ef-282bed37621f"
  "type": "image/png",
}
```

### Queue poller periodic heartbeat
The `pollQueue` function repeatedly polls the queue for jobs waiting to be
processed. It gets called every 60 seconds and runs for most of 60 seconds
before exiting. (This is a hack to work around lacking support for long-running
functions in Amazon Lambda.)

Metrics pings will be sent at these times while the `pollQueue` function is running:
- when the function starts (every 60 seconds)
- roughly every 20 seconds while it runs
- when the function exits (roughly 60 seconds after start)

The metrics sent in the ping will contain:
- *event*: "poller_heartbeat": string
- *poller_id*: UUID given by Lambda to the current invocation of the `pollQueue` function
- *items_in_queue*: Number of items in the queue before the worker removes any: integer
- *items_in_progress*: Number of items being processed: integer
- *items_in_waiting*: Number of items waiting to be queued: integer

Example:
```
{
  "topic": "watchdog-proxy",
  "timestamp": "1534784298646",

  "event": "poller_heartbeat",
  "poller_id": "31417de1-b3ef-4e90-be3c-e5116d459d1d",
  "items_in_queue": 1504,
  "items_in_progress": 22,
  "items_in_waiting": 38
}
```

### A worker processes a queue item
For *each* item fetched from the queue by the poller, the `processQueueItem` function will be invoked. That function, in turn, will send these metrics:
- *event*: "worker_works": string
- *worker_id*: UUID given by Lambda to the current invocation of the `processQueueItem` function
- *consumer_name*: the ID of the consumer submitting the request: string
- *watchdog_id*: the ID assigned to the task: string
- *photodna_tracking_id*: ID from PhotoDNA: string
- *is_match*: Whether the response was positive or negative: boolean
- *is_error*: Was the response an error?: boolean
- *timing_sent*: time (in ms) to send item to PhotoDNA: integer
- *timing_received*: time (in ms) before response from PhotoDNA: integer
- *timing_submitted*: time (in ms) to finish sending a response to consumer's report URL: integer

Example:
```
{
  "topic": "watchdog-proxy",
  "timestamp": "1534784298646",

  "event": "worker_works",
  "worker_id": "8cdb1e6b-7e15-489d-b171-e7a05781c5da",
  "consumer_name": "screenshots,
  "watchdog_id": "9ad08ec4-be1a-4327-b4ef-282bed37621f"
  "photodna_tracking_id": "1_photodna_a0e3d02b-1a0a-4b38-827f-764acd288c25",
  "is_match": false,
  "is_error": false,

  "timing_sent": 89,
  "timing_received": 161,
  "timing_submitted": 35
}
```
