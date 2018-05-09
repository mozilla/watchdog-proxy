#!/usr/bin/env node
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
    .option("-i, --id <id>", "User id")
    .option("-k, --key <key>", "User key")
    .parse(process.argv);

  const [ url ] = program.args;
  if (!url) {
    console.error("URL required");
    program.outputHelp();
    return "";
  }

  const { header: Authorization } = Hawk.client.header(
    url,
    "POST",
    {
      credentials: {
        id: program.id || "devuser",
        key: program.key || "devkey",
        algorithm: "sha256"
      }
    }
  );

  return await request({
    method: "POST",
    url,
    headers: { Authorization }
  });
}

main()
  .then(console.log)
  .catch(err => console.error("ERROR", err.message));
