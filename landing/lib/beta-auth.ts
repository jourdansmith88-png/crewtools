import { cookies } from "next/headers";

export const betaCookieName = "crewtools_beta";

export function getBetaAuthConfig() {
  const email = process.env.BETA_TESTER_EMAIL ?? "";
  const password = process.env.BETA_TESTER_PASSWORD ?? "";
  const token = process.env.BETA_ACCESS_TOKEN ?? "";

  return {
    email,
    password,
    token,
    configured: Boolean(email && password && token),
  };
}

export async function setBetaSession() {
  const { token } = getBetaAuthConfig();
  const cookieStore = await cookies();

  cookieStore.set(betaCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearBetaSession() {
  const cookieStore = await cookies();
  cookieStore.delete(betaCookieName);
}
