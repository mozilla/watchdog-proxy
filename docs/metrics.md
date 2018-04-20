# Watchdog Metrics
*Last Update: 2018-04-20*

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
- Current timestamp: string

## Events
Additional fields submitted are described below.

### A new item is submitted from a consumer
- ID of the consumer: integer
- Number of items in message queue: integer
- Type of item submitted (eg. 'png' or 'jpg'): string

### A worker wakes up or sleeps
A worker wakes up periodically to process the queue.  When it wakes up it
selects a portion of the queue to process and it shuts down when it finishes
processing them.  When the worker wakes up *or* shuts down, it will send:
- Number of items in the queue: integer

### Worker processes the queue
For *each* item it processes:
- Timing (in ms):
  - To retrieve item from the queue: integer
  - To send and receive a response from PhotoDNA: integer
  - To send a response to the consumer's report URL: integer
- Whether the response was positive or negative: string


TODO: This doesn't address processing positive identifications yet as that
interface/process isn't defined yet.
