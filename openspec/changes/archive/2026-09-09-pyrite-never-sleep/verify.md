# Verification Report

> This file is produced by the `openspec-verify-change` skill after apply completes, to confirm that the
> implementation is consistent with the specs / design / tasks. Any failed check must be returned to its
> corresponding artifact for correction before re-running verify.

**Change**: `pyrite-never-sleep`
**Verified at**: `2026-09-09 03:30 UTC`
**Verifier**: `verify-and-close worker agent, on pyrite over ssh; operator-triggered events marked [operator]`

This report follows the precedent of `openspec/changes/stand-up-nixbot-on-magnetite/verify.md` and carries two
roles. Sections 1 through 8 are the schema's verification report. Section 9 is the post-power-cycle machine
health record the brief for this pass required, kept here rather than in a log so it travels with the change.

Two attributions are used and never blurred.
`[operator]` marks an event only the operator could cause — sitting at the greeter, choosing *Suspend* from the
GNOME menu, holding the power button. The **event** is attributed to the operator; every **assertion about the
journal** below was re-derived in this session from `journalctl` on the machine, not accepted on report.
`[verified here]` marks an observation this session made itself.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] All items report `"valid": true`

**Result**:

```text
$ openspec validate --all --json
  "summary": {
    "totals": { "items": 26, "passed": 26, "failed": 0 },
    "byType": {
      "change": { "items": 11, "passed": 11, "failed": 0 },
      "spec":   { "items": 15, "passed": 15, "failed": 0 }
    }
  }

$ openspec validate pyrite-never-sleep --strict
Change 'pyrite-never-sleep' is valid
```

`--strict` was re-run after this pass's `tasks.md` edits and still reports valid. Two `INFO`-level notes appear
in the `--all` payload against unrelated specs ("Requirement text is very long (>500 characters)"); they are
informational, are not attached to this change's deltas, and fail nothing.

| Item | Type | Issues |
|---|---|---|
| — | — | — |

**What this does not mean.** Per this repository's `rules.verify`, `openspec validate` checks markdown structure
and delta well-formedness only. It grounds no vocabulary, enforces no alphabet discipline, and checks no
entailment. Section 8 below is agent-executed analysis and is **not** validation; nothing in §8 is licensed by
this section passing.

---

## 2. Task Completion (`tasks.md`)

- [x] All `- [ ]` have been changed to `- [x]` — 14 of 14

| Task | Reason incomplete | Blocks archive? |
|---|---|---|
| — | — | — |

Every box is checked, but they were not all discharged the same way, and the ledger says so on each one. The
discharge methods, restated here so a reader of this report alone is not misled:

| Task | Discharge method | Discharged this pass? |
|---|---|---|
| 1.1–1.4 | Evaluation + store/`/etc` inspection of the compiled dconf databases | earlier pass |
| 2.1 | `nix eval` + full `nix build` on the remote builder | earlier pass |
| 2.2 | Deploy log + live `/run/current-system` match | earlier pass |
| 2.3 | Runtime observation (`ActiveEnterTimestamp`, re-executed greeter `gsd-power`) | earlier pass |
| 3.1 | State change on the machine, with before/after dumps and a byte-for-byte backup | earlier pass |
| **3.2** | **Runtime observation, exactly as the task specifies** — environment lifted from the live uid-1000 `gsd-power` (PID 2200) `/proc/<pid>/environ` | **this pass** |
| **4.1** | **Wall-clock behavioural observation** — 50 m 56 s at the greeter, zero idle-initiated suspends | **this pass** |
| **4.2** | **Evaluation, not observation — by explicit operator decision.** No battery window was watched | **this pass** |
| **4.3** | **Evaluation, not observation — by explicit operator decision.** No panel was watched | **this pass** |
| **4.4** | **Behavioural observation** `[operator]`-triggered; all three of the task's assertions met; resume failed | **this pass** |
| 4.5 | Runtime reads, re-confirmed after the cold boot | earlier pass + this pass |

Three of those deserve to be stated plainly rather than left to the table.

