const { promisify } = require("util");
const { exec: execOrig } = require("child_process");
const exec = promisify(execOrig);

module.exports = async () => {
  let GIT_COMMIT;
  if (process.env.GIT_COMMIT) {
    ({ GIT_COMMIT } = process.env);
  } else {
    ({ stdout: GIT_COMMIT = "" } = await exec(
      'git --no-pager log --format=format:"%H" -1'
    ));
  }

  return {
    GIT_COMMIT
  };
};
