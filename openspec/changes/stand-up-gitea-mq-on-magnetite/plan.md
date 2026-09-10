# gitea-mq on magnetite implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

<!--
Procedural note: the interactive `superpowers:writing-plans` skill was not invoked; this plan was
written by the same autonomous session that wrote tasks.md, using the schema-sanctioned manual
path. It decomposes tasks.md group by group with the same numbering, so task 4.2 in tasks.md is
Task 4 Step 2 here where the mapping is one to one and is cross-referenced where it is not.
-->

**Goal:** Stand up gitea-mq on magnetite at `mq.scientistexperience.net` with `batchMax = 20`, the other pinned landing settings, a dedicated GitHub App, database/proxy provisioning (R11/R13), and two default-branch rulesets (R14).

**Architecture:** A new first-party aspect `flake.modules.nixos.gitea-mq` at `modules/nixos/gitea-mq.nix` carries the service configuration, the PostgreSQL provisioning, the nginx vhost, two clan vars generators, and the pinning assertions; the upstream `inputs.gitea-mq.nixosModules.default` is imported at the host beside `inputs.nixbot.nixosModules.nixbot`. The unit runs as a dynamic user named for the unit, authenticates to PostgreSQL by peer identity, listens on loopback port 8092 behind the host's nginx, and reads both GitHub secrets as systemd credentials from root-owned clan vars files. Two operator gates stop the plan: App registration (Task 1) and the ruleset diff (Task 8).

**Tech Stack:** nix flakes with flake-parts and import-tree; clan-core for deployment and vars; gitea-mq (`github:Mic92/gitea-mq`, `nixosModules.default`, pinned at or after `d44c455`); nginx with ACME; PostgreSQL; terranix against Cloudflare for DNS; `gh` for forge reads and the ruleset write.

Revision 2 follows `docs/notes/development/version-control/adr-substitution-first-rollup-landing.md` §Decision: `internal/batch/batch.go::Engine.HandlePass` fast-forwards to the exact tested batch SHA, including tested merge commits.
That reverses the orchestrator rollup, zero batch limit, linear-history mandate, and proposed replacement of the nixbot ruleset.
R1/R2 source filtering/cache warming and R15/R16 authorization procedure remain sibling work.
From an aarch64-darwin laptop, the sibling warming command is `just check-fast auto off x86_64-linux 2>&1 | tee logs/checks-linux-$(date +%Y%m%d-%H%M%S).log`.
Its positional system parameter adds `--remote magnetite.zt --no-download` (`justfile::check-fast`); outputs stay in magnetite's store, reported `local` and skipped by nixbot (`build_scheduler.py::JobScheduler._classify`).
`just check-fast auto on` uploads to niks3 for peer darwin laptops and is not needed to warm CI.

## Global constraints

- Nothing under `modules/nixos/nixbot.nix`, `modules/nixos/buildbot.nix`, their generators, vhosts, or databases is edited; `sciexp-nixbot` (id `4743700`) is not touched. Verified per task by `git diff --stat`.
- The four landing settings are `batchMax = 20`, `skipQueueIfUpToDate = true`, `requiredChecks = [ "nixbot/nix-eval" "nixbot/nix-build" "nixbot/effects" ]`, and no merge-label override; the assertions in the aspect are the only place `GITEA_MQ_MERGE_LABEL` appears under `modules/`.
- Both generator files stay at the default owner `root`; the module reads them through `LoadCredential` and no static `gitea-mq` user exists.
- `listenAddr` is `127.0.0.1:8092`; `:8080` is bound by the LiveKit JWT service (`modules/nixos/matrix.nix`).
- `hideRefFromClients = false`; the default would inject an `ExecStartPre` into `systemd.services.gitea` on this host.
- G2 originally added only `nixbot/nix-eval` to our existing ruleset; the operator later added `nixbot/effects` so landing waits for effects, as recorded in `design.md::D2`.
  Installation setup creates the App's separate `gitea-mq` ruleset and adds App bypass to ours.
  All three nixbot contexts must remain forge-required: `internal/github/forge.go::GetRequiredChecks` unions ruleset/classic contexts minus queue-owned contexts, and `internal/monitor/monitor.go::ResolveRequiredChecks` prefers that non-empty list over the configured fallback.
  The inactive fallback must match the authoritative list and must never weaken it; requiring effects also depends on default-branch `nixbot.toml::effects_on_pull_requests = true` and a non-empty effect set.
  No linear-history rule or classic protection is intended.