**4.1 passed, and the literal command in its verify line does not return `0`.** The verify line says
`journalctl -b | grep -c "suspend requested"` returns `0`. For boot `aaca9706…` as a whole it returns **1**.
That one hit is `systemd-logind[988]: suspend requested from client PID 22217 ('.gnome-session-')` at
03:16:19 — the operator's deliberate suspend of task 4.4, which is the *other* task's subject and is precisely
the thing this change is required **not** to prevent. Scoped to the idle window the task actually describes —
02:25:13 (display-manager restart) to 03:11:01 — the count is **0**, and there is no `PM: suspend entry` and no
journal gap anywhere in it. The greeter was up from 02:25:13 until the graphical login at 03:16:09, so the
untouched interval is 50 m 56 s; the operator's conservative verified anchor is 45 m 48 s. Either is ~3× the
900 s at which the old failure fired. Reporting a bare `0` for that grep would have been false, so the report
says `1` and says why. `[verified here]`

**4.2 and 4.3 are discharged by evaluation, on the operator's explicit decision, and are labelled as such in
`tasks.md`.** Neither is a behavioural observation and neither is written up as one. The battery argument is:
the compiled GVDB was decoded **on the machine** (both file-dbs) showing `sleep-inactive-battery-timeout=0` and
`sleep-inactive-battery-type='nothing'`, the live `gsd-power` resolves both through the schema, and per
gnome-settings-daemon 50.1 `idle_configure()` either key alone suppresses registration of the idle sleep watch
— the guard is `if (timeout_sleep != 0) { if (action_type != GSD_POWER_ACTION_NOTHING) { … } }` with both watch
ids cleared unconditionally beforehand. The 4.1 observation confirms that mechanism end-to-end on this machine;
the battery path differs only in which key pair `idle_configure()` reads for the current power source. What
remains unretired is that this last step is a source-level reading, not a watched machine on battery. 4.3 is
the weaker of the two: `idle-delay` is intact at `uint32 1800` and the diff touches no screensaver key, which
shows the change did not *break* blanking and locking, not that the panel was seen to blank. Both residuals are
carried as rows in §7.

---

## 3. Delta Spec Sync State

Delta spec files reported by the CLI
(`openspec status --change "pyrite-never-sleep" --json | jq -r '.artifactPaths.specs.existingOutputPaths[]'`):

```text
openspec/changes/pyrite-never-sleep/specs/graphical-desktop-session/spec.md
openspec/changes/pyrite-never-sleep/specs/world-assumptions/spec.md
```

| Capability | Sync status | Notes |
|---|---|---|
| `graphical-desktop-session` | pending sync | `openspec/specs/graphical-desktop-session/spec.md` exists and carries one requirement, `The pyrite host provides a local GNOME desktop under GDM`. The delta is `ADDED Requirements` with `The laptop does not suspend itself when nobody is using it`, which the main spec does not yet hold. Correct state for an unarchived change. |
| `world-assumptions` | pending sync | Main spec holds A1–A8 plus `Grounded vocabulary for behavioral requirements`. The delta `ADD`s A13 and `MODIFIES` the vocabulary requirement. Correct state for an unarchived change. |

Pending sync is the right state before archive; nothing here is drift.

**One coordination hazard, verified and non-blocking.** `design.md`'s closing paragraph warns that
`stand-up-nixbot-on-magnetite` is also unarchived and also `MODIFIES` the vocabulary requirement, and that a
`MODIFIED` delta must carry full updated content. Checked: the main spec's table today ends at
`extension directory` and says "Ten terms carry two senses"; this change's delta says "Twelve", and its table
is the living corpus rows **plus** nixbot's rows (`repository | recoverability` / `repository | forge-hosted`,
`build service` ×2, `forge`, `forge application`, `delivery`, `check run`, `required check`, `hostname`,
`certificate`, `forge credential`, `build capacity`, `operator`) **plus** this change's eight
(`suspended state`, `inactivity`, `wake source`, `panel`, `login screen`, `desktop session`, `settings panel`,
`power source`). The convergence design.md claims is real: whichever archives first, the other's rows survive.
If nixbot is abandoned rather than archived, its fourteen rows arrive here anyway and must be removed
deliberately — that is a live obligation on whoever archives this change, not a defect in it.

---

## 4. Design / Specs Coherence Spot Check

