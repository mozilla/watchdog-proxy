# watchdog-proxy

[![CircleCI](https://circleci.com/gh/mozilla/watchdog-proxy.svg?style=svg)](https://circleci.com/gh/mozilla/watchdog-proxy)

This is a simple proxy which interfaces with Microsoft's [PhotoDNA Service](https://www.microsoft.com/en-us/photodna).

## Systems Diagram
<img src="docs/systems_diagram.png" alt="Systems Diagram" />

## Development

### Useful NPM scripts

- `npm run lint` - check JS syntax & formatting
- `npm run test` - run JS tests
- `npm run watch` - start a file watcher that runs tests & lint
- `npm run prettier` - clean up JS formatting
- `npm run deploy` - deploy a stack configured for production
- `npm run deploy:dev` - deploy a stack configured for development (e.g. with `ENABLE_DEV_AUTH=1`)
- `npm run info` - display information about the currently deployed stack (e.g. handy for checking the stack's API URL)
- `npm run logs -- -f accept -t` - watch logs for the function `accept`
- `npm run client -- [--id <id> --key <key>] <url>` - make an authenticated request to `<url>` using Hawk credentials, defaults to dev credentials devuser / devkey enabled with `ENABLE_DEV_AUTH` env var on deploy

### Quickstart Notes

First, ensure [node.js 8.11.1](https://nodejs.org/en/) or newer is installed. Then, the steps to get started look something like this:
```
git clone git@github.com:mozilla/watchdog-proxy.git
cd watchdog-proxy
npm install
npm start
```

After cloning the repository and installing dependencies, `npm start` will launch several file watchers that build assets as needed, run unit tests, and check code quality as you edit files.

Now, create your own version of `serverless.local.yml`:
1. Copy `serverless.local.yml-dist` to `serverless.local.yml`
1. Edit `serverless.local.yml`
1. Change at least the `stage` property to a name that's unique to you
1. (optional) Change `upstreamService.url` to the URL of a debugging service like webhook.site

The next step is to get the service running on AWS. You'll need to [sign up for an account](https://aws.amazon.com/) or [request a Dev IAM account from Mozilla Cloud Operations](https://mana.mozilla.org/wiki/display/SVCOPS/Requesting+A+Dev+IAM+account+from+Cloud+Operations). (The latter is available only to Mozillians.)

Optional: [Install AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/installing.html). This gives you tools to work with AWS from the command line.

If you already have an AWS key ID and secret, [you can follow the quick start docs for Serverless to configure your credentials](https://serverless.com/framework/docs/providers/aws/guide/credentials#quick-setup)

If you don't already have an AWS key ID and secret, [follow the guide to acquire and configure these credentials](https://serverless.com/framework/docs/providers/aws/guide/credentials/).

Try deploying the service to AWS:
```
npm run deploy:dev
```

You should see output like the following:
```
$ npm run deploy:dev
Serverless: Packaging service...
Serverless: Excluding development dependencies...
Serverless: Creating Stack...
Serverless: Checking Stack create progress...
.....
Serverless: Stack create finished...
Serverless: Uploading CloudFormation file to S3...
Serverless: Uploading artifacts...
Serverless: Uploading service .zip file to S3 (6.39 MB)...
Serverless: Validating template...
Serverless: Updating Stack...
Serverless: Checking Stack update progress...
...........................................................................
Serverless: Stack update finished...
Service Information
service: watchdog-proxy
stage: lmorchard
region: us-east-1
stack: watchdog-proxy-lmorchard
api keys:
  None
endpoints:
  GET - https://30r00qsyhf.execute-api.us-east-1.amazonaws.com/lmorchard/accept
functions:
  accept: watchdog-proxy-lmorchard-accept
  pollQueue: watchdog-proxy-lmorchard-pollQueue
  processQueueItem: watchdog-proxy-lmorchard-processQueueItem
```

If everything was successful, you should now have a running stack with an HTTPS resource to accept requests listed as one of the endpoints. Copy the listed endpoint URL and keep it handy.

To send your first request, use the `client` script with the GET endpoint URL:
```
npm run client
```

With no options, this command should attempt to auto-detect the endpoint URL for your deployed stack. You can check to see the results of this request working its way through the stack with the following log commands:
```
# Client request is accepted into the queue
npm run logs -- -f accept
# Client request is received from the queue
npm run logs -- -f pollQueue
# Queued job is processed
npm run logs -- -f processQueueItem
# Upstream service receives a request
npm run logs -- -f mockUpstream
# Client callback service receives a negative result
npm run logs -- -f mockClientNegative
# Client callback service receives a positive result
npm run logs -- -f mockClientPositive
```

If you want to remove this stack from AWS and delete everything, run `npm run remove`

The [Serverless docs on workflow are useful](https://serverless.com/framework/docs/providers/aws/guide/workflow/).

### Custom stable domain name for local development

By default, no custom domain name is created. You can use the semi-random domain name serverless offers on deployment and with `serverless info`.

If you want to create a domain name for local development (e.g. `watchdog-proxy-lmorchard.dev.mozaws.net`):

1. Edit your `serverless.local.yml` to contain an enabled `customDomain` section with appropriate details
1. Run `npx serverless create_domain` - this only needs to be done once, to create the new custom domain name in Route53 and an accompanying CloudFront distribution
1. Run `npm run deploy:dev` to update your stack

Read this Serverless Blog post for more details: https://serverless.com/blog/serverless-api-gateway-domain/

## Deployment

### Environment variables

When using `serverless deploy` to deploy the stack, you can use several environment variables to alter configuration:

- `STAGE` - Stage for building and deploying - e.g. `dev`, `stage`, `production`
- `DOMAIN` - Custom domain config selection for Route 53 and CloudFront distribution - e.g. `local`, `dev`, `stage`, `production`. If omitted, custom domain handling is disabled
- `NODE_ENV` - Use `production` for a more optimized production build, `development` for a development build with more verbose logging and other conveniences
- `GIT_COMMIT` - The value reported by the `__version__` resource as `commit`. If not set, Serverless config will attempt to run the `git` command to discover the current commit.
- `UPSTREAM_SERVICE_URL` - the URL of the production upstream web service (i.e. PhotoDNA)
- `UPSTREAM_SERVICE_KEY` - the private subscription key for the upstream web service
- `ENABLE_DEV_AUTH=1` - This enables a hardcoded user id / key for development (off by default)
- `DISABLE_AUTH_CACHE=1` - Authentication credentials are cached in memory in the `accept` API function. This lasts until AWS recycles the container hosting the function. Setting this variable disables the cache.

You can see these variables used by scripts defined in `package.json` for development convenience.