- No upstream issue or pull request is opened against gitea-mq anywhere in this work.
- Long or output-heavy commands are captured: `<command> 2>&1 | tee logs/<identifier>-$(date +%Y%m%d-%H%M%S).log`.
- Verification of nix-managed outputs is by `nix eval` against `.#nixosConfigurations.magnetite` and by instantiation of `.#checks.x86_64-linux.nixos-magnetite.drvPath`; realization is deferred to the deployment on the host for the reason `stand-up-nixbot-on-magnetite` task 7.1 records.
- This is a jj-colocated repository; the commit commands below are the orchestrator's to run per the fleet's version-control discipline, and a worker returns a ref.

---

### Task 1: Dedicated GitHub App (G1 gate)

**Files:**
- Modify: `openspec/changes/stand-up-gitea-mq-on-magnetite/verify.md` (record the App id, slug, owner, permissions, events, installation selection)

**Interfaces:**
- Consumes: nothing.
- Produces: the numeric App id used as `services.gitea-mq.github.appId` in Task 4 and as the integration id in Task 8's ruleset; the PEM private key the operator sets in Task 3.

- [ ] **Step 1: Present the registration and stop (tasks.md 1.1; operator gate, an agent MUST NOT tick)**

Present to the operator, verbatim, and do not proceed until the operator reports the App id:

```text
Registration: https://mic92.github.io/gitea-mq/ (pre-fills the form) or
              https://github.com/organizations/sciexp/settings/apps/new
Name:         sciexp-gitea-mq        Owner: sciexp        Visibility: public
Homepage:     https://mq.scientistexperience.net/
Webhook URL:  https://mq.scientistexperience.net/webhook/github  (secret: leave blank; the service sets both at startup)
Repository permissions: Contents read & write, Administration read & write, Checks read & write,
                        Pull requests read & write, Commit statuses read, Metadata read
Subscribed events:      check_run, pull_request, status
Automatically delivered by GitHub to every App: installation, installation_repositories (cannot be subscribed to; never required in the API events array)
After creating: generate a private key on the App's settings page and download the PEM, then
  clan vars set magnetite gitea-mq-github-app-secret-key/key.pem     # paste the PEM at the prompt
Webhook secret: nothing to do; Task 3 generates it and the service pushes it to the App.
  (Optional, to choose it yourself: clan vars set magnetite gitea-mq-github-webhook-secret/secret)
Install the App on cameronraysmith/vanixiets only.
Report: the numeric App id and the slug.
```

The `clan vars set` command only works once Task 4 has declared the generator and Task 5 has composed the aspect onto the host, so the operator may register now and set the key after Task 5; the plan orders Task 3 Step 2 accordingly.

- [ ] **Step 2: Confirm the registration (tasks.md 1.2)**

Run: `gh api /apps/<slug> --jq '{id,slug,owner:.owner.login,permissions,events}' 2>&1 | tee logs/gitea-mq-app-$(date +%Y%m%d-%H%M%S).log`
Expected: `permissions` equal to `{administration: write, checks: write, contents: write, metadata: read, pull_requests: write, statuses: read}`, `events` equal as a set to exactly `check_run`, `pull_request`, `status`, and `id` not `4743700`.
Record `installation` and `installation_repositories` as automatically delivered by GitHub, not subscribable or required in `events`.
The older five-event expectation was corrected after it blocked a live gate (ADR Appendix A, R13); record the result in verify.md.

- [ ] **Step 3: Record the installation selection (tasks.md 1.3)**

Record complete enumeration of all App installations and their repositories, with pagination, or equivalent complete operator-page evidence establishing `cameronraysmith/vanixiets` alone (design D11).
The target repository's installation endpoint alone cannot prove exclusivity; incomplete evidence blocks deployment authorization because `github.repos` is additive.