| Sampled item | design description | specs correspondence | Gap |
|---|---|---|---|
| D1, `autoSuspend = false` over a hand-written greeter profile | `design.md:5-11` — go through the vendored option to avoid the list-merge ordering hazard; the option is all-or-nothing across AC and battery, accepted | `specs/graphical-desktop-session/spec.md:12-15` scenario "Nobody touches the machine at the login screen" states the greeter behaviour "on mains power or on battery", which is exactly the all-or-nothing consequence D1 accepts | none |
| D2, `-type` keys as the operative control | `design.md:13-24` | `spec.md:5` states the requirement in world terms only and names no key; the mechanism stays in design and tasks, as `proposal.md:57` says it should | none — and this is the alphabet discipline working |
| D3, no `locks`, clear the stale user keys operationally | `design.md:26-32` | `spec.md:27-31` scenario "A person changes the power settings from the desktop's own settings panel" makes the drift a *stated property* of the requirement rather than a hole in it, and `spec.md:31` refuses to claim a guarantee | none |
| D4, retain `idle-delay = 1800` | `design.md:34-36` | `spec.md:6` and `spec.md:17-20` scenario "Nobody touches the machine during a desktop session" | none |
| Designation finding | `design.md:38-45` — the table has no rows for this change's subject matter; world-side terms are added, machine-side names are kept out of the requirement | `specs/world-assumptions/spec.md:71-78` adds exactly the eight world/shared rows | none |
| A13 as the discharge | `design.md` throughout treats the resume defect as untouched | `spec.md:8` names A13 explicitly; `specs/world-assumptions/spec.md:3-13` states A13 indicatively with a violation condition that is the *opposite* observation | none |

**Drift warnings** (non-blocking):

- `design.md:3` says "Four decisions and one honest finding. The diagnosis is in `logs/`". That remains accurate.
- No drift found between `design.md` and the deltas. One pre-existing inconsistency, which `design.md:45`
  already records and this change deliberately does not fix: the incumbent `graphical-desktop-session`
  requirement in the main spec names `nix eval`, option paths and nixpkgs source lines directly, which is not
  world vocabulary for a `behavioral` capability. The requirement added here does not follow that precedent.
  Recorded, not resolved — resolving it inside a power-policy change would be scope creep.

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree that belong to this change
- [ ] All related commits have been pushed — **not pushed; see below**

**Commit range**: `7af9fb8e2..e116779f2`

```text
7af9fb8e2 docs(openspec): propose pyrite-never-sleep
e116779f2 feat(pyrite): never auto-suspend on idle
        modules/machines/nixos/pyrite/default.nix    | 34 ++++++-
        openspec/changes/pyrite-never-sleep/tasks.md | 95 +++++++++++++++---
```

`git status --porcelain` `[verified here]` reports exactly three modified paths, **none of which belong to this
change**: `openspec/changes/stand-up-gitea-mq-on-magnetite/proposal.md`,
`terraform/terraform.tfstate`, `terraform/terraform.tfstate.backup`. Those are other agents' concurrent
in-flight edits in this shared jj-colocated working copy and were left untouched. This change's own code file,
`modules/machines/nixos/pyrite/default.nix`, is clean and committed at `e116779f2`.

The two files this pass edited — `openspec/changes/pyrite-never-sleep/tasks.md` and this `verify.md` — are
uncommitted by design: this session ran no writing `jj` or `git` command, because the orchestrator owns routing
on the active 5-chain diamond.

**Push state, stated honestly rather than ticked.** `HEAD` is detached (normal for jj-colocated) at the join
commit `feb0e0364`, and `git log --oneline origin/main..HEAD | wc -l` returns **47**. This change's two commits
are among those 47 and are therefore **not on `origin/main` yet**. That is the expected state of an in-flight
diamond and is not a defect of this change; it is a routing obligation for whoever lands the chain, so the box
is left unticked rather than ticked with a caveat.

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

Design output should not land in `docs/superpowers/specs/` (the brainstorm artifact's
output redirection routes it to the change's resolved brainstorm.md — the `brainstorm`
entry in `artifactPaths` from `openspec status --change "pyrite-never-sleep" --json`).

Detect:

```bash
$ ls docs/superpowers/specs/*.md 2>/dev/null
(no output — the directory does not exist)
```

- [x] No files

**Leak list** (if any):

| File | Content captured into change? | Recommended action |
|---|---|---|
| — | — | — |

This change's brainstorm landed at
`/Users/crs58/projects/vanixiets/openspec/changes/pyrite-never-sleep/brainstorm.md`, which is the CLI-resolved
`artifactPaths.brainstorm.resolvedOutputPath`. No leak.

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

