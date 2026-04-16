"use server";

import { redirect } from "next/navigation";
import { getBetaAuthConfig, setBetaSession } from "../../../lib/beta-auth";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _previousState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const { email, password, configured } = getBetaAuthConfig();

  if (!configured) {
    return {
      error:
        "Beta login is not configured yet. Add BETA_TESTER_EMAIL, BETA_TESTER_PASSWORD, and BETA_ACCESS_TOKEN in Vercel.",
    };
  }

  const submittedEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const submittedPassword = String(formData.get("password") ?? "");

  if (submittedEmail !== email.toLowerCase() || submittedPassword !== password) {
    return { error: "That beta login was not recognized." };
  }

  await setBetaSession();
  redirect("/beta");
}