- [ ] **Step 4: Confirm `sciexp-nixbot` is unchanged (tasks.md 1.4)**

Run: `gh api /apps/sciexp-nixbot --jq '{id,permissions,events}'`
Expected: `{checks: write, contents: read, members: read, metadata: read, pull_requests: read}` and `[check_run, check_suite, pull_request, push]`.

---

### Task 2: Flake input

**Files:**
- Modify: `flake.nix` (after the `nixbot` block)
- Modify: `flake.lock`

- [ ] **Step 1: Add the input**

```nix
    gitea-mq.url = "github:Mic92/gitea-mq";
    gitea-mq.inputs.nixpkgs.follows = "nixpkgs";
    gitea-mq.inputs.treefmt-nix.follows = "treefmt-nix";
```

- [ ] **Step 2: Lock it**

Run: `nix flake lock 2>&1 | tee logs/flake-lock-gitea-mq-$(date +%Y%m%d-%H%M%S).log`
Expected: the log reports adding input `gitea-mq` and no other input changing.

- [ ] **Step 3: Verify (tasks.md 2.1, 2.2)**

Run: `nix flake metadata --json | jq -r '.locks.nodes["gitea-mq"].locked.rev, .locks.nodes.nixbot.locked.rev, .locks.nodes["buildbot-nix"].locked.rev'`
Expected: a revision for `gitea-mq`; the other two identical to `git show HEAD:flake.lock`.

- [ ] **Step 4: Commit point**

`feat(gitea-mq): add gitea-mq flake input` — `flake.nix`, `flake.lock`.

---

### Task 3: Credentials

**Files:**
- Create: `modules/nixos/gitea-mq.nix` (generators only at this step; Task 4 fills the rest)
- Modify: `vars/per-machine/magnetite/` (two new entries, by `clan vars`)

- [ ] **Step 1: Declare the two generators (tasks.md 3.1)**

```nix
      clan.core.vars.generators.gitea-mq-github-app-secret-key = {
        files."key.pem".restartUnits = [ "gitea-mq.service" ];
        script = ''
          echo "gitea-mq GitHub App private key: populate via clan vars set" >&2
          exit 1
        '';
      };

      clan.core.vars.generators.gitea-mq-github-webhook-secret = {
        files."secret".restartUnits = [ "gitea-mq.service" ];
        runtimeInputs = [ pkgs.openssl ];
        script = ''
          openssl rand -hex 32 > "$out/secret"
        '';
      };
```

No `owner` attribute on either file: the module reads them through `LoadCredential` as root, and a `gitea-mq` owner would fail at activation because the unit's user is dynamic.

Verify: `nix eval .#nixosConfigurations.magnetite.config.clan.core.vars.generators --apply 'g: { key = g.gitea-mq-github-app-secret-key.files."key.pem"; hook = g.gitea-mq-github-webhook-secret.files.secret; }' --json` (after Task 5) shows `owner` `root` and `restartUnits` `["gitea-mq.service"]` on both.

- [ ] **Step 2: Populate (tasks.md 3.2), after Task 5**

Run: `clan vars generate magnetite --generator gitea-mq-github-webhook-secret 2>&1 | tee logs/clan-vars-generate-gitea-mq-$(date +%Y%m%d-%H%M%S).log`
Then, or by the operator per Task 1: `clan vars set magnetite gitea-mq-github-app-secret-key/key.pem`
Verify: `clan vars list magnetite` reports both set; `head -c 64 vars/per-machine/magnetite/gitea-mq-github-app-secret-key/key.pem/secret` prints a sops envelope header, not PEM text.

- [ ] **Step 3: Positive-controlled content search (tasks.md 3.3)**

Following `stand-up-nixbot-on-magnetite` verify.md §11: search an interior PEM line and the whole webhook secret across the working tree including ignored paths, the tracked tree at HEAD, and `git log --all -S`; all zero. Control `mq.scientistexperience.net` non-zero in every layer. Counts only; no value printed.

- [ ] **Step 4: Commit point**

