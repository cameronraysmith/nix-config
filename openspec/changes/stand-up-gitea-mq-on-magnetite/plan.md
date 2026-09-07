# gitea-mq on magnetite implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

<!--
Procedural note: the interactive `superpowers:writing-plans` skill was not invoked; this plan was
written by the same autonomous session that wrote tasks.md, using the schema-sanctioned manual
path. It decomposes tasks.md group by group with the same numbering, so task 4.2 in tasks.md is
Task 4 Step 2 here where the mapping is one to one and is cross-referenced where it is not.
-->

**Goal:** Stand up gitea-mq on magnetite at `mq.scientistexperience.net`, deployed by `clan machines update magnetite`, with the four landing settings the ADR fixes pinned by an assertion, a dedicated GitHub App, and the repository ruleset on `cameronraysmith/vanixiets` aligned with the fast-forward landing path.

**Architecture:** A new first-party aspect `flake.modules.nixos.gitea-mq` at `modules/nixos/gitea-mq.nix` carries the service configuration, the PostgreSQL provisioning, the nginx vhost, two clan vars generators, and the pinning assertions; the upstream `inputs.gitea-mq.nixosModules.default` is imported at the host beside `inputs.nixbot.nixosModules.nixbot`. The unit runs as a dynamic user named for the unit, authenticates to PostgreSQL by peer identity, listens on loopback port 8092 behind the host's nginx, and reads both GitHub secrets as systemd credentials from root-owned clan vars files. Two operator gates stop the plan: App registration (Task 1) and the ruleset diff (Task 8).

**Tech Stack:** nix flakes with flake-parts and import-tree; clan-core for deployment and vars; gitea-mq (`github:Mic92/gitea-mq`, `nixosModules.default`, pinned at or after `d44c455`); nginx with ACME; PostgreSQL; terranix against Cloudflare for DNS; `gh` for forge reads and the ruleset write.

## Global constraints

- Nothing under `modules/nixos/nixbot.nix`, `modules/nixos/buildbot.nix`, their generators, vhosts, or databases is edited; `sciexp-nixbot` (id `4743700`) is not touched. Verified per task by `git diff --stat`.
- The four landing settings are `batchMax = 0`, `skipQueueIfUpToDate = true`, `requiredChecks = [ "nixbot/nix-eval" "nixbot/nix-build" ]`, and no assignment to the merge label anywhere; the assertions in the aspect are the only place `GITEA_MQ_MERGE_LABEL` appears in the repository.
- Both generator files stay at the default owner `root`; the module reads them through `LoadCredential` and no static `gitea-mq` user exists.
- `listenAddr` is `127.0.0.1:8092`; `:8080` is bound by the LiveKit JWT service (`modules/nixos/matrix.nix`).
- `hideRefFromClients = false`; the default would inject an `ExecStartPre` into `systemd.services.gitea` on this host.
- The ruleset diff is applied before the first deployment, so `EnsureRepoSetup` finds a ruleset named `gitea-mq` and creates none.
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

- [ ] **Step 1: Present the registration and stop (tasks.md 1.1)**

Present to the operator, verbatim, and do not proceed until the operator reports the App id:

```text
Registration: https://mic92.github.io/gitea-mq/ (pre-fills the form) or
              https://github.com/organizations/sciexp/settings/apps/new
Name:         sciexp-gitea-mq        Owner: sciexp        Visibility: public
Homepage:     https://mq.scientistexperience.net/
Webhook URL:  https://mq.scientistexperience.net/webhook/github  (secret: leave blank; the service sets both at startup)
Repository permissions: Contents read & write, Administration read & write, Checks read & write,
                        Pull requests read & write, Commit statuses read, Metadata read
Subscribed events:      pull_request, check_run, status, installation, installation_repositories
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
Expected: `permissions` equal to `{administration: write, checks: write, contents: write, metadata: read, pull_requests: write, statuses: read}`, `events` equal to the five, `id` not `4743700`. Record in verify.md.

- [ ] **Step 3: Record the installation selection (tasks.md 1.3)**

Record `cameronraysmith/vanixiets ALONE` from the App's installations page, and the installation id from the service log once Task 9 has run.

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
      lib,
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
          appId = <App id from Task 1>;
          privateKeyFile = gen.gitea-mq-github-app-secret-key.files."key.pem".path;
          webhookSecretFile = gen.gitea-mq-github-webhook-secret.files."secret".path;
          repos = [ "cameronraysmith/vanixiets" ];
        };
        batchMax = 0;
        skipQueueIfUpToDate = true;
        requiredChecks = [
          "nixbot/nix-eval"
          "nixbot/nix-build"
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
Expected: `{"GITEA_MQ_BATCH_MAX":"0","GITEA_MQ_REQUIRED_CHECKS":"nixbot/nix-eval,nixbot/nix-build","GITEA_MQ_SKIP_QUEUE_IF_UP_TO_DATE":"true","label":false}`.

- [ ] **Step 3: Assertions (tasks.md 4.3)**

```nix
      assertions =
        let
          cfg = config.services.gitea-mq;
          adr = "docs/notes/development/version-control/adr-substitution-first-rollup-landing.md R12";
        in
        [
          {
            assertion = cfg.batchMax == 0;
            message = "services.gitea-mq.batchMax must be 0 (batch everything queued; single-entry fast-forward path) per ${adr}";
          }
          {
            assertion = cfg.skipQueueIfUpToDate;
            message = "services.gitea-mq.skipQueueIfUpToDate must be true per ${adr}";
          }
          {
            assertion = cfg.requiredChecks == [ "nixbot/nix-eval" "nixbot/nix-build" ];
            message = "services.gitea-mq.requiredChecks must be exactly nixbot/nix-eval and nixbot/nix-build per ${adr}";
          }
          {
            assertion = !(config.systemd.services.gitea-mq.environment ? GITEA_MQ_MERGE_LABEL);
            message = "GITEA_MQ_MERGE_LABEL must not be set on gitea-mq.service; the upstream default merge-queue is the pinned value per ${adr}";
          }
        ];
