## 1. S0 amend-plan

This ledger follows the S0–S3 contracts in `.atomic/workflows/runs/deploy-omnigent/omnigent-magnetite/d0064db1-3756-4e49-ae30-e03f23ca0bd7/`.
The `slice-N.json` references below resolve under that evidence root.
All checkboxes are pending controller acceptance, including the tracking work performed during binding.
Remote operations, including the Linear readback gate, builds on remote machines, version-control changes, and deployment belong to the controller, never to a scoped writer.
The `.#` examples below identify attributes, not substitutes for the current contracts' `__OMNIGENT_SOURCE__` input; the controller resolves that input before executing the literal S1–S3 gates.

- [ ] 1.1 Bind the HIL proposal to one CAM story in the new omnigent-magnetite project and extend only that project's registry entry — verify: Linear readback matches the proposal frontmatter and `openspec/linear.yaml`, with no design or task copy in Linear.
- [ ] 1.2 Amend `docs/notes/development/omnigent/deployment-plan.md` to add the host `environment` option and `PI_ACP_PI_COMMAND=atomic`, `PI_CODING_AGENT_DIR=/home/cameron/.atomic/agent`, and `OMNIGENT_RUNNER_ENV_PASSTHROUGH=PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR` — verify: all host-environment GrepAssert gates in `slice-0.json` pass.
- [ ] 1.3 Require foreground `omnigent host --server https://omni.scientistexperience.net`, reject both `--background` and `omnigent host enable`, and include the exact pinned ACP stanza with Atomic beside Pi in the catalogue — verify: the foreground and `acp:` gates in `slice-0.json` pass and the stanza matches the supplied ACP research.
- [ ] 1.4 Correct inventory placement to `modules/clan/inventory/services/omnigent.nix`, state that no two-role precedent exists in this repository, and replace Kanidm fork-URL citations with the local `/Users/crs58/ghq/github.com/kanidm/kanidm` checkout and the relevant recorded pin — verify: the inventory, precedent, local-source, and negative fork-citation gates in `slice-0.json` pass.
- [ ] 1.5 Set the planning admission decision to allowed-domains unset, administrator `cameron.ray.smith@gmail.com`, and Kanidm group-gated access; document one worker for in-memory CLI tickets and the WebView/system-browser `/auth/cli-login` flow using one confidential client — verify: the corresponding admission, worker, email, and mobile gates in `slice-0.json` pass.
- [ ] 1.6 Restate R9 that sandbox `read_paths` must include `/nix/store` for Nix executables and that this weakens isolation — verify: the R9 gate in `slice-0.json` passes without representing the initial native sessions as sandboxed.
- [ ] 1.7 Amend `packages/docs/src/content/docs/development/operations/identity/kanidm.md` to document accepted `yopass.se` delivery, workstation `clan vars get`, granting an existing person `omnigent_users` membership, and the scope-mapped `/ui/apps` tile with `originLanding` — verify: every identity-runbook GrepAssert in `slice-0.json` passes.
- [ ] 1.8 Complete the schema's remaining planning artifacts without inventing brainstorming output or human approval — verify: `openspec status --change deploy-omnigent-magnetite --json` shows every transitive planning dependency present, and `openspec validate deploy-omnigent-magnetite` exits zero.

## 2. S1 package

Depends on accepted S0.
Only `pkgs/by-name/omnigent/` is writable in this slice.

- [ ] 2.1 Add `pkgs/by-name/omnigent/package.nix` using the PyPI 0.12.0 wheel, `buildPythonApplication`, `psycopg[binary]`, `pythonRelaxDeps`, and a PYTHONPATH-only wrapper — verify: `nix eval --json .#packages.x86_64-linux.omnigent.version` returns `"0.12.0"` and the controller's remote package-build gate in `slice-1.json` passes with an observed source hash.
- [ ] 2.2 Exercise the built CLI rather than a source-tree executable — verify: the exact remote CLI command in `slice-1.json` exits zero and its stdout includes both `server` and `host`.

## 3. S2 server

Depends on accepted S1.
Only `modules/nixos/omnigent.nix`, `modules/nixos/kanidm.nix`, and `modules/terranix/cloudflare.nix` are writable in this slice.
Use the `extendModules` fixture from `slice-2.json`; the clan binding does not exist yet.

- [ ] 3.1 Add the plain server module, static omnigent account, shared PostgreSQL socket/peer connection, database ownership, memory limits, and ordering after and requiring `postgresql.target` — verify: fixture evaluations retain `omnigent`, `matrix-synapse`, and `buildbot` databases, PostgreSQL version starts with `16.`, and the ordering assertion in `slice-2.json` passes.
- [ ] 3.2 Configure confidential client `omnigent`, exact issuer `https://accounts.scientistexperience.net/oauth2/openid/omnigent`, group `omnigent_users`, callback and landing URLs, and scope map `[ "openid" "profile" "email" ]` — verify: the Kanidm group and exact scope-map fixture gates pass, while review confirms PKCE and email verification remain enabled and membership stays operational.
- [ ] 3.3 Declare `kanidm-oauth2-omnigent` with the shared secret and environment carriers and instance cookie generator `omnigent-cookie-secret-omnigent`, delivered through EnvironmentFile entries — verify: both generator-name gates and the cookie-generator fixture value pass, and review checks carrier ownership and both consumer restart units without printing secrets.
- [ ] 3.4 Configure one server worker, omit `OMNIGENT_OIDC_ALLOWED_DOMAINS`, and install the administrator roster containing `cameron.ray.smith@gmail.com` — verify: evaluate the rendered unit command/environment and roster source against these literals, in addition to the server acceptance review in `slice-2.json`.
- [ ] 3.5 Add the unproxied CNAME for `omni.scientistexperience.net` and the loopback nginx proxy with ACME, forced HTTPS, WebSockets, `proxy_read_timeout 1d;`, `proxy_send_timeout 1d;`, and `proxy_buffering off;` — verify: nginx fixture gates pass and `nix build --no-link .#checks.aarch64-darwin.terraform-validate` exits zero.
- [ ] 3.6 Evaluate the complete server fixture without building its machine closure — verify: the toplevel drvPath gate in `slice-2.json` returns a path matching `^/nix/store/.*\.drv$` and every remaining fixture gate passes.

