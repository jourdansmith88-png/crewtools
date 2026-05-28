export type PilotAccountStatus =
  | "signed_out"
  | "account_created"
  | "email_unverified"
  | "profile_claimed"
  | "beta_approved";

export type PilotProfileClaimStatus =
  | "not_started"
  | "seniority_number_entered"
  | "matched"
  | "needs_review"
  | "not_found"
  | "claimed_by_another_account";

export type PilotProfileClaimState = {
  seniorityNumberUsername: string;
  email: string;
  passwordCreated: boolean;
  claimedPilotName?: string;
  base?: string;
  equipment?: string;
  seat?: string;
  claimStatus: PilotProfileClaimStatus;
  accountStatus: PilotAccountStatus;
  unlockedTools: string[];
  needsManualReview: boolean;
  statusMessage: string;
};

export type PilotProfileClaimResult = {
  success: boolean;
  state: PilotProfileClaimState;
};

type PilotDirectoryProfile = {
  seniorityNumber: number;
  name: string;
  currentBase?: string;
  currentFleet?: string;
  currentSeat?: string;
  employeeNumber?: string;
};

type BuildPilotProfileClaimStateArgs = {
  seniorityNumberUsername: string;
  email: string;
  password: string;
  pilotDirectory: readonly PilotDirectoryProfile[];
  claimedByAnotherAccount?: boolean;
  manualApproved?: boolean;
};

const ALWAYS_AVAILABLE_TOOLS = [
  "rotation_companion",
  "trip_board",
  "trip_watch",
  "pay_watch",
  "duty_watch",
  "calendar_sync",
  "calendar_sync_setup",
] as const;

const CLAIMED_PROFILE_TOOLS = [
  "seniority_dashboard",
  "seniority_explorer",
  "ae_tracker",
] as const;

export function normalizeSeniorityNumber(value: string) {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

export function validateSeniorityNumber(value: string) {
  const normalized = normalizeSeniorityNumber(value);
  if (!normalized) {
    return { valid: false, normalized, reason: "Enter your Delta seniority number." };
  }
  if (!/^\d{1,7}$/.test(normalized)) {
    return { valid: false, normalized, reason: "Seniority number should be 1 to 7 digits." };
  }
  return { valid: true, normalized, reason: null };
}

export function buildBetaLoginIdentifier(seniorityNumberUsername: string) {
  return normalizeSeniorityNumber(seniorityNumberUsername);
}

export function resolvePilotToolAccess(args: {
  claimStatus: PilotProfileClaimStatus;
  manualApproved?: boolean;
}) {
  const unlockedTools = [...ALWAYS_AVAILABLE_TOOLS];
  if (args.claimStatus === "matched" || args.manualApproved) {
    unlockedTools.push(...CLAIMED_PROFILE_TOOLS);
  }
  return unlockedTools;
}

export function buildPilotProfileClaimState(
  args: BuildPilotProfileClaimStateArgs,
): PilotProfileClaimState {
  const validation = validateSeniorityNumber(args.seniorityNumberUsername);
  const normalizedEmail = args.email.trim().toLowerCase();
  const passwordCreated = args.password.trim().length > 0;
  const matchedPilot =
    validation.valid
      ? args.pilotDirectory.find(
          (pilot) => String(pilot.seniorityNumber) === validation.normalized,
        ) ?? null
      : null;

  let claimStatus: PilotProfileClaimStatus = "not_started";
  let accountStatus: PilotAccountStatus = "signed_out";
  let needsManualReview = false;
  let statusMessage = "Use your Delta seniority number as your CrewTools username.";

  if (args.claimedByAnotherAccount) {
    claimStatus = "claimed_by_another_account";
    needsManualReview = true;
    statusMessage = "This seniority number is already linked to another beta account.";
  } else if (validation.normalized) {
    claimStatus = "seniority_number_entered";
    statusMessage = validation.valid
      ? "Seniority number entered. Add email and a password to create your beta account."
      : validation.reason ?? statusMessage;
  }

  if (!normalizedEmail) {
    statusMessage = validation.valid
      ? "Email is required for recovery and verification."
      : statusMessage;
  }

  if (!passwordCreated) {
    statusMessage = validation.valid && normalizedEmail
      ? "Create a password to finish your beta account setup."
      : statusMessage;
  }

  if (validation.valid && normalizedEmail && passwordCreated) {
    accountStatus = "account_created";
    statusMessage = "Beta account created. Email verification is still required.";
    accountStatus = "email_unverified";
    if (matchedPilot) {
      claimStatus = "matched";
      accountStatus = args.manualApproved ? "beta_approved" : "profile_claimed";
      statusMessage = "Seniority profile matched. Seniority tools unlocked.";
    } else {
      claimStatus = "not_found";
      needsManualReview = true;
      statusMessage = "Seniority number not found — manual review needed.";
    }
  }

  if (validation.valid && normalizedEmail && passwordCreated && !matchedPilot && !args.claimedByAnotherAccount) {
    needsManualReview = true;
  }

  const unlockedTools = resolvePilotToolAccess({
    claimStatus,
    manualApproved: args.manualApproved,
  });

  return {
    seniorityNumberUsername: validation.normalized,
    email: normalizedEmail,
    passwordCreated,
    claimedPilotName: matchedPilot?.name,
    base: matchedPilot?.currentBase,
    equipment: matchedPilot?.currentFleet,
    seat: matchedPilot?.currentSeat,
    claimStatus,
    accountStatus,
    unlockedTools,
    needsManualReview,
    statusMessage,
  };
}
