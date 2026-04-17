import { NextResponse } from "next/server";
import { getBetaAuthConfig, setBetaSession } from "../../../../lib/beta-auth";

type LoginPayload = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const { email, password, configured } = getBetaAuthConfig();

  if (!configured) {
    return NextResponse.json(
      {
        message:
          "Beta login is not configured yet. Add BETA_TESTER_EMAIL, BETA_TESTER_PASSWORD, and BETA_ACCESS_TOKEN in Vercel.",
      },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as LoginPayload | null;
  const submittedEmail = String(body?.email ?? "").trim().toLowerCase();
  const submittedPassword = String(body?.password ?? "").trim();

  if (submittedEmail !== email.toLowerCase() || submittedPassword !== password) {
    return NextResponse.json(
      { message: "That beta login was not recognized." },
      { status: 401 }
    );
  }

  await setBetaSession();

  return NextResponse.json({ ok: true });
}
