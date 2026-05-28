import assert from "node:assert/strict";

import {
  buildBetaLoginIdentifier,
  buildPilotProfileClaimState,
  normalizeSeniorityNumber,
  resolvePilotToolAccess,
  validateSeniorityNumber,
} from "./pilotProfileClaim.ts";

const pilotDirectory = [
  {
    seniorityNumber: 12345,
    name: "SMITH, TEST PILOT",
    currentBase: "SLC",
    currentFleet: "220",
    currentSeat: "Captain",
    employeeNumber: "0123456",
  },
];

assert.equal(normalizeSeniorityNumber(" 0012-345 "), "12345");
assert.equal(buildBetaLoginIdentifier("0012345"), "12345");

const invalidEmpty = validateSeniorityNumber("");
assert.equal(invalidEmpty.valid, false);

const invalidFormat = validateSeniorityNumber("ABCDE");
assert.equal(invalidFormat.valid, false);

const missingPassword = buildPilotProfileClaimState({
  seniorityNumberUsername: "12345",
  email: "pilot@example.com",
  password: "",
  pilotDirectory,
});
assert.equal(missingPassword.passwordCreated, false);

const missingEmail = buildPilotProfileClaimState({
  seniorityNumberUsername: "12345",
  email: "",
  password: "secret123",
  pilotDirectory,
});
assert.equal(missingEmail.email, "");
assert.match(missingEmail.statusMessage, /Email is required/i);

const matchedClaim = buildPilotProfileClaimState({
  seniorityNumberUsername: "12345",
  email: "pilot@example.com",
  password: "secret123",
  pilotDirectory,
});
assert.equal(matchedClaim.claimStatus, "matched");
assert.equal(matchedClaim.accountStatus, "profile_claimed");
assert.match(matchedClaim.unlockedTools.join(" "), /seniority_dashboard/);
assert.match(matchedClaim.unlockedTools.join(" "), /ae_tracker/);

const unmatchedClaim = buildPilotProfileClaimState({
  seniorityNumberUsername: "54321",
  email: "pilot@example.com",
  password: "secret123",
  pilotDirectory,
});
assert.equal(unmatchedClaim.claimStatus, "not_found");
assert.equal(unmatchedClaim.needsManualReview, true);

assert.equal(matchedClaim.passwordCreated, true);
assert.equal("password" in matchedClaim, false);
assert.equal("token" in matchedClaim, false);

const unlockedWithoutClaim = resolvePilotToolAccess({
  claimStatus: "not_started",
});
assert.equal(unlockedWithoutClaim.includes("rotation_companion"), true);
assert.equal(unlockedWithoutClaim.includes("seniority_dashboard"), false);

const unlockedWithClaim = resolvePilotToolAccess({
  claimStatus: "matched",
});
assert.equal(unlockedWithClaim.includes("seniority_dashboard"), true);

console.log("pilotProfileClaim passed");
