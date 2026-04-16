"use server";

import { redirect } from "next/navigation";
import { clearBetaSession } from "../../lib/beta-auth";

export async function logoutAction() {
  await clearBetaSession();
  redirect("/beta/login");
}
