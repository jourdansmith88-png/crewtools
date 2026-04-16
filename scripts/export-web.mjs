import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const projectRoot = "/Users/StarJ/Desktop/Senority+";
const distDir = path.join(projectRoot, "dist");
const distDataDir = path.join(distDir, "data");
const parsedDir = path.join(projectRoot, "Delta data", "parsed");
const pilotHistorySource = path.join(parsedDir, "pilot-history");
const pilotHistoryTarget = path.join(distDataDir, "pilot-history");

execFileSync("npx", ["expo", "export", "--platform", "web"], {
  cwd: projectRoot,
  stdio: "inherit",
});

mkdirSync(distDataDir, { recursive: true });

if (existsSync(pilotHistorySource)) {
  cpSync(pilotHistorySource, pilotHistoryTarget, { recursive: true });
  console.log(`Copied ${pilotHistorySource} -> ${pilotHistoryTarget}`);
} else {
  console.warn(`Pilot history directory not found at ${pilotHistorySource}`);
}