The generator declaration commits with Task 4; the vars entries commit as `clan vars` writes them (`vars: ...` messages).

---

### Task 4: First-party aspect

**Files:**
- Create or extend: `modules/nixos/gitea-mq.nix`

**Interfaces:**
- Consumes: `inputs.gitea-mq` from Task 2 (imported at the host in Task 5); the App id from Task 1.
- Produces: `flake.modules.nixos.gitea-mq`.

- [ ] **Step 1: Service, database, vhost (tasks.md 4.1)**

```nix
{
  flake.modules.nixos.gitea-mq =
    {
      config,
      pkgs,
      ...
    }:
    let
      listen = "127.0.0.1:8092";
      domain = "mq.scientistexperience.net";
      gen = config.clan.core.vars.generators;
    in
    {
      # generators from Task 3 here

      services.gitea-mq = {
        enable = true;
        externalUrl = "https://${domain}";
        listenAddr = listen;
        hideRefFromClients = false;
        github = {
          appId = 4875422;
          privateKeyFile = gen.gitea-mq-github-app-secret-key.files."key.pem".path;
          webhookSecretFile = gen.gitea-mq-github-webhook-secret.files."secret".path;
          repos = [ "cameronraysmith/vanixiets" ];
        };
        batchMax = 20;
        skipQueueIfUpToDate = true;
        requiredChecks = [
          "nixbot/nix-eval"
          "nixbot/nix-build"
          "nixbot/effects"
        ];
      };

      services.postgresql = {
        ensureDatabases = [ "gitea-mq" ];
        ensureUsers = [
          {
            name = "gitea-mq";
            ensureDBOwnership = true;
          }
        ];
      };

      services.nginx.virtualHosts.${domain} = {
        forceSSL = true;
        enableACME = true;
        locations."/".proxyPass = "http://${listen}";
      };

      # assertions from Step 3 here
    };
}
```

Verify: the three `nix eval` commands in tasks.md 4.1.

- [ ] **Step 2: Confirm the environment (tasks.md 4.2)**

Run: `nix eval .#nixosConfigurations.magnetite.config.systemd.services.gitea-mq.environment --apply 'e: { inherit (e) GITEA_MQ_BATCH_MAX GITEA_MQ_SKIP_QUEUE_IF_UP_TO_DATE GITEA_MQ_REQUIRED_CHECKS; label = e ? GITEA_MQ_MERGE_LABEL; }' --json`
Expected: `{"GITEA_MQ_BATCH_MAX":"20","GITEA_MQ_REQUIRED_CHECKS":"nixbot/nix-eval,nixbot/nix-build,nixbot/effects","GITEA_MQ_SKIP_QUEUE_IF_UP_TO_DATE":"true","label":false}`.

- [ ] **Step 3: Assertions (tasks.md 4.3)**

```nix
      assertions =
        let
          cfg = config.services.gitea-mq;
          adr = "docs/notes/development/version-control/adr-substitution-first-rollup-landing.md R11";
        in
        [
          {
            assertion = cfg.batchMax == 20;
            message = "services.gitea-mq.batchMax must be 20 (flake-update waves with unlimited bisection; landing fast-forwards the target to the exact tested batch SHA) per ${adr}";
          }
          {
            assertion = cfg.skipQueueIfUpToDate == true;
            message = "services.gitea-mq.skipQueueIfUpToDate must be true per ${adr}";
          }
          {
            assertion =
              cfg.requiredChecks == [
                "nixbot/nix-eval"
                "nixbot/nix-build"
                "nixbot/effects"
              ];
            message = "services.gitea-mq.requiredChecks must be exactly nixbot/nix-eval, nixbot/nix-build, and nixbot/effects to match the authoritative ruleset without weakening the fallback per ${adr}";
          }
          {
            assertion = !(config.systemd.services.gitea-mq.environment ? GITEA_MQ_MERGE_LABEL);
            message = "GITEA_MQ_MERGE_LABEL must not be set on gitea-mq.service; the upstream default merge-queue is the pinned value per ${adr}";
          }
        ];
```

