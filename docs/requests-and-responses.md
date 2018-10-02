# Request and Response Formats

This document lists the request and response body formats _sent from_ Watchdog to its consumers.

## Responses From /accept

### 201
```javascript
{
  id,
  negative_uri,
  positive_uri,
  positive_email,
}
```

Property | Notes
---------| -----
id | A generated ID string.
negative_uri | The negative result callback URI from the consumer's request.
positive_uri | The positive result callback URI from the consumer's request.
positive_email | The list of email addresses to receive a positive match notification from the consumer's request.

### 400
```javascript
{
  error,
}
```

Property | Notes
---------| -----
error | Watchdog cannot [parse the consumer's request](https://github.com/mscdex/busboy) or a required field is not in the request.

### 401
```javascript
{
  error,
}
```

Property | Notes
---------| -----
error | An error message from [Hawk](https://github.com/hueniverse/hawk).

## Callback Request

This is a POST to one of the callback URIs the consumer sent in its submission.  The request body format is identical for positive and negative match callbacks.

```javascript
{
  watchdog_id,
  positive,
  notes,
  error,
  response,
}
```

Property | Notes
---------| -----
watchdog_id | A generated ID.  This is the same ID in the 201 response from `/accept`.
positive | A boolean to indicate whether the image was a positive match.  True when the request is sent to the positive callback URI, and false when POSTed to the negative callback URI.
notes | The (optional) notes the consumer included in its submission.
error | A boolean to indicate whether an error occurred upstream at PhotoDNA.  When this is true, the `positive` value should be ignored.  A list of error status codes is under "Response 200" at the [PhotoDNA documentation for its `match` endpoint](https://developer.microsoftmoderator.com/docs/services/57c7426e2703740ec4c9f4c3/operations/57c7426f27037407c8cc69e6).  (See the `response` property below.)
response | The full response fron PhotoDNA.  The PhotoDNA response status code can be found here.
