#!/usr/bin/env node
const fs = require("fs");
const { URL } = require("url");
const Hawk = require("hawk");
const request = require("request-promise-native");
const program = require("commander");
const { devCredentials } = require("../lib/constants");
const packageData = require("../package.json");

async function main() {
  program
    .version(packageData.version)
    .usage("[options] <url>")
    .option("-u, --id <id>", "User id")
    .option("-k, --key <key>", "User key")
    .option("-i, --image <path>", "Image path")
    .option("-n, --notes <text>", "Notes text")
    .option("-N, --negative <url>", "Negative URL")
    .option("-P, --positive <url>", "Positive URL")
    .option("-e, --email <email>", "Email for positives")
    .parse(process.argv);

  const [url] = program.args;
  if (!url) {
    console.error("URL required");
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
    negative_uri: program.negative || "https://example.com/negative",
    positive_uri: program.positive || "https://example.com/positive",
    image: fs.createReadStream(program.image)
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

main()
  .then(console.log)
  .catch(err => console.error("ERROR", err.message));