Verify, positive: `nix eval .#checks.x86_64-linux.nixos-magnetite.drvPath` succeeds.
Verify, negative control in a separate authorized scratch workspace: add `services.gitea-mq.batchMax = lib.mkForce 1;` to the host, run the same command, and expect failure with the message requiring 20; replace with `systemd.services.gitea-mq.environment.GITEA_MQ_MERGE_LABEL = "x";` and expect the label assertion's failure.
Capture both failures and revert only the scratch edits; task 4.3 remains reopened because its earlier completion predates the twenty-entry assertion.
Do not run a negative-control edit in this shared correction session.

- [ ] **Step 4: Header (tasks.md 4.4)**

Following `modules/nixos/nixbot.nix`'s header form: document the two generators and how each is populated; the peer-authentication coupling (unit name, dynamic user name, and role name); port 8092 and why 8080 is not used; `hideRefFromClients = false` and why; G2's single check addition and the two-ruleset/forge-derived-check invariant.

- [ ] **Step 5: Commit point**

`feat(gitea-mq): add gitea-mq aspect with pinned landing settings` — `modules/nixos/gitea-mq.nix`.

---

### Task 5: Host composition

**Files:**
- Modify: `modules/machines/nixos/magnetite/default.nix`

- [ ] **Step 1: Import and name (tasks.md 5.1)**

Add `inputs.gitea-mq.nixosModules.default` after `inputs.nixbot.nixosModules.nixbot` in `imports`, and `gitea-mq` after `nixbot` in the aspect list.
Verify: `nix eval .#nixosConfigurations.magnetite.config.services.gitea-mq.enable` returns `true`.

- [ ] **Step 2: Build services untouched (tasks.md 5.2)**

Verify: `git diff --stat` shows no change under `modules/nixos/nixbot.nix` or `modules/nixos/buildbot.nix`; `nix eval .#nixosConfigurations.magnetite.config.services.nixbot.domain` returns `nixbot.scientistexperience.net`.

- [ ] **Step 3: Disjoint resources and no injection into gitea's unit (tasks.md 5.3)**

The controller evaluates the candidate magnetite configuration to confirm `systemd.services.gitea-mq.serviceConfig.DynamicUser` is true, `CacheDirectory` is `gitea-mq`, no `users.users.gitea-mq` exists, and the listener is `127.0.0.1:8092`.
For `forge-pre-unchanged`, compare the complete evaluated `systemd.services.gitea.serviceConfig.ExecStartPre` with an independently identified immutable source that predates S1.
Identify and record the full revision of the pre-S1 `rollup-landing` tip, the workflow-authoring commit containing no gitea-mq aspect, before evaluating it through this immutable source form:

```text
git+file:///Users/crs58/projects/vanixiets?ref=rollup-landing&rev=<full-pre-S1-revision>
```

Evaluate both that baseline and the immutable candidate with `nix eval --no-write-lock-file --json <immutable-source>#nixosConfigurations.magnetite.config --apply 'c: { pre = c.systemd.services.gitea.serviceConfig.ExecStartPre or null; }'`.
Record the baseline's full revision, evidence establishing its pre-S1 provenance, immutable source identity, and lock-file identity alongside the candidate's full revision, immutable source identity, and lock-file identity.
Retain both exact evaluation commands, exit statuses, complete results, and the comparison command, exit status, and result.
Neither the already-adopted local candidate nor a candidate with queue settings disabled is a valid baseline.
Keep task 5.3 unverified until provenance is established, both evaluations succeed, and the complete values compare equal without suppressing differences.
If the independent baseline cannot be obtained or its provenance cannot be established, record `forge-pre-unchanged` as NotRun with the reason and leave task 5.3 unchecked.
Investigate mismatches rather than selecting a baseline because it produces equality.

- [ ] **Step 4: Commit point**

`feat(gitea-mq): compose gitea-mq onto magnetite` — `modules/machines/nixos/magnetite/default.nix`.

---

### Task 6: Hostname

**Files:**
- Modify: `modules/terranix/cloudflare.nix`

- [ ] **Step 1: Declare the record (tasks.md 6.1)**

