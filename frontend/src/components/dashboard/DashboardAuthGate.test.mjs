import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./DashboardAuthGate.tsx", import.meta.url),
  "utf8",
);

test("dashboard auth gate bounds post-profile access checks", () => {
  assert.match(source, /const ACCESS_STEP_TIMEOUT_MS = 6000;/);
  assert.match(
    source,
    /withGateTimeout\(\{[\s\S]*promise: supabase[\s\S]*\.from\("customers"\)[\s\S]*timeoutMessage:\s*"Customer portal access lookup timed out before dashboard access could be verified\."/,
  );
  assert.match(
    source,
    /withGateTimeout\(\{[\s\S]*promise: evaluateHomeFixPrivateAccess\(getSupabaseBrowserClient\(\)\)[\s\S]*timeoutMessage:\s*"HomeFix private access check timed out before dashboard access could be verified\."/,
  );
});

test("dashboard auth gate keeps timed-out checks fail closed", () => {
  assert.match(
    source,
    /const fallbackDecision: DashboardAccessDecision = \{[\s\S]*allowed: false,[\s\S]*redirectTo: "\/login"/,
  );
  assert.doesNotMatch(source, /catch \(error\)[\s\S]*setGateState\(\{ status: "allowed"/);
});
