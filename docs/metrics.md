# Watchdog Metrics
*Last Update: 2018-05-22*

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
- *timestamp*: Using the toISOString() standard: string


## Events
Additional fields submitted are described below.

### A new item is submitted from a consumer
- *consumer_name*: the name of the consumer submitting the request: string
- *event*: "new_item": string
- *watchdog_id*: the ID assigned to the task: string
- *type*: Type of item submitted (eg. 'png' or 'jpg'): string

Example:
```
{
  "topic": "watchdog-proxy",
  "timestamp": "2018-05-18T16:38:33.464Z",

  "consumer_name": "screenshots",
  "event": "new_item",
  "watchdog_id": "9ad08ec4-be1a-4327-b4ef-282bed37621f"
  "type": "png",
}
```

### A worker wakes up
A worker wakes up periodically to process the queue.  When it wakes up it
selects a portion of the queue to process and it shuts down when it finishes
processing them.  When the worker wakes up *or* shuts down, it will send:
- *event*: "worker_awakes": string
- *items_in_queue*: Number of items in the queue before the worker removes any: integer
- *items_in_progress*: Number of items being processed: integer
- *items_in_waiting*: Number of items waiting to be queued: integer
- *items_to_claim*: Number of items the worker will take out: integer

Example:
```
{
  "topic": "watchdog-proxy",
  "timestamp": "2018-05-18T16:38:33.464Z",

  "event": "worker_awakes",
  "items_in_queue": 1504,
  "items_in_progress": 22,
  "items_in_waiting": 38,
  "items_to_claim": 250
}
```

### A worker processes the queue
For *each* item it processes:
- *event*: "worker_works": string
- *consumer_name*: the ID of the consumer submitting the request: string
- *watchdog_id*: the ID assigned to the task: string
- *photodna_tracking_id*: ID from PhotoDNA: string
- *is_match*: Whether the response was positive or negative: boolean
- *is_error*: Was the response an error?: boolean
- *timing_retrieved*: time (in ms) to retrieve item from queue: integer
- *timing_sent*: time (in ms) to send item to PhotoDNA: integer
- *timing_received*: time (in ms) before response from PhotoDNA: integer
- *timing_submitted*: time (in ms) to finish sending a response to consumer's report URL: integer

Example:
```
{
  "topic": "watchdog-proxy",
  "timestamp": "2018-05-18T16:38:33.464Z",

  "event": "worker_works",
  "consumer_name": "screenshots,
  "watchdog_id": "9ad08ec4-be1a-4327-b4ef-282bed37621f"
  "photodna_tracking_id": "1_photodna_a0e3d02b-1a0a-4b38-827f-764acd288c25",
  "is_match": false,
  "is_error": false

  "timing_retrieved": 8,
  "timing_sent": 89,
  "timing_received": 161,
  "timing_submitted": 35
}
```

### A worker shuts down
When a worker finishes the work it claimed it shuts down.  When it does, it will
send:
- *event*: "worker_sleeps": string
- *items_processed*: Number of items the worker processed successfully: integer

Example:
```
{
  "topic": "watchdog-proxy",
  "timestamp": "2018-05-18T16:38:33.464Z",

  "event": "worker_sleeps",
  "items_processed": 250
}
```