```nix
      # DNS CNAME record for the gitea-mq merge queue endpoint (resolves to magnetite)
      resource.cloudflare_dns_record.mq = {
        zone_id = config.data.cloudflare_zone.scientistexperience "id";
        name = "mq";
        type = "CNAME";
        content = "magnetite.scientistexperience.net";
        ttl = 1; # automatic
        proxied = false;
      };
```

Verify: `just terraform-plan 2>&1 | tee logs/terraform-plan-mq-$(date +%Y%m%d-%H%M%S).log` reports one to add, none to change or destroy.

- [ ] **Step 2: Apply and resolve (tasks.md 6.2)**

Run: `just terraform-apply 2>&1 | tee logs/terraform-apply-mq-$(date +%Y%m%d-%H%M%S).log`, then `dig +noall +answer mq.scientistexperience.net`.
Expected: `mq.scientistexperience.net. CNAME magnetite.scientistexperience.net.` then `magnetite.scientistexperience.net. A 49.12.12.74`.

- [ ] **Step 3: Commit point**

`feat(gitea-mq): declare mq DNS record` — `modules/terranix/cloudflare.nix`.

---

### Task 7: Build gate

- [ ] **Step 1: Instantiate (tasks.md 7.1)**

Run: `nix eval .#checks.x86_64-linux.nixos-magnetite.drvPath 2>&1 | tee logs/nixos-magnetite-eval-gitea-mq-$(date +%Y%m%d-%H%M%S).log`
Expected: a derivation path and exit 0; every assertion from Task 4 Step 3 evaluated on the way.

---

### Task 8: Rulesets (G2 gate)

**Files:**
- Modify: `openspec/changes/stand-up-gitea-mq-on-magnetite/verify.md` (before and after state, authorization interface dependency)

- [ ] **Step 1: Capture the current state (tasks.md 8.1)**

```bash
gh api /repos/cameronraysmith/vanixiets/rulesets
gh api /repos/cameronraysmith/vanixiets/rulesets/16212553
gh api /repos/cameronraysmith/vanixiets/branches/main/protection
gh api /repos/cameronraysmith/vanixiets --jq '{allow_auto_merge,allow_merge_commit,allow_squash_merge,allow_rebase_merge}'
gh api /repos/cameronraysmith/vanixiets/collaborators --jq '.[].login'
```

Capture all five in `logs/rulesets-before-$(date +%Y%m%d-%H%M%S).log` and verify.md.

- [ ] **Step 2: Present the diff and stop (tasks.md 8.2; operator gate, an agent MUST NOT tick)**

The diff and apply instructions below record the original G2 eval addition, not today's complete required set.
The operator subsequently added `nixbot/effects`; verify today's three-context set read-only under `design.md::D2`, without replaying the historical mutation or removing effects.

The original gate required presenting the following verbatim and waiting for operator approval or amendment:

```text
BEFORE  ruleset 16212553 "nixbot"  target branch  enforcement active  include ~DEFAULT_BRANCH
        rules: deletion; non_fast_forward;
               required_status_checks [nixbot/nix-build @ integration 4743700]
AFTER   same ruleset, name, enforcement, conditions, parameters, and bypass actors
        rules: deletion; non_fast_forward;
               required_status_checks [nixbot/nix-build @ integration 4743700,
                                       nixbot/nix-eval @ integration 4743700]
DIFF    add only nixbot/nix-eval @ integration 4743700; remove nothing
REVERSE remove only that added context; retain nixbot/nix-build and both protection rules
SETUP   installation creates a second App-owned ruleset "gitea-mq", requiring only its context,
        and adds the App bypass actor to ours; this is separate from the G2 operator edit
CLASSIC main protection: absent (404); no required_linear_history in either ruleset
REPO    allow_auto_merge: left true
```

Include the full captured before and proposed after API bodies with the summary above.
If live state differs from the expected baseline, ask rather than broadening the operator mutation.
Pre-creating a disabled `gitea-mq` ruleset is optional and only selects when its context starts blocking; record any separately approved activation timing.
`internal/github/setup.go::EnsureRepoSetup` returns early when that name exists and does not repair or activate it.

- [ ] **Step 3: Apply only after approval (tasks.md 8.3)**

