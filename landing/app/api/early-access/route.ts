import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EarlyAccessEntry = {
  email: string;
  source: string;
  createdAt: string;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();

  if (!emailPattern.test(email)) {
    return NextResponse.json(
      { ok: false, message: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const payload = {
    email,
    source: "crewtools-landing",
    createdAt: new Date().toISOString(),
  };

  const webhookUrl = process.env.EARLY_ACCESS_WEBHOOK_URL;
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
        message: "You're on the list. We'll be in touch soon.",
      });
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const dataDir = path.join(process.cwd(), "data");
    const outputFile = path.join(dataDir, "early-access.json");

    await fs.mkdir(dataDir, { recursive: true });

    const existing: EarlyAccessEntry[] = await fs
      .readFile(outputFile, "utf8")
      .then((contents) => JSON.parse(contents) as EarlyAccessEntry[])
      .catch(() => [] as EarlyAccessEntry[]);

    if (!existing.some((entry) => entry.email === email)) {
      existing.push(payload);
      await fs.writeFile(outputFile, JSON.stringify(existing, null, 2) + "\n");
    }

    return NextResponse.json({
      ok: true,
      message: "Saved locally for development. Add EARLY_ACCESS_WEBHOOK_URL for production capture.",
    });
  }

  return NextResponse.json(
    {
      ok: false,
      message:
        "Early access capture is not connected yet. Add EARLY_ACCESS_WEBHOOK_URL in Vercel to turn this on.",
    },
    { status: 503 }
  );
}
