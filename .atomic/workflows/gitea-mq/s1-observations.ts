export const s1TaskArms = {
  "2.1": ["input-after-nixbot", "input-follows", "new-lock-revision", "only-queue-lock-delta"],
  "2.2": ["build-locks-unchanged", "build-metadata-unchanged"],
  "3.1": ["credential-root-restart", "key-script-refuses-generation", "webhook-script-openssl", "no-static-credential-owner"],
  "4.1": ["service-settings", "credential-bindings", "observed-app-id", "database-declaration", "ensure-users-ownership", "vhost"],
  "4.2": ["landing-settings", "landing-environment", "no-label-assignment-in-modules"],
  "4.3": ["host-derivation", "four-negative-controls"],
  "4.4": ["aspect-header", "lint"],
  "5.1": ["service-settings", "upstream-import-after-nixbot", "aspect-after-nixbot"],
  "5.2": ["build-aspects-unchanged", "nixbot-domain"],
  "5.3": ["dynamic-user", "cache-directory", "no-static-user", "loopback-listener", "forge-pre-unchanged"],
  "7.1": ["host-derivation"],
} as const;
export type S1Arm = (typeof s1TaskArms)[keyof typeof s1TaskArms][number];

/** Only complete task contracts may enter the passed task ledger. */
export function s1Coverage(observed: readonly S1Arm[]) {
  const observations = Object.entries(s1TaskArms).map(([taskId, required]) => ({
    taskId,
    observed: required.filter((arm) => observed.includes(arm)),
    missing: required.filter((arm) => !observed.includes(arm)),
  }));
  return { observations, verifiedTasks: observations.filter((row) => !row.missing.length).map((row) => row.taskId) };
}