Apply only the added `nixbot/nix-eval @ 4743700` context to ruleset `16212553`, using the approved before/after body.
Read back `gh api /repos/cameronraysmith/vanixiets/rulesets/16212553` and compare against the captured baseline: no other field changes, no rename, and no check replacement.
After installation setup, Task 11 Step 4 verifies the separate queue ruleset and App bypass.

- [ ] **Step 4: Record the authorization interface dependency (tasks.md 8.4)**

Reference the sibling R15/R16 procedure: E1 requires risk-based review before authorization by convention; ordinary trunk PRs use auto-merge, registered stacks use only the topmost intended label, and no stack member uses auto-merge.
The queue is review-blind (`internal/poller/poller.go::enqueuePR`); the App bypasses rulesets, so a review rule cannot constrain its update.
`internal/poller/poller.go::enqueueAutoMergePRs` uses `pr.BaseBranch`, while `labeledTargetBranch` resolves `stack.BaseBranch`.
`PollOnce` runs auto-merge enqueue first and `enqueueLabeledPRs` skips already-queued PRs, so auto-merge on an upper member silently wins over a correct top label and targets the wrong branch.
Collaborator counts do not establish E1 or shape compliance; the sibling owns the procedure and manual audit.

---

### Task 9: Deploy

- [ ] **Step 1: Deploy (tasks.md 9.1)**

Run: `clan machines update magnetite 2>&1 | tee logs/clan-update-magnetite-gitea-mq-$(date +%Y%m%d-%H%M%S).log`
Then on the host:

```bash
systemctl is-active gitea-mq.service
systemctl show gitea-mq.service -p User -p DynamicUser -p Environment
journalctl -u gitea-mq.service --since '-10 min' | grep -Ei 'migrat|auth|ruleset|hook|allow_auto_merge|error'
systemctl list-units --plain 'acme-mq*'
```

Expected: `active`; `User=gitea-mq DynamicUser=yes`; migrations applied, no authentication error, successful creation of the second ruleset if absent and App bypass addition to ours, no setup permission warning, and the ACME unit ran.
Confirm webhook configuration through Task 11 Step 2 rather than assuming a particular startup log message exists.

---

### Task 10: Documentation

**Files:**
- Modify: `packages/docs/src/content/docs/concepts/build-service-topology.md` (or a linked sibling)

- [ ] **Step 1: Write (tasks.md 10.1)**

Record the queue beside the two build services: hostname, App, the four landing settings and the assertion, the ruleset shape, the auto-merge disposition, and the peer-authentication coupling.
Verify: `just docs-build 2>&1 | tee logs/docs-build-gitea-mq-$(date +%Y%m%d-%H%M%S).log` succeeds and the link check passes.

- [ ] **Step 2: Commit point**

`docs(gitea-mq): record the merge queue in the build-service topology`.

---

### Task 11: Integration verification

Each step maps one to one onto tasks.md 11.1 through 11.9; the commands and expected values are stated there and are not repeated.
Record every observation in verify.md with the `[operator]` and `[verified here]` attributions the sibling change uses.

- [ ] **Step 1: Hostname and certificate, both services (11.1)**
- [ ] **Step 2: Webhook endpoint registered by the service; accepted and rejected arms (11.2)**
- [ ] **Step 3: Database and role for the dynamic user (11.3)**
- [ ] **Step 4: Two rulesets, all three nixbot contexts, App bypass, no linear-history/classic protection, `allow_auto_merge` true (11.4)**
- [ ] **Step 5: V3 check-run names and the forge-derived three-context required set; matching fallback inactive (11.5)**
- [ ] **Step 6: Four settings in the running unit's environment, including batch maximum 20 (11.6)**
- [ ] **Step 7: V2 singleton original-head shortcut under `batchMax = 20`, ordinary auto-merge (11.7)**
- [ ] **Step 8: Re-confirm discharged V1 at the first live stacked landing; retired V6 ref probe removed (11.8)**
- [ ] **Step 9: Rollback instantiation in an authorized scratch workspace; G2 reverse diff and queue-gate disabling recorded separately (11.9)**