```

Verify, positive: `nix eval .#checks.x86_64-linux.nixos-magnetite.drvPath` succeeds.
Verify, negative control in a scratch edit to `modules/machines/nixos/magnetite/default.nix`, reverted afterward: add `services.gitea-mq.batchMax = lib.mkForce 1;`, run the same command, expect failure with the first message; replace with `systemd.services.gitea-mq.environment.GITEA_MQ_MERGE_LABEL = "x";`, expect failure with the fourth message. Capture both in `logs/gitea-mq-assertion-negative-$(date +%Y%m%d-%H%M%S).log`. Revert and confirm `git status --short` is clean.

- [ ] **Step 4: Header (tasks.md 4.4)**

Following `modules/nixos/nixbot.nix`'s header form: the two generators and how each is populated; the peer-authentication coupling (unit name `gitea-mq` is the dynamic user name is the role name); port 8092 and why 8080 is not used; `hideRefFromClients = false` and why; the precondition that the `gitea-mq` ruleset exists before first start.

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

Run: `nix eval .#nixosConfigurations.magnetite.config --apply 'c: { dyn = c.systemd.services.gitea-mq.serviceConfig.DynamicUser; cache = c.systemd.services.gitea-mq.serviceConfig.CacheDirectory; user = c.users.users ? gitea-mq; pre = c.systemd.services.gitea.serviceConfig.ExecStartPre or null; }' --json`
Expected: `dyn` true, `cache` `gitea-mq`, `user` false, and `pre` equal to the same expression evaluated on `git show HEAD` (stash the change or evaluate the parent commit in a worktree).

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
- Modify: `openspec/changes/stand-up-gitea-mq-on-magnetite/verify.md` (before and after state, collaborator set)

- [ ] **Step 1: Capture the current state (tasks.md 8.1)**

```bash
gh api /repos/cameronraysmith/vanixiets/rulesets
gh api /repos/cameronraysmith/vanixiets/rulesets/16212553
gh api /repos/cameronraysmith/vanixiets/branches/main/protection
gh api /repos/cameronraysmith/vanixiets --jq '{allow_auto_merge,allow_merge_commit,allow_squash_merge,allow_rebase_merge}'
gh api /repos/cameronraysmith/vanixiets/collaborators --jq '.[].login'
```

Capture all five in `logs/rulesets-before-$(date +%Y%m%d-%H%M%S).log` and verify.md.

- [ ] **Step 2: Present the diff and stop (tasks.md 8.2)**

Present, verbatim, and do not proceed until the operator approves or amends:

```text
BEFORE  ruleset 16212553 "nixbot"  target branch  enforcement active  include ~DEFAULT_BRANCH
        rules: deletion; non_fast_forward;
               required_status_checks [nixbot/nix-build @ integration 4743700], strict false, do_not_enforce_on_create false
        bypass: RepositoryRole 5 (admin) always
AFTER   ruleset 16212553 renamed "gitea-mq"  target branch  enforcement active  include ~DEFAULT_BRANCH
        rules: deletion; non_fast_forward; required_linear_history;
               required_status_checks [gitea-mq @ integration <App id>], strict false, do_not_enforce_on_create true
        bypass: Integration <App id> always; User cameronraysmith always; RepositoryRole 5 always
        no pull_request rule; no workflows rule
CLASSIC protection on main: unchanged (required_linear_history on, allow_force_pushes on, no required checks)
REPO    allow_auto_merge: left true (gitea-mq's setup re-enables it at every start; orchestrator is sole enabler by collaborator set)
REVERSE (rollback): PUT the BEFORE body back to /repos/cameronraysmith/vanixiets/rulesets/16212553
Question for the operator: keep the explicit User bypass beside the admin role, or rely on the admin role alone?
```

- [ ] **Step 3: Apply after approval (tasks.md 8.3)**

Write the approved body to `/tmp/gitea-mq-ruleset.json` and run:
`gh api --method PUT /repos/cameronraysmith/vanixiets/rulesets/16212553 --input /tmp/gitea-mq-ruleset.json 2>&1 | tee logs/rulesets-after-$(date +%Y%m%d-%H%M%S).log`
Verify: `gh api /repos/cameronraysmith/vanixiets/rulesets --jq '.[] | {id,name,target}'` lists exactly one branch ruleset named `gitea-mq`; its `required_status_checks` names only `gitea-mq` at the new App's id.

- [ ] **Step 4: Record the collaborator set (tasks.md 8.4)**

Verify: `gh api /repos/cameronraysmith/vanixiets/collaborators --jq '.[].login'` prints `cameronraysmith` alone; record with the two App installations in verify.md.

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

Expected: `active`; `User=gitea-mq DynamicUser=yes`; migrations applied, no authentication error, no ruleset creation, no `cannot enable allow_auto_merge` warning, a webhook-config sync line; the ACME unit ran.

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
- [ ] **Step 4: Rulesets untouched by startup setup; `allow_auto_merge` true (11.4)**
- [ ] **Step 5: V3 check-run names and the resolved required-check pair (11.5)**
- [ ] **Step 6: Four settings in the running unit's environment (11.6)**
- [ ] **Step 7: V2 and the single-entry fast-forward, end to end (11.7)**
- [ ] **Step 8: V6 observation on `refs/landings/v6-probe` (11.8)**
- [ ] **Step 9: Rollback path by instantiation, with the ruleset's reverse edit recorded (11.9)**