**`plan.md` does not exist for this change.** `openspec status` reports
`artifactPaths.plan.existingOutputPaths: []`, and `openspec instructions verify` emits
`This artifact has unmet dependencies … Missing: plan`. There are therefore no `[~]` rows, and by the template's
own rule this section may be left blank. It is filled in anyway, because leaving it blank here would hide two
real residuals: `tasks.md` carries the manual-check role `plan.md` would have carried, and two of its boxes were
discharged by evaluation rather than by the observation their verify lines describe.

| Deferred dogfood (source) | Equivalent automated test | Coverage assessment | Real gap? |
|---|---|---|---|
| `tasks.md` 4.2 — 35 min logged-in idle **on battery**, expect no suspend | none exists, and none can: this is a NixOS host's runtime GNOME behaviour, not a buildable check. Nearest substitutes actually run: compiled-GVDB decode on the machine (`sleep-inactive-battery-timeout=0`, `sleep-inactive-battery-type='nothing'` in both file-dbs), live `gsd-power` schema read, and `idle_configure()` source reading showing either key alone suppresses watch registration | Config layer: verified on the machine, twice, including after a cold boot. Resolution layer: verified through the daemon's own environment. Behaviour layer: verified **only on AC** (4.1, 50 m 56 s). The battery branch is covered by a source argument that it shares one code path and one watch with the AC branch | **yes — narrow.** The mechanism is observed end-to-end on AC; the battery key pair is not observed. Closing it costs one 35-minute unplugged window and no redeploy |
| `tasks.md` 4.3 — panel blanks at ~30 min and `LockedHint=yes` | none exists, same reason | `idle-delay = uint32 1800` intact in the compiled user file-db and as the live `gsd-power` resolves it; no `org/gnome/desktop/screensaver` key added or removed; diff confined to four power keys plus comments (task 1.4). This establishes *non-regression*, not the behaviour | **yes.** No one watched a panel. Closing it costs one 30-minute idle window and no redeploy |
| `tasks.md` 4.4 — a usable wake after a deliberate suspend | none exists | The suspend **invocation** is fully observed and passing (§2, and the detail in `tasks.md` 4.4). The wake is not, and cannot be, covered by this change | **no — out of scope by construction.** This is CAM-59, named as a non-goal in `proposal.md:67` and as world assumption A13. It is not this change's gap; it is the fact this change exists because of |

Follow-up for the two `yes` rows belongs in the retrospective's Misses, per the interpretation rules. Neither
downgrades the Overall Decision on its own; both are why the decision below is PASS **WITH WARNINGS** rather
than a clean PASS.

---

## 8. Designation Lint and Discharge Coherence (warning, non-blocking)

`openspec validate` (section 1 above) checks markdown structure and delta well-formedness only.
It performs no vocabulary grounding, no alphabet discipline, and no entailment check.
Nothing below is validation; it is the agent-executed, warn-and-record analysis this schema's `verify` artifact
defines as section 8, and it must never be reported as validation.

### 8a. Designation lint

`proposal.md:56` tags `graphical-desktop-session` as `behavioral`, so its delta is the one lint subject.
`openspec/specs/world-assumptions/spec.md` **exists** and carries a designation table (main spec lines 98–132),
so the lint is not vacuous — but the table is resolved here as this change leaves it, i.e. including the eight
rows this change's `world-assumptions` delta adds, since the two deltas archive together.

Content nouns extracted from `specs/graphical-desktop-session/spec.md` requirement and scenario statements:

