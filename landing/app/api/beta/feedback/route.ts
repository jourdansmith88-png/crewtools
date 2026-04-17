import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type BetaFeedbackEntry = {
  name: string;
  email: string;
  category: string;
  message: string;
  source: string;
  createdAt: string;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const category = String(body?.category ?? "Bug").trim();
  const message = String(body?.message ?? "").trim();

  if (!message) {
    return NextResponse.json(
      { ok: false, message: "Please include a short description of the issue or idea." },
      { status: 400 }
    );
  }

  if (email && !emailPattern.test(email)) {
    return NextResponse.json(
      { ok: false, message: "Please enter a valid email address or leave it blank." },
      { status: 400 }
    );
  }

  const payload: BetaFeedbackEntry = {
    name,
    email,
    category,
    message,
    source: "crewtools-beta",
    createdAt: new Date().toISOString(),
  };

  const webhookUrl = process.env.BETA_FEEDBACK_WEBHOOK_URL;
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (response?.ok) {
      return NextResponse.json({
        ok: true,
        message: "Got it. Thanks for the beta feedback.",
      });
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const dataDir = path.join(process.cwd(), "data");
    const outputFile = path.join(dataDir, "beta-feedback.json");

    await fs.mkdir(dataDir, { recursive: true });

    const existing: BetaFeedbackEntry[] = await fs
      .readFile(outputFile, "utf8")
      .then((contents) => JSON.parse(contents) as BetaFeedbackEntry[])
      .catch(() => [] as BetaFeedbackEntry[]);

    existing.push(payload);
    await fs.writeFile(outputFile, JSON.stringify(existing, null, 2) + "\n");

    return NextResponse.json({
      ok: true,
      message: "Saved locally for development. Add BETA_FEEDBACK_WEBHOOK_URL for production capture.",
    });
  }

  return NextResponse.json(
    {
      ok: false,
      message:
        "Beta feedback capture is not connected yet. Add BETA_FEEDBACK_WEBHOOK_URL in Vercel to turn this on.",
    },
    { status: 503 }
  );
}
