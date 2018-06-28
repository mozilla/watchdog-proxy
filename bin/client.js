#!/usr/bin/env node
const fs = require("fs");
const { URL } = require("url");
const Hawk = require("hawk");
const request = require("request-promise-native");
const program = require("commander");
const { devCredentials } = require("../lib/constants");
const packageData = require("../package.json");

let endpointURL = null;

async function main() {
  program
    .version(packageData.version)
    .usage("[options]")
    .option("-U, --url <url>", "Service base URL (auto-detected by default)")
    .option("-u, --id <id>", "User id")
    .option("-k, --key <key>", "User key")
    .option("-i, --image <path>", "Image path")
    .option("-n, --notes <text>", "Notes text")
    .option("-N, --negative <url>", "Negative URL")
    .option("-P, --positive <url>", "Positive URL")
    .option("-e, --email <email>", "Email for positives")
    .parse(process.argv);

  const endpointURL = await discoverEndpointURL(program);
  let url = `${endpointURL}/accept`;

  let negative_uri = program.negative;
  if (!negative_uri) {
    negative_uri = `${endpointURL}/mock/client/negative`;
  }

  let positive_uri = program.positive;
  if (!positive_uri) {
    positive_uri = `${endpointURL}/mock/client/positive`;
  }

  if (!url || !negative_uri || !positive_uri) {
    console.error("Missing required URL");
    program.outputHelp();
    return "";
  }

  const { header: Authorization } = Hawk.client.header(url, "POST", {
    credentials: {
      id: program.id || "devuser",
      key: program.key || "devkey",
      algorithm: "sha256"
    }
  });

  const formData = {
    image: program.image ? fs.createReadStream(program.image) : DEFAULT_IMAGE,
    negative_uri,
    positive_uri
  };
  if (program.email) {
    formData.positive_email = program.email;
  }
  if (program.notes) {
    formData.notes = program.notes;
  }

  return await request({
    method: "POST",
    url,
    headers: { Authorization },
    formData
  });
}

async function discoverEndpointURL(program) {
  if (program.url) {
    return program.url;
  }
  if (!endpointURL) {
    // Attempt to discover the current stack's accept URL if missing option
    const Serverless = require("serverless");
    const serverless = new Serverless({ interactive: false });
    await serverless.init();
    await serverless.variables.populateService();
    const stackName = serverless.providers.aws.naming.getStackName();
    const stackInfo = await serverless.providers.aws.request(
      "CloudFormation",
      "describeStacks",
      { StackName: stackName }
    );
    stackInfo.Stacks[0].Outputs.forEach(({ OutputKey, OutputValue }) => {
      if (OutputKey === "ServiceEndpoint") {
        endpointURL = OutputValue;
        console.log(`Discovered endpoint URL: ${endpointURL}`);
      }
    });
  }
  if (!endpointURL) {
    throw "Could not discover endpoint URL";
  }
  return endpointURL;
}

// NOTE: This is a tiny image of lmorchard's face used if --image not supplied
// (this is probably overkill)
const DEFAULT_IMAGE = Buffer.from(
  "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",
  "base64"
);

main()
  .then(console.log)
  .catch(err => console.error("ERROR", err.message));