| Requirement | Resolved against the table | Unresolved — machine noun | Unresolved — world-flavored gap |
|---|---|---|---|
| `The laptop does not suspend itself when nobody is using it` | `host` (fleet sense), `suspended state`, `inactivity`, `login screen`, `desktop session`, `panel`, `settings panel`, `power source`, `wake source` (via the A13 reference), `policy` (fleet sense, as "declared fleet policy"), `operator` | **none.** No dconf key, no `gsd-power`, no `autoSuspend`, no GNOME or nixpkgs name appears anywhere in the requirement or its four scenarios | `laptop` — used in the requirement title; no row. Almost certainly the `host \| fleet` phenomenon under a colloquial name, but the table does not say so. `person` — used throughout ("no person interacts", "a person changes the power settings"); the table has `operator` but no `person`, and the two are not the same phenomenon (any person at the panel vs the fleet's maintainer). `network` — scenario 1's "remains reachable over the network"; no row, and it is a shared phenomenon that ought to have one |

Three unresolved world-flavored nouns, zero unresolved machine nouns. Per the vocabulary requirement's own
scenario "A behavioral requirement uses an unlisted term", each needs an explicit disposition rather than
silence. Recommended disposition, recorded here and **not** applied — editing the delta table during a verify
pass would be verifying my own edit:

- `laptop` → either add a row, or restate the requirement title using `host`. Preferred: restate the title, since
  a synonym row invites more synonyms.
- `person` → add a row. It is genuinely distinct from `operator` and the requirement leans on that distinction:
  the point is that *anybody* at the panel can suspend deliberately, not only the fleet's maintainer.
- `network` → add a shared row, or drop "and remains reachable over the network" from scenario 1. The clause is
  doing real work (it is why an unattended suspend is a cost), so a row is the better answer.

This is a lexer pass, not a semantic one. It is a warning, and it does not block.

### 8b. Discharge coherence

| Requirement | Discharged by (S) | Under (W) | Status |
|---|---|---|---|
| `graphical-desktop-session` — `The laptop does not suspend itself when nobody is using it` (ADDED, behavioral) | **no interface property named.** `proposal.md:57` states deliberately that this change creates no interface capability, on the grounds that it changes the *value* of an existing machine property rather than introducing a new one. The properties that in fact discharge it — the greeter dconf database written by `autoSuspend = false`, and the four keys in the user database — are named only in `design.md` and `tasks.md`, which are not vocabulary-governed | A13 — `Resuming this laptop from a suspended state is unreliable, and recovering a failed resume requires a person at the machine` (named explicitly at `spec.md:8`) | **undischarged (no S)** — recorded, not accepted silently. Follow-up below |
| `world-assumptions` — A13 (ADDED, world) | n/a — a world assumption is a discharger, not a dischargee. Its own standing rests on `logs/pyrite-resume-failure-diagnosis.md` §1.3 (7/30 across 14 boots) and, as of this pass, on one further failure | n/a | grounded |
| `world-assumptions` — `Grounded vocabulary for behavioral requirements` (MODIFIED, world) | the designation table itself, which is the artifact the requirement requires to exist | n/a | discharged, with the three §8a gaps outstanding against it |

**Follow-up for the undischarged row.** Two dispositions are legitimate and the choice is the operator's, not
mine: (a) accept `design.md`'s reasoning as final and record in the retrospective that a behavioral requirement
in this corpus may be discharged by a world assumption plus an un-specified existing machine property; or (b)
promote the greeter/user dconf database content to a small `machine-interface`-stratum capability, giving the
requirement a named S. Option (b) is the schema-purer answer and would also give 4.2's evaluation discharge
something to point at. Recorded for retrospective §6 Promote, destination `architecture-decision`. **This is
warn-and-record; per the rule, it is neither omitted nor silently accepted.**

### 8c. Alphabet check

Behavioral requirements must not name interface phenomena, and interface requirements must not reference world
state the machine cannot observe.

**Violations found**:

- **In this change's deltas: none.** `specs/graphical-desktop-session/spec.md` names no machine phenomenon in
  any of its five statements — no key, no daemon, no option path — which is the discipline `design.md:42` set
  out to keep and did keep. A13 is stated indicatively throughout ("It is true of this fleet's…", "It is further
  true of this host that…"), never optatively, and its scenario is a violation condition in the required form
  ("WHEN this host is observed to resume reliably … THEN this assumption is void, and …
  loses the reason it exists"). This change introduces no interface capability, so the interface half of the
  check has no subject.
- **Pre-existing, outside this change, recorded because §8c asks what is true and not what this change caused:**
  the incumbent requirement in `openspec/specs/graphical-desktop-session/spec.md` names `nix eval`, module
  option paths and nixpkgs source lines inside a `behavioral` capability. `design.md:45` already records this
  and declines to fix it here. Not rewritten in this pass — §8c says record violations, do not rewrite the spec.

> Non-blocking on its own. Blocks only if this section is left empty AND the proposal tagged any capability
> `world` or `interface` — the proposal does tag `world-assumptions` as `world`, so this section was mandatory,
> and it is filled.

---

## 9. Post-Power-Cycle Machine Health (this pass, `[verified here]`)

The `[operator]` power cycle at 03:18:21 UTC is a **fresh test of whether this change's configuration survives a
cold boot**, which no prior pass could run: every earlier confirmation was on a warm activation where
`/run/booted-system` and `/run/current-system` differed. All reads below are on boot `0` (`55dc8d7c…`).

### 9.1 Generation, units, uptime

| Check | Result | Reading |
|---|---|---|
| `readlink -f /run/booted-system` | `/nix/store/br1zazj6bp3ksa7r84ngzhi3c42xhbiw-nixos-system-pyrite-26.11.20260804.85f6261` | — |
| `readlink -f /run/current-system` | **identical** `br1zazj…` | The mismatch reported in `logs/pyrite-never-sleep-postdeploy.md` §4.3 is **resolved**. The machine booted *into* the deployed generation; nothing about this change depended on an activation-only state any more |
| `systemctl --failed` | `0 loaded units listed` | clean |
| `uname -r` | `6.18.42` | unchanged across the cycle |
| `uptime` | up 0:02 at 03:21:30 | consistent with the 03:18:21 boot |
| `journalctl -b \| grep -c "PM: suspend entry"` | `0` | no suspend since the cold boot |
| `journalctl -b \| grep -ci "suspend requested"` | `0` | — |

### 9.2 `wlp2s0` survived

```
$ ip -br link show wlp2s0
wlp2s0  UP  38:f9:d3:4d:94:10  <BROADCAST,MULTICAST,UP,LOWER_UP>
$ ip -br addr
wlp2s0      UP       192.168.50.122/24 …
zt554fbdjy  UNKNOWN  10.147.17.2/24 …
$ nmcli -t -f DEVICE,TYPE,STATE dev
wlp2s0:wifi:connected
```

Present, up, associated, holding its address, and ZeroTier is up — this whole verification pass was conducted
over it. `retrospective.md:233-234`'s standing hazard is that `wlp2s0` is lost across a **warm reboot**; this was
a cold power cycle and the interface came back. The PCI function is present too: `0000:02:00.0`, `14e4:43a3`
(BCM4350), power state `D0`.

### 9.3 The Alpine Ridge Thunderbolt subtree survived

Every function in the subtree named in `logs/pyrite-resume-failure-diagnosis.md` §7's PCI table is present:

| BDF | ID | Device | Power state |
|---|---|---|---|
| `0000:00:1c.4` | `8086:9d14` | PCIe root port | `D0` |
| `0000:04:00.0` | `8086:1578` | **Alpine Ridge 4C upstream bridge** | `D0` |
| `0000:05:00.0` | `8086:15d3` | downstream bridge | `D0` |
| `0000:05:01.0` | `8086:15d3` | downstream bridge | `D3hot` |
| `0000:05:02.0` | `8086:15d3` | downstream bridge | `D3hot` |
| `0000:05:04.0` | `8086:15d3` | downstream bridge | `D3hot` |
| `0000:06:00.0` | `8086:15d2` | Thunderbolt NHI | `D0` |
| `0000:07:00.0` | `8086:15d4` | Thunderbolt xHCI | `D3hot` |

`/sys/bus/thunderbolt/devices/` holds `domain0` and `0-0` (`Apple Inc.` / `Macintosh`), i.e. the host router is
enumerated. `journalctl -b | grep -c "Unable to change power state"` → **0**: no D3cold→D0 restore failures at
all this boot, which is expected, since that breakage appears on *resume* and there has been no resume. The
`D3hot` states on the idle downstream bridges and the xHCI are normal runtime PM for unoccupied ports, not the
`D3cold`/`unknown` wedge the diagnosis describes.

This is the good case of the `retrospective.md` finding: boot −4 in the diagnosis came up from a **warm reboot**
with the entire subtree *absent*. A cold power cycle brought it back intact.

### 9.4 The never-suspend configuration is still in force after the cold boot

Both compiled GVDBs decoded on the machine, each in an isolated single-database profile stub
(`DCONF_PROFILE=/tmp/vxprof2/…`, throwaway, sets no keys):

```
$ cat /etc/dconf/profile/gdm
user-db:user
file-db:/nix/store/r4clhhgiag7ndgn7vaka42sqisy0hb5p-dconf-db
file-db:/nix/store/3jlw9jlpwn9l4x6mf05mn8vayx5lyiks-check-dconf-db

$ DCONF_PROFILE=/tmp/vxprof2/gdm-ns dconf dump /          # the greeter's never-suspend db
[org/gnome/settings-daemon/plugins/power]
sleep-inactive-ac-timeout=0
sleep-inactive-ac-type='nothing'
sleep-inactive-battery-timeout=0
sleep-inactive-battery-type='nothing'

$ cat /etc/dconf/profile/user
user-db:user
file-db:/nix/store/xffqrfxrqgs2p8h8bqsf6cqsbzzc72y3-dconf-db

$ DCONF_PROFILE=/tmp/vxprof2/user-filedb dconf dump /
[org/gnome/desktop/session]
idle-delay=uint32 1800

[org/gnome/settings-daemon/plugins/power]
sleep-inactive-ac-timeout=0
sleep-inactive-ac-type='nothing'
sleep-inactive-battery-timeout=0
sleep-inactive-battery-type='nothing'
```

Same store hashes as before the cycle, still ordered ahead of gdm's own `greeter-dconf-defaults`, all values
intact.

**And the 3.1 reset held.** A cold boot plus a fresh graphical login is exactly the situation in which GNOME
could have written the panel's values back:

```
$ DCONF_PROFILE=/tmp/vxprof2/only-user dconf dump /org/gnome/settings-daemon/plugins/power/
(empty)
$ stat -c '%y %s' ~/.config/dconf/user
2026-09-09 02:29:30.460988604 +0000 3772
```

Empty, and the file's mtime and size are unchanged from the moment of the reset — the boot and the new session
did not touch it.

**Read through the live daemon's own environment** (this is also what closed task 3.2): `gsd-power` PID 2200,
uid 1000, `user@1000.service`, started 03:19:00; `XDG_DATA_DIRS`, `XDG_RUNTIME_DIR` and
`DBUS_SESSION_BUS_ADDRESS` lifted from `/proc/2200/environ`:

```
sleep-inactive-ac-timeout        = 0
sleep-inactive-ac-type           = 'nothing'
sleep-inactive-battery-timeout   = 0
sleep-inactive-battery-type      = 'nothing'
session idle-delay               = uint32 1800
```

The configuration is in force after the cold boot, on both the greeter and the logged-in session.

### 9.5 Out-of-scope items still where they were, after the cycle

`HandleLidSwitch` → `s "lock"`. `IdleAction` → `s "ignore"`. ACPI wakeup: `PNP0C0D:00 disabled` (lid),
`PNP0C0C:00 enabled` (power button) — the power button is still the sole wake source and the reboot did not
re-arm the lid. `disable-d3cold-all`, `nvme-d3cold-suspend-guard` and `disable-lid-wakeup` all still `enabled`.

**No suspend was invoked by this session.** `systemctl suspend` was not run and `Suspend()` was not called. No
deploy was performed and `clan machines update` was not run. The only writes anywhere were the two repository
files listed at the end of this report, plus three throwaway profile stubs under `/tmp/vxprof2` on pyrite, which
set no keys and change no state (`rm -rf /tmp/vxprof2` at will; likewise `/tmp/vxprof` from the previous pass,
which still holds the pre-reset dconf backup).

---

## Overall Decision

- [ ] (pass) PASS — may proceed to finishing-a-development-branch and archive
- [x] (warn) PASS WITH WARNINGS — may proceed to subsequent steps but note the four items below
- [ ] (fail) FAIL — return to the failed artifact, correct it, then re-run verify

### Why this is a PASS, and specifically why the failed resume is not a FAIL

This judgement is reached from the acceptance criteria as written, and it would have been a FAIL if they read
differently. Setting out the reasoning so it can be checked rather than taken:

**The requirement under test** (`specs/graphical-desktop-session/spec.md:5-6`) has two clauses. First: the host
"SHALL NOT enter a suspended state on account of inactivity alone", at the login screen or in a session, on AC
or on battery. Second: "A person SHALL remain able to suspend the host deliberately", and the host shall still
blank and lock its panel.

**Clause one is satisfied, and observed.** 50 m 56 s at the greeter on AC with zero idle-initiated suspends, and
zero `PM: suspend entry`, against a prior failure mode that fired at 900 s. The only suspend anywhere in that
boot was a person choosing one. The battery half is discharged by evaluation rather than observation and is
recorded as such, with the residual named in §7.

**Clause two is satisfied, and it is the clause the 4.4 event tests.** The scenario written for it
(`spec.md:22-25`) reads: "**WHEN** an operator chooses to suspend the host, from the desktop or from a shell —
**THEN** the host suspends, unchanged by this requirement, and the operator accepts the resume risk knowingly on
that occasion." The operator chose *Suspend* from the desktop menu; the host suspended. `disable-d3cold-all`
and `nvme-d3cold-suspend-guard` both ran and both succeeded on that transition; `PM: suspend entry (deep)` and
`Performing sleep operation 'suspend'` are both in the journal. The scenario's THEN is met in full. **It does
not mention resuming**, and that is not an oversight to be read around: the very next words are "the operator
accepts the resume risk", which presupposes the risk is live and unremoved. Task 4.4's own verify line makes the
same three assertions, all of which passed, and pre-declares that "a failed resume here is the known defect and
is not a regression from this change".

**The failed resume confirms the requirement's discharging assumption rather than breaching the requirement.**
A13 states indicatively that resuming this laptop is unreliable and that recovery needs a person at the machine.
Its violation condition (`world-assumptions/spec.md:10-13`) is the *opposite* observation — that the host is seen
to resume reliably, at which point the requirement "loses the reason it exists". A resume failure therefore
strengthens A13 and strengthens the case for the requirement. Reading it as a FAIL would be reading a change
whose entire premise is "resume is broken and we cannot fix it" as failing because resume is broken.

**Nothing in the change touches the suspend path.** Task 1.4: four dconf-key lines and comments, no hunk on
`services.logind.settings.Login`, `disable-d3cold-all`, `nvme-d3cold-suspend-guard`, `disable-lid-wakeup` or
`boot.kernelParams`. The defect predates the change by 7 recorded failures against 30 successes across 14 boots,
is tracked as CAM-59, and is named a non-goal at `proposal.md:67`.

**What would have made this a FAIL, and did not happen.** If the requirement or its scenario had said the host
resumes, or that manual suspend is *usable*, the outcome would be a FAIL and this report would say so — the
evidence would not have changed, only the criterion. If the manual suspend had been *prevented* — a masked
`sleep.target`, a blocking inhibitor, `CanSuspend` → `no` — that would be a FAIL against clause two, and against
`proposal.md:66`'s explicit non-goal. If a guard unit had failed on the transition, that would be a FAIL,
because those units are wired in `RequiredBy=systemd-suspend.service` and a failure would mean this change had
disturbed them. None of those occurred. What did occur is a datapoint for a defect this change exists to reduce
exposure to.

**One thing this PASS does not say.** It does not say suspend on pyrite is safe, or that "pyrite's suspend
problem is solved" — `proposal.md:67` warns that anyone reading these artifacts that way has read them wrong,
and this report repeats the warning. Eight recorded resume failures now, not seven.

### The four warnings

1. **4.2 discharged by evaluation, not observation** (operator's explicit decision). The battery branch's
   *behaviour* is unobserved; its configuration and the shared code path are verified. §7 row 1.
2. **4.3 discharged by evaluation, not observation** (same decision), and it is the weaker argument: it
   establishes non-regression of blanking and locking, not the behaviour. §7 row 2.
3. **The behavioral requirement has no named discharging interface property** (§8b). Recorded `undischarged`
   with two legitimate dispositions for the operator to choose between; must not be silently accepted at archive.
4. **Three unresolved world-flavored nouns in the designation lint** — `laptop`, `person`, `network` (§8a).
   Dispositions recommended, deliberately not applied in a verify pass.

Two further facts, recorded but not counted as warnings because neither is a defect: `plan.md` does not exist
for this change, so the schema's `verify` dependency is formally unmet (§7); and this change's commits are not
yet on `origin/main`, which is the ordinary state of an in-flight diamond chain (§5).

**Next step**:

Proceed to the retrospective. Carry into it: the two §7 coverage gaps as Misses with the follow-up named
(each is one idle window and needs no redeploy); the §8b undischarged row as a Promote with destination
`architecture-decision`; the three §8a designation rows as vocabulary follow-ups; and the eighth resume failure
as a new datapoint for `logs/pyrite-resume-failure-diagnosis.md` §4.5 — noting that it is a **counterexample to
that file's "the first suspend of a boot never fails (7/7)" asymmetry**, since this one was the first suspend of
its boot. Then, at archive, honour `design.md`'s warning about the `world-assumptions` table converging with
`stand-up-nixbot-on-magnetite` (§3). Do not archive while the §8b row is unresolved either way.
