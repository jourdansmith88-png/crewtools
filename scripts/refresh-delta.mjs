import { execFileSync } from "node:child_process";

const projectRoot = "/Users/StarJ/Desktop/Senority+";

function run(command, args) {
  execFileSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });
}

run("npm", ["run", "parse:delta"]);
run("npm", ["run", "build:web"]);
