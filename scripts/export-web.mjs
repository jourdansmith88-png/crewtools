import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFilePath);
const projectRoot = path.resolve(scriptsDir, "..");
const distDir = path.join(projectRoot, "dist");
const distDataDir = path.join(distDir, "data");
const parsedDir = path.join(projectRoot, "Delta data", "parsed");
const pilotHistorySource = path.join(parsedDir, "pilot-history");
const pilotHistoryTarget = path.join(distDataDir, "pilot-history");
const expoBinary = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "expo.cmd" : "expo",
);

execFileSync(expoBinary, ["export", "--platform", "web"], {
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
