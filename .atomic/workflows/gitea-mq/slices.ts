import { Type, type Static } from "typebox";
import { change } from "./types.js";
import { varsPaths } from "../omnigent/tools.js";

export const dir = `openspec/changes/${change}`;
export const tasks = `${dir}/tasks.md`, proposal = `${dir}/proposal.md`, design = `${dir}/design.md`, verify = `${dir}/verify.md`;
export const domain = "mq.scientistexperience.net", repository = "cameronraysmith/vanixiets";
export const api = `/repos/${repository}`, rulesetApi = `${api}/rulesets/16212553`;
export const aspect = "modules/nixos/gitea-mq.nix", machine = "modules/machines/nixos/magnetite/default.nix";
export const varsAllowed = [
  "vars/per-machine/magnetite/gitea-mq-github-app-secret-key",
  "vars/per-machine/magnetite/gitea-mq-github-webhook-secret",
  ...varsPaths.filter((path) => path.startsWith("vars/shared/") || path.startsWith("sops/")),
];
export const Slice = Type.Object({ name: Type.String(), allowedPaths: Type.Array(Type.String()), taskIds: Type.Array(Type.String()), objective: Type.String() });
export type Slice = Static<typeof Slice>;
export const s1Tasks = ["2.1", "2.2", "3.1", "4.1", "4.2", "4.3", "4.4", "5.1", "5.2", "5.3", "7.1"];
export const s1: Slice = {
  name: "s1", taskIds: s1Tasks, allowedPaths: ["flake.nix", "flake.lock", aspect, machine, dir],
  objective: "Tasks 2.1–2.2, 3.1, 4.1–4.4, 5.1–5.3, 7.1. Add the first-party aspect and upstream input/composition. Set appId via a named pendingGithubAppId = 1 placeholder until G1 supplies the public id. The controller locks the input and runs all eval/negative controls. Tick only completed implementation boxes. Format host aspect list with gitea-mq on its own line, matching nixbot.",
};
export const postG1: Slice = {
  name: "post-g1", taskIds: ["4.1"], allowedPaths: [aspect, ...varsAllowed, dir],
  objective: "Patch the named App-id placeholder with the tool-observed id. Only the controller owns credential generation/routing; never read or write plaintext credentials.",
};
export const s2: Slice = {
  name: "s2", taskIds: ["6.1"], allowedPaths: ["modules/terranix/cloudflare.nix", dir],
  objective: "Task 6.1: add exactly an unproxied mq CNAME to magnetite.scientistexperience.net following nixbot. Controller owns saved plan, apply, dig and task 6.2.",
};
export const s4: Slice = {
  name: "s4", taskIds: s1Tasks, allowedPaths: [...s1.allowedPaths],
  objective: "Repair only the declared gitea-mq aspect/composition on concrete deployment probe failures. Do not edit build-service aspects or generators. Controller re-evaluates, routes changes, then redeploys the pinned tip.",
};
export const docs: Slice = {
  name: "docs", taskIds: ["10.1"], allowedPaths: ["packages/docs", dir],
  objective: "Task 10.1: extend build-service-topology.md or a linked sibling with the queue's hostname, App, four settings and assertion, ruleset shape, sole auto-merge enabler, peer auth and shared-surface trust boundary. Controller runs just docs-build and just docs-linkcheck.",
};
export const report: Slice = {
  name: "verify", taskIds: [], allowedPaths: [dir],
  objective: "Write only verify.md and controller-owned task/proposal evidence updates.",
};
export const reads = [proposal, design, tasks, `${dir}/plan.md`, ...["merge-queue-service", "merge-queue-interface", "world-assumptions"].map((n) => `${dir}/specs/${n}/spec.md`), "docs/notes/development/version-control/adr-substitution-first-rollup-landing.md", "docs/notes/development/version-control/adr-substitution-first-rollup-landing-review.md", "logs/adr-verify/gitea-mq.md"];
const flake = 'builtins.getFlake (toString ./.)';
const adr = "docs/notes/development/version-control/adr-substitution-first-rollup-landing.md R12";
export const negativeControls = [
  { setting: "batchMax", override: "services.gitea-mq.batchMax = lib.mkForce 1;", message: `services.gitea-mq.batchMax must be 0 (batch everything queued; single-entry fast-forward path) per ${adr}` },
  { setting: "skipQueueIfUpToDate", override: "services.gitea-mq.skipQueueIfUpToDate = lib.mkForce false;", message: `services.gitea-mq.skipQueueIfUpToDate must be true per ${adr}` },
  { setting: "requiredChecks", override: 'services.gitea-mq.requiredChecks = lib.mkForce [ "nixbot/nix-build" ];', message: `services.gitea-mq.requiredChecks must be exactly nixbot/nix-eval and nixbot/nix-build per ${adr}` },
  { setting: "GITEA_MQ_MERGE_LABEL", override: 'systemd.services.gitea-mq.environment.GITEA_MQ_MERGE_LABEL = "x";', message: `GITEA_MQ_MERGE_LABEL must not be set on gitea-mq.service; the upstream default merge-queue is the pinned value per ${adr}` },
].map((control) => ({ ...control, expr: `let f = ${flake}; in (f.nixosConfigurations.magnetite.extendModules { modules = [ ({ lib, ... }: { ${control.override} }) ]; }).config.system.build.toplevel.drvPath` }));
export const rollbackExpr = `let f = ${flake};
g = f.inputs.flake-parts.lib.mkFlake { inputs = f.inputs // { self = f; }; } {
  imports = [ (f.inputs.import-tree (f.outPath + "/modules"))
    ({ lib, ... }: { flake.modules.nixos.gitea-mq = lib.mkForce {}; }) ];
}; in assert f.nixosConfigurations.magnetite.config.services.gitea-mq.enable;
assert !g.nixosConfigurations.magnetite.config.services.gitea-mq.enable;
g.nixosConfigurations.magnetite.config.system.build.toplevel.drvPath`;
export const runtimeEnvironment = ["GITEA_MQ_BATCH_MAX=0", "GITEA_MQ_SKIP_QUEUE_IF_UP_TO_DATE=true", "GITEA_MQ_REQUIRED_CHECKS=nixbot/nix-eval,nixbot/nix-build"];