## 4. S3 host-clan

Depends on accepted S2.
Only `modules/nixos/omnigent-host.nix`, `modules/clan/services/omnigent/`, and `modules/clan/inventory/services/omnigent.nix` are writable in this slice.

- [ ] 4.1 Add the plain host module with the environment option, explicit runtime PATH, home directory, memory limits, user `cameron`, foreground `--server` command, and the three S0 environment values — verify: real magnetite host option, unit User, Environment, and ExecStart gates in `slice-3.json` pass.
- [ ] 4.2 Retain `NoNewPrivileges = true` without `RestrictNamespaces`, `SystemCallFilter`, `ProtectKernelTunables`, `ProtectKernelLogs`, `ProtectHostname`, or `ProcSubset` — verify: the exact positive and six-key absence gates in `slice-3.json` pass.
- [ ] 4.3 Add the two-role clan service and its README, derive the host URL from the single server, keep the instance-scoped cookie generator, and bind both roles only to magnetite in the new inventory file — verify: `clan.modules` contains omnigent, both role machine sets equal `[ "magnetite" ]`, and all real server/host configuration gates in `slice-3.json` pass.
- [ ] 4.4 Reject a second server rather than selecting one implicitly — verify: the negative fixture in `slice-3.json` fails with exactly `Omnigent requires exactly one server`.
- [ ] 4.5 Run the single controller-owned remote machine-closure build after composition is complete — verify: the `NixBuildRemote` gate for `.#checks.x86_64-linux.nixos-magnetite` in `slice-3.json` succeeds, with its receipt retained and no duplicate unchanged-input build pass.

## 5. S4 deploy and accept

Depends on accepted S0–S3, reviewed content, controller-owned delivery changes, and the explicit deployment confirmations.
There is no supplied `slice-4.json`.
These tasks follow the `input.deploy` branch in `.atomic/workflows/deploy-omnigent.ts`, `.atomic/workflows/omnigent/deployment.ts`, and the wizard/probes in `.atomic/workflows/omnigent/tools.ts`.
They record future controller and human work, not permission for this writer to perform it.

- [ ] 5.1 Obtain operator confirmation, generate only `kanidm-oauth2-omnigent` and `omnigent-cookie-secret-omnigent`, and route only their generated files into the S3 delivery change — verify: `generate-vars` evidence confirms permitted paths and unchanged foreign content, followed by successful topology verification.
- [ ] 5.2 Resolve the exported omnigent-magnetite bookmark to the verified tip SHA and construct `git+file://<absolute-repository>?ref=omnigent-magnetite&rev=<observed-sha>` — verify: `resolve-deployment-source` records the matching bookmark and SHA and never deploys from `@` or an invented revision.
- [ ] 5.3 Plan DNS from that pinned source, require exactly one create for the Cloudflare CNAME named `omni.scientistexperience.net` and no other resource changes, obtain confirmation, and apply only the unchanged saved plan — verify: `plan-dns` and `apply-dns` receipts preserve the filtered summary and checked hash, with private saved plan files and no secret-bearing plan JSON in logs.
- [ ] 5.4 Activate magnetite with `clan machines update magnetite --flake "$SOURCE"` — verify: `update-machine` records the pinned source URL/SHA and differing before/after `/run/current-system` paths.
- [ ] 5.5 Run read-only deployment probes — verify: `probe-deployment` observes active omnigent, kanidm, and nginx units, the exact discovery issuer, and positive live nginx buffering/vhost counts without claiming those counts prove an end-to-end stream.
- [ ] 5.6 Have the operator run the interactive wizard to grant existing cameron access, copy Atomic credentials only after overwrite confirmation, seed the exact ACP configuration with backup, and log the runner in as cameron — verify: the operator confirms completion, secret values stay out of workflow logs, and subsequent runner probes report the required environment and foreground server command.
- [ ] 5.7 Observe the runner after wizard completion — verify: the active unit's current invocation journal reports `Connected as 'magnetite'` within the controller's 90-second deadline, rather than relying on an old invocation.

## 6. Integration Verification

- [ ] 6.1 Collect each literal controller checklist response for `laptop passkey login`, `/ui/apps tile`, `Android app login`, and `one acp:atomic session` — verify: retain each `passed`, `failed`, or `not tested` response verbatim as `human_attested`, separate from tool observations.
- [ ] 6.2 Preserve the acceptance outcome without weakening a gate — verify: any `failed` response blocks, any `not tested` response leaves acceptance incomplete with a caveat, and only four passed responses yield `human_attested`, never independently verified acceptance.
- [ ] 6.3 Reconcile the HIL ledger and Linear state from accepted evidence, preserving review gates — verify: the first checked task triggers In Progress, a genuine verify artifact triggers In Review, and Done is withheld until successful archive after human-steered code and documentation review.
