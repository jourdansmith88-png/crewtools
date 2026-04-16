import { NextResponse } from "next/server";
import { clearBetaSession } from "../../../../lib/beta-auth";

export async function POST() {
  await clearBetaSession();
  return NextResponse.json({ ok: true });
}
