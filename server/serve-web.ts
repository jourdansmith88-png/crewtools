import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const projectRoot = "/Users/StarJ/Desktop/Senority+";
const distDir = path.join(projectRoot, "dist");
const port = Number(process.env.CREWTOOLS_WEB_PORT ?? 3000);
const host = process.env.HOST || "0.0.0.0";
const envLocalPath = path.join(projectRoot, ".env.local");

function loadEnvLocal() {
  if (!existsSync(envLocalPath)) {
    return;
  }

  const envFile = readFileSync(envLocalPath, "utf8");
  for (const rawLine of envFile.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    const rawValue = line.slice(equalsIndex + 1).trim();
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();
console.log(`OPENAI_API_KEY present: ${process.env.OPENAI_API_KEY ? "yes" : "no"}`);

const { handleContractCopilotRoute } = await import("./routes/ai/contractCopilotRoute.ts");
const { handleContractCopilotExtractTripScreenshotRoute } = await import(
  "./routes/ai/contractCopilotExtractTripScreenshotRoute.ts"
);
const { handleContractCopilotFeedbackRoute } = await import(
  "./routes/ai/contractCopilotFeedbackRoute.ts"
);

function contentTypeFor(filePath: string) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function resolveStaticPath(urlPath: string) {
  const normalized = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.join(distDir, normalized);
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }
  return path.join(distDir, "index.html");
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (
    url.pathname === "/api/ai/contract-copilot" ||
    url.pathname === "/api/ai/contract-copilot/extract-trip-screenshot" ||
    url.pathname === "/api/ai/contract-copilot/feedback"
  ) {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", async () => {
      const request = new Request(`http://localhost:${port}${url.pathname}`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : undefined,
      });
      const response =
        url.pathname === "/api/ai/contract-copilot/extract-trip-screenshot"
          ? await handleContractCopilotExtractTripScreenshotRoute(request)
          : url.pathname === "/api/ai/contract-copilot/feedback"
            ? await handleContractCopilotFeedbackRoute(request)
          : await handleContractCopilotRoute(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    });
    return;
  }

  const filePath = resolveStaticPath(url.pathname);
  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypeFor(filePath));
  createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`CrewTools web server listening on http://${host}:${port}`);
});
