# Retrospective: pyrite-never-sleep

> Written: 2026-09-09 (after verify passed with warnings)
> Commit range: `7af9fb8e2..e116779f2` (the change's two commits on the active jj diamond development join)
> Worktree: jj diamond development join, no git worktree; version control is orchestrator-owned and this artifact was authored under a no-writing-VCS-command constraint

---

## 0. Evidence

> Up-front quantified data; the sections below reference these figures rather than re-citing them per line.

- **Commit range**: `7af9fb8e2..e116779f2` (2 commits), recorded at `verify.md:169-176`.
  `7af9fb8e2 docs(openspec): propose pyrite-never-sleep` and `e116779f2 feat(pyrite): never auto-suspend on idle`.
  Neither is on `origin/main`; `verify.md:188-192` records 47 commits between `origin/main` and the join head, which is the ordinary state of an in-flight diamond and a routing obligation rather than a defect.
- **Diff size**: +393 / −2 lines across 7 files (`git diff --shortstat 7af9fb8e2~1 e116779f2`).
  The only non-`openspec/` file is `modules/machines/nixos/pyrite/default.nix` at +34/−2; the remaining 6 files are this change's own artifacts.
- **Tasks done**: 14/14 (`grep -cE '^\s*- \[x\]' tasks.md` → 14; `grep -cE '^\s*- \[ \]'` → 0).
  They were not all discharged the same way, and `verify.md:69-81` carries the per-task discharge-method ledger: two boxes (4.2, 4.3) are discharged by evaluation rather than by the observation their verify lines describe, by explicit operator decision, and are labelled as such in `tasks.md` rather than passed off as behavioural.
- **Active hours**: ~2 h 46 min by first-to-last commit timestamp (2026-09-08T19:21:23−04:00 → 22:07:37−04:00).
  The cycle's wall-clock span is longer — verification ran to 2026-09-09 03:30 UTC (`verify.md:8`) — because verification here is measured in idle windows that must actually elapse on the machine, not in agent time.
- **Subagent dispatches**: not instrumented as a total.
  Five are evidenced by the artifacts they wrote: three pre-change read-only diagnosis reports (`logs/pyrite-idle-suspend-diagnosis.md`, `logs/pyrite-graphical-session-idle-evidence.md`, `logs/pyrite-resume-failure-diagnosis.md`), the change-creation pass (`logs/pyrite-never-sleep-change-creation.md`), the apply-verification pass (`logs/pyrite-never-sleep-verify-apply.md`), the post-deploy pass (`logs/pyrite-never-sleep-postdeploy.md`), and the verify-artifact review (`logs/pyrite-never-sleep-verify-md.md`).
- **New external dependencies**: none.
  No flake input, no package, no module import. The change is four dconf keys, one vendored option, and a comment.
- **Bugs encountered post-merge**: none post-archive (not merged at write time).
  One genuine negative was produced *during* verification and recorded rather than smoothed over: the operator's deliberate suspend reproduced CAM-59 (§2, §5).
- **OpenSpec validate state at archive**: pass.
  `openspec validate pyrite-never-sleep --strict` exits 0 with "Change 'pyrite-never-sleep' is valid"; `openspec validate --all --json` reports 26/26 items valid (`verify.md:30-41`).
  The two delta capabilities report "pending sync" at `verify.md:121-124`, which archive resolves.
- **Test coverage signal**: no executable test suite exists or can exist for this deliverable.
  The unit under test is a running GNOME session on one physical laptop. The severe checks actually run are: `nix eval` of the four dconf keys and `autoSuspend`, a full `nix build` of the toplevel on the remote builder, `dconf dump` decoding of both compiled GVDBs **on the machine** in isolated single-database profile stubs, a schema read through the live `gsd-power`'s own `/proc/<pid>/environ`, and one 50 m 56 s wall-clock idle window at the greeter.

Commit chain (chronological):

```text
7af9fb8e2 docs(openspec): propose pyrite-never-sleep
e116779f2 feat(pyrite): never auto-suspend on idle
```

---

## 1. Wins

- [`logs/pyrite-idle-suspend-diagnosis.md` §1.1–§1.4; `proposal.md:26`]
  **The root cause was in a profile nobody had looked at, and the diagnosis found it by reading the initiator rather than the configuration.**
  The declared dconf policy was correct and effective for the logged-in user the entire time. The suspends came from the GDM *greeter*, which reads the `gdm` dconf profile, not `user` — two profiles, two daemons, the same `gsd-power` binary under two uids.
  `systemd-logind`'s own client attribution is what discriminated: `suspend requested from client PID 8844 ('.gsd-power-wrap') (unit user@60578.service)`, uid 60578 = `gdm-greeter`, with two consecutive suspends at 15 m 01 s and 15 m 00 s matching the schema default of 900 s exactly.
  The first diagnosis pass had hypothesised that the declared values were not taking effect; it was half right, for the wrong user. Configuration-first reading would have kept confirming that the user profile was fine, which it was.

- [`logs/pyrite-graphical-session-idle-evidence.md` §5, §0; `design.md:26-32`]
  **A stray `~/.config/dconf/user` entry was silently supplying the behaviour the flake was being credited for.**
  AC never-suspend appeared to work. It worked because GNOME Settings wrote `sleep-inactive-ac-type='nothing'` and `sleep-inactive-ac-timeout=3600` into the user's own dconf database at 22:33:44 on 2026-09-08 — **52 seconds after that login** — and `user-db:user` outranks the Nix file-db in `/etc/dconf/profile/user`.
  This is not a bug; the module omits `locks` deliberately so the settings panel can win, and the no-`locks` decision makes exactly this possible by design. The win is that the change did not paper over it: task 3.1 resets those two keys at deploy time so the flake is authoritative, and `spec.md:27-31` promotes the drift to a *stated property* of the requirement rather than leaving it as a hole.

- [`logs/pyrite-never-sleep-verify-apply.md` §2 (`:160-185`)]
  **An agent's plausible source reading was wrong, and it was caught only by evaluating rather than by re-reading.**
  A comment claimed a zero timeout "only avoids firing a watch that is still armed". False. At gnome-settings-daemon tag `50.1`, `plugins/power/gsd-power-manager.c`, `idle_configure()`, the type guard at `:2105` is **nested inside** `if (timeout_sleep != 0)` at `:2102`, and both watch ids are cleared unconditionally at `:2082` and `:2084` — so either key alone suppresses registration.
  The correction was comment-only and changed no code line, but the mechanism matters: this repository's own `openspec/config.yaml` already says nix-managed outputs are not verified by reading the source, and this cycle shows the same discipline has to extend to reading *upstream C* to justify a config choice. The claim survived one review and died the moment the actual guard nesting was looked at.

- [`logs/pyrite-never-sleep-verify-apply.md` §"Schema cross-check — gnome-settings-daemon tag `50.1`" (`:78-95`)]
  **Acquiring the upstream source locally changed the evidence quality, not just its convenience.**
  The first reading fetched a single raw file over HTTP (`logs/pyrite-graphical-session-idle-evidence.md:327`). `gnome-settings-daemon` was then promoted to a full clone at `~/ghq/gitlab.gnome.org/GNOME/gnome-settings-daemon` and every claim re-verified with `git show 50.1:<path>` against the tag the store path actually names.
  The guard sits at `:2105` at tag `50.1` and at `:2145` on `main` — precisely the drift that makes a `main`-based citation quietly wrong a release later, with nothing in the citation to signal it. A clone also made the schema, the enum header (`gsd-enums.h:94-103`), and the meson nick generation (`data/meson.build:33-39`) checkable at the same revision, which is what closed the "is `nothing` a valid nick" question with output evidence rather than inference.

- [CAM-60 comment, closing `logs/pyrite-remote-wake-feasibility.md`'s "What I could not verify" item (`:443-449`)]
  **A tool declared unavailable was available all along, and running it strengthened rather than weakened the conclusion.**
  The earlier report could not obtain `iw phy` output because `iw` was not installed on pyrite and installing it would have modified a target the investigation was forbidden to modify — a correct constraint, wrongly resolved. `nix run nixpkgs#iw -- phy` needs no installation and adds nothing to the system profile.
  The phy *does* advertise WoWLAN. That advertisement lives at the cfg80211 layer and says only what the driver could be asked to do; `brcmf_pcie_wowl_config()` sets `wowl_enabled` and nothing reads it, and `brcmf_pcie_pm_enter_D3()` never calls `pci_enable_wake()`. Advertised capability and bus-level arming are separate things and only the second wakes a machine. The closed gap therefore *hardened* the "remote wake is infeasible" verdict and, as the CAM-60 comment says, pre-empts the specific failure mode of a later reader seeing that block and burning time configuring something that cannot work.

- [`verify.md:80`, `:236`, `:461-511`; `tasks.md:134-135`]
  **Verification produced a genuine negative and recorded it as one.**
  The operator's manual suspend at 03:16:19 UTC reproduced CAM-59: dark interval **2 m 00 s** (03:16:21 → boot 0 at 03:18:21) on kernel **6.18.42**, with both guard units (`disable-d3cold-all`, `nvme-d3cold-suspend-guard`) having completed successfully on that transition and `PM: suspend entry (deep)` present.
  It was that boot's **first and only** suspend, which breaks the previously 7/7 "the first suspend of a boot never fails" regularity in `logs/pyrite-resume-failure-diagnosis.md` §4.4/§5. The verify report neither downgraded the verdict on it nor buried it: it argues from the acceptance criterion as written, states in as many words what *would* have made this a FAIL, and closes with "Eight recorded resume failures now, not seven."

- [`verify.md` §9 (`:319-451`)]
  **The cold power cycle was taken as a free test rather than as an interruption.**
  Every earlier confirmation was on a warm activation where `/run/booted-system` and `/run/current-system` differed (`logs/pyrite-never-sleep-postdeploy.md` §4.3). The unplanned power cycle resolved that mismatch and re-proved the whole configuration on boot `0`: identical store hashes for both compiled GVDBs, the 3.1 reset still held with `~/.config/dconf/user` unchanged in mtime and size, `wlp2s0` and the entire Alpine Ridge subtree present, and zero `Unable to change power state` lines.

## 2. Misses

- [med] [painful | `verify.md` §7 row 1; `tasks.md` 4.2]
  The battery branch's **behaviour** was never observed. Its configuration is verified twice on the machine, its resolution is verified through the daemon's own environment, and the source argument that either key alone suppresses watch registration is now correct — but no one watched an unplugged machine for 35 minutes. Closing it costs one idle window and no redeploy.

- [med] [painful | `verify.md` §7 row 2; `tasks.md` 4.3]
  The panel-blank-and-lock check is the weaker of the two evaluation discharges: `idle-delay = uint32 1800` intact and no screensaver key touched establishes **non-regression**, not the behaviour. No one watched a panel. Closing it costs one 30-minute idle window and no redeploy.

- [med] [painful | `verify.md` §8b]
  The behavioral requirement `The laptop does not suspend itself when nobody is using it` has **no named discharging interface property**. `proposal.md:57` deliberately creates no interface capability on the grounds that the change alters the *value* of an existing machine property rather than introducing a new one, so the properties that in fact discharge it — the greeter dconf database and the four user-database keys — are named only in `design.md` and `tasks.md`, which are not vocabulary-governed. Recorded as undischarged, carried as a §6 Promote, and carried into `satisfaction.md` as a row with a follow-up reference rather than dropped.

- [med] [painful | `logs/pyrite-never-sleep-verify-apply.md` §2]
  A false claim about upstream C survived into a code comment and was corrected only at the apply-verification gate. The claim was not load-bearing for the decision — both keys are set either way — but it was load-bearing for the *stated reason* the decision was made, and a reader of the module would have taken it as fact.

- [low] [nit | `verify.md` §8a]
  Three world-flavoured content nouns in the new behavioral requirement resolve to no row in the designation table: `laptop` (almost certainly `host | fleet` under a colloquial name), `person` (genuinely distinct from `operator`, and the requirement leans on that distinction), and `network` (scenario 1's "remains reachable over the network", which is doing real work). Zero unresolved *machine* nouns, which is the discipline holding. Dispositions were recommended and deliberately not applied during a verify pass.

- [low] [nit | `verify.md` §7 preamble]
  `plan.md` does not exist for this change, so the schema's `verify` dependency is formally unmet and `openspec instructions verify` emits "Missing: plan". `tasks.md` carried the manual-check role `plan.md` would have carried. Recorded rather than repaired, because writing a plan after the work is a fiction.

## 3. Plan deviations

`plan.md` does not exist for this change; `tasks.md` is the operative ledger and the rows below are deviations from it and from `design.md`.

| Plan task | What changed | Why |
|---|---|---|
| 1.3 verify line (`just lint` passes) | `just lint` deliberately not run | Other agents' in-flight edits were live in the shared working copy; a repo-wide formatter would have rewritten files belonging to changes this cycle does not own |
| 4.1 verify line (`journalctl -b \| grep -c "suspend requested"` returns `0`) | Reported as `1` for the boot, with the scoped idle-window count of `0` stated separately | The one hit is the operator's deliberate suspend from task 4.4 — the very thing this change is required *not* to prevent. Reporting a bare `0` would have been false (`verify.md:85-94`) |
| 4.2 (35-minute battery idle window) | Not executed; discharged by evaluation | Explicit operator decision, labelled as such in `tasks.md` rather than written up as observation |
| 4.3 (panel blanks, `LockedHint=yes`) | Not executed; discharged by evaluation | Same operator decision; the residual is the weaker of the two and is named in `verify.md` §7 |
| 4.4 invocation method (`systemctl suspend`) | Invoked from the GNOME menu instead (`suspend requested from client PID 22217 ('.gnome-session-')`) | Same logind path, different caller; recorded as such rather than glossed |
| `design.md:15-24` D2 rationale | The stated asymmetry between a zero timeout and `"nothing"` was corrected: either key alone suppresses watch registration | The type guard is nested inside the timeout guard at gsd `50.1:2102-2106`. Both keys are still set — the `-type` key is what survives a nonzero timeout being written back, which is exactly what GNOME Settings did on 2026-09-08 |
| Verification environment | A cold power cycle intervened mid-verification | Unplanned, and taken as a fresh test of whether the configuration survives a boot rather than as a restart of the pass (`verify.md` §9) |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| `superpowers:brainstorming` | yes — `brainstorm.md` records a decision over three already-completed read-only diagnoses rather than an exploration |
| `superpowers:writing-plans` | no — no `plan.md`; `tasks.md` is the operative ledger |
| `superpowers:using-git-worktrees` | no (jj-diamond-adapted) |
| `superpowers:subagent-driven-development` | yes — §0 lists seven dispatch-evidencing artifacts |
| `(transitive) superpowers:test-driven-development` | no (running-machine target) |
| `(transitive) superpowers:requesting-code-review` | yes — the apply-verification pass overturned a design claim, and the verify-artifact review pass produced `logs/pyrite-never-sleep-verify-md.md` |
| `superpowers:finishing-a-development-branch` | no (jj-diamond-adapted) |

> **Default expectation**: all yes.
> Two skips are the jj-mode boundary condition now recurring for the third consecutive cycle in this repository; one is a running-machine boundary condition; one is a scope judgement.

### Deliberately Skipped Skills

- **`superpowers:writing-plans`**
  - **What was skipped**: the whole skill; no `plan.md` was authored, and `verify.md` §7 records `artifactPaths.plan.existingOutputPaths: []` with `openspec instructions verify` emitting "Missing: plan".
  - **Why this cycle**: the change is four dconf keys, one vendored option line, and a comment in one file, downstream of three completed read-only diagnoses that had already established the mechanism, the scope and the cost. `brainstorm.md:3` says so in its first sentence. A plan would have restated `tasks.md`.
  - **How to prevent recurrence**: `scope-judgment rule`. When the implementation surface is a single file and the design space was closed by prior investigation reports, `tasks.md` is the plan; but the cost is real and was paid here — `verify.md` §7 exists to hold `[~]` deferred-dogfood rows that `plan.md` would have carried, and it had to be filled in anyway to keep two evaluation discharges visible. The rule is: skip `plan.md` only when `verify.md` §7 is filled in regardless, which is what happened.

- **`(transitive) superpowers:test-driven-development`**
  - **What was skipped**: writing a failing test before the implementation.
  - **Why this cycle**: the unit under test is a running GNOME session on one physical laptop, and the observable is "nothing happens for 50 minutes". There is no buildable check for it; `verify.md` §7 states this per row.
  - **How to prevent recurrence**: `scope-judgment rule`. Where the property is the *absence* of an event over wall-clock time on real hardware, route to (a) evaluation and on-machine decode of the delivered artifact, (b) a read through the consuming daemon's own environment rather than a convenient shell, and (c) one real elapsed window — and require the artifact to name which of the three each claim rests on, as `verify.md:69-81` does. The failure mode this guards against was live here: a `gsettings get` over plain ssh returns `No such schema`, because the gsd schemas are not on a plain ssh session's `XDG_DATA_DIRS`, so the convenient probe is not the daemon's probe.

- **`superpowers:using-git-worktrees`** and **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: the `git worktree add` isolation step, and the autonomous push/PR step.
  - **Why this cycle**: identical trigger to the two previous cycles — the repository is jj-colocated, this cycle ran on an active 5-chain diamond development join with other agents editing the same working copy concurrently, and version control is orchestrator-owned. `verify.md:184-192` records both the no-writing-VCS-command constraint and the unpushed state, and leaves the "pushed" box unticked rather than ticking it with a caveat.
  - **How to prevent recurrence**: `schema graph fix`, already raised as a §6 candidate in `archive/2026-08-01-pyrite-baremetal-nixos/retrospective.md:206-208` and still unchecked. This is now the third consecutive cycle skipping these two skills for the same reason with the same prevention answer, which by the §4-to-§6 rule makes it a schema PR motivator rather than a norm to keep re-recording. Carried into §6 with its recurrence count raised rather than restated as new.

## 5. Surprises

- **The declared policy was correct and the machine still suspended, because there are two dconf profiles and two daemons.** The `user` profile was right the whole time. `gdm` was never looked at, and nixpkgs' `services.displayManager.gdm.autoSuspend` defaults to `true`, which leaves the greeter's power settings empty and falling through to the schema default of 900 s / `suspend`. The option appears nowhere in this repository.

- **The behaviour the flake was being credited for on AC came from a key GNOME Settings wrote 52 seconds after a login.** `~/.config/dconf/user`, mtime 2026-09-08 22:33:44 UTC, against a 22:32:52 login. The flake's file-db said `sleep-inactive-ac-timeout = 0`; the live session read `3600` and an `ac-type` the flake did not declare at all. Right behaviour, wrong reason, and the no-`locks` decision makes this possible by design rather than by accident.

- **A zero timeout does not merely decline to fire an armed watch.** The claim was written confidently, in good faith, from a reading of upstream C, and is false: the type guard is nested inside the timeout guard and both watch ids are cleared unconditionally beforehand. Either key alone prevents registration. The real reason to set both survives — the `-type` key is what holds when a nonzero timeout is written back — but the stated reason had to be replaced, not merely sharpened.

- **The guard's line number moved between `main` and the tag the machine actually runs**: `:2105` at `50.1`, `:2145` on `main`. A citation taken from `main` would have been unfalsifiable-looking and wrong, with nothing in it to warn the next reader.

- **`iw` was never actually unavailable.** "Not installed on the target, and installing it would modify the target" is a correct constraint and was the wrong conclusion; `nix run nixpkgs#iw -- phy` satisfies both halves. The evidence it produced then had to be read the right way round — the phy advertises WoWLAN, and the advertisement is a cfg80211-layer capability that the PCIe back-end never arms — so the closed gap strengthened the infeasibility verdict and simultaneously created a trap for anyone who runs the same command without reading the driver.

- **The first suspend of a boot can fail.** `logs/pyrite-resume-failure-diagnosis.md` §4.4 recorded 7/7 successes on the first suspend of a boot as a genuine and unexplained asymmetry. This cycle's verification produced its counterexample: 2 m 00 s dark interval, kernel 6.18.42, both guard units successful, and it was that boot's first and only suspend. One of the two best-supported regularities in the resume diagnosis is now broken, which is a datapoint that §4.5 item 1 explicitly asked for and got for free.

- **A cold power cycle restored the Alpine Ridge Thunderbolt subtree intact.** `archive/2026-08-01-pyrite-baremetal-nixos/retrospective.md:233-234`'s standing hazard is that `wlp2s0` is lost across a **warm** reboot; boot −4 in the resume diagnosis came up from a warm reboot with the whole subtree absent. This cold cycle brought back every function in the table, with zero `Unable to change power state` lines.

## 6. Promote candidates → long-term learning

- [ ] [high] **Reading upstream source to justify a configuration choice is a conjecture until the artifact is evaluated; cite the tag, not the branch.** → **Promote to project CLAUDE.md** (vanixiets, source-versus-delivered section)
  > **Why**: a comment in `modules/machines/nixos/pyrite/default.nix` asserted that a zero timeout "only avoids firing a watch that is still armed"; the type guard is nested inside the timeout guard at gnome-settings-daemon `50.1:2102-2106` and both watch ids are cleared unconditionally, so the claim was false and survived one review. Separately, that guard is at `:2105` at tag `50.1` and `:2145` on `main`, so a branch-based citation is wrong the moment upstream moves. `openspec/config.yaml` already says nix-managed outputs are not verified by reading the source; this cycle shows the rule has to extend to upstream C read in support of a config decision.
  > **How to apply**: when a design decision or a code comment rests on upstream source, promote the dependency to a local clone, read it at the exact tag the store path names (`git show <tag>:<path>`), quote enough context to show the *nesting* rather than the single matching line, and pair it with output evidence — here, decoding the compiled GVDB with `dconf dump` against a throwaway `file-db` profile, which is what actually settled the question.

- [ ] [high] **When a configuration is declared and the machine disobeys it, identify the process that acted before re-reading the configuration.** → **Promote to memory** (type: feedback)
  > **Why**: pyrite's `user` dconf profile was correct for the whole investigation and every suspend came from the GDM greeter under a second profile and a second uid. The discriminator was `systemd-logind`'s own client attribution (`suspend requested from client PID 8844 ('.gsd-power-wrap') (unit user@60578.service)`), not any amount of re-reading the declared values; the first pass hypothesised the declared values were not taking effect and was half right for the wrong user.
  > **How to apply**: at the start of a "declared X, observed not-X" investigation, read the initiator from the journal or the bus first and establish *which* principal acted; only then ask what that principal's configuration says. Where a subsystem has per-principal configuration layers — dconf profiles, systemd user vs system units, per-uid environments — enumerate the layers before concluding that a layer is ineffective.

- [ ] [high] **"The tool is not installed and installing it would modify the target" is not a verification limit in a Nix fleet.** → **Promote to memory** (type: feedback)
  > **Why**: `logs/pyrite-remote-wake-feasibility.md:102-107` and `:443-449` filed the `iw phy` WoWLAN section under "What I could not verify" on exactly that reasoning. `nix run nixpkgs#<pkg>` satisfies both halves — no installation, nothing added to the system profile or the machine's configuration — and the evidence it produced strengthened the conclusion rather than weakening it.
  > **How to apply**: before recording a measurement as unobtainable for want of a tool, try `nix run nixpkgs#<pkg> -- <args>` on the target. Reserve "would modify the target" for things that actually persist. Then read the result at the right layer: an advertised capability (`iw phy`'s `WoWLAN support` block) is not an armed one, and stating which layer the evidence lives at is part of the finding.

- [ ] [med] **Record the negative result that breaks your own diagnosis's regularity, in the verify artifact, at full strength.** → **Promote to skill** (`openspec-verify-change`, evidence-boundary guidance)
  > **Why**: the deliberate suspend in task 4.4 reproduced CAM-59 with a 2 m 00 s dark interval and was that boot's first and only suspend, breaking the 7/7 "first suspend of a boot never fails" asymmetry that `logs/pyrite-resume-failure-diagnosis.md` §4.4 had flagged as genuine and unexplained. The verify report reached PASS WITH WARNINGS by arguing from the acceptance criterion as written, stated explicitly what would have made it a FAIL, and closed with "Eight recorded resume failures now, not seven."
  > **How to apply**: when a verification run produces a datapoint that contradicts a prior report's stated regularity, name the prior report and the regularity it breaks in the verify artifact and carry it forward, rather than logging it only as "known defect, not a regression". A verdict that rests on a criterion should say which criterion, and say what evidence would have flipped it.

- [ ] [med] **A behavioral requirement whose only discharge is a world assumption must say so, and must land in the satisfaction projection as an undischarged row.** → **Promote to schema** (`superpowers-bridge-wrspm`, archive gate)
  > **Why**: `verify.md` §8b records the added behavioral requirement as undischarged with no named interface property, because `proposal.md:57` deliberately creates no interface capability on the grounds that the change alters the value of an existing machine property. Two dispositions were legitimate and the operator's decision was (a): accept the reasoning and record it. `openspec/config.yaml`'s archive guidance already forbids omitting or silently accepting such rows; this cycle is the worked example.
  > **How to apply**: at archive, any requirement §8b marks undischarged must appear in `satisfaction.md` as a row naming its follow-up, never dropped and never quietly upgraded. If the preferred disposition is (b) — promote the discharging machine properties to a `machine-interface` capability — that is a separate change, and this row is what keeps it findable.

- [ ] [med] **Codify the jj diamond development join as the schema's sanctioned worktree substitute.** → **Promote to schema** (superpowers-bridge apply/finish phases)
  > **Why**: carried forward from `archive/2026-08-01-pyrite-baremetal-nixos/retrospective.md:206-208`, itself carried from the cycle before it. This is the **third** consecutive cycle in which `using-git-worktrees` and `finishing-a-development-branch` are both skipped for the same reason — jj-colocated repository, orchestrator-owned routing, harness-blocked worktree surfaces — with the same prevention answer. This cycle adds a sharper instance: an active 5-chain diamond with other agents editing the same working copy concurrently, which also forced `just lint` to be skipped because a repo-wide formatter would rewrite files belonging to other changes.
  > **How to apply**: at the apply gate when `.jj/` is present, branch to the diamond development join and orchestrator-owned integration rather than to git-worktree isolation and an autonomous PR; and state that repo-wide formatters are not part of a change's own verification when the working copy is shared.

- [ ] [low] **A no-`locks` dconf profile means activation is never sufficient; the deploy step has to include a reset.** → **One-off** (record it, do not promote)
  > **Why**: `modules/machines/nixos/pyrite/default.nix:341-344` omits `locks` deliberately so GNOME Settings wins over the declared value, and `/etc/dconf/profile/user` lists `user-db:user` ahead of the Nix file-db. The consequence is that a stale panel edit outranks the flake indefinitely, which is what made the AC behaviour look declarative when it was not.
  > **How to apply**: it does not generalize beyond dconf-style layered databases with a deliberate user-wins ordering, which this fleet has in exactly one place. Recorded so the next reader of that block knows the reset in task 3.1 is structural rather than a one-time cleanup.

### Deferred work, follow-ups, and non-goals

The records below are carried forward so they are not lost.
Each is deferred or out of scope by deliberate decision rather than by omission.

**This change is harm reduction, not a fix, and nothing below is closed by it.**
`proposal.md:67` warns that anyone reading these artifacts as "pyrite's suspend problem is solved" has read them wrong, and `verify.md:508-510` repeats the warning. The resume failure rate is unchanged; the machine now takes that risk only when a person chooses to.

**CAM-59 — the resume defect — is untouched and was reproduced during this cycle's verification.**
`logs/pyrite-resume-failure-diagnosis.md` §4.4 states plainly that no mechanism is identified, and §4.5's discriminating tests each cost a supervised power-cycle risk. The record is now **8 failures against 30 successes**, and the newest failure is a counterexample to that file's "the first suspend of a boot never fails (7/7)" asymmetry — a free datapoint of exactly the kind §4.5 item 1 asked for, and one that removes a candidate explanation rather than adding one.

**CAM-60 — unattended boot — is the constraint that actually decides what pyrite can be relied on for, and is untouched here.**
Remote wake is settled infeasible: the phy advertises WoWLAN, `brcmf_pcie_wowl_config()` sets a flag nothing reads, `brcmf_pcie_pm_enter_D3()` never arms PME, and `brcmf_cfg80211_suspend()` disassociates from the AP on the way down. The larger half is that stage 1 waits at the physical keyboard for the LUKS credential with `boot.initrd.network.enable = lib.mkForce false`, so *any* dark state costs a trip. Initrd ssh plus remote unlock is the real gap and belongs to its own change.

**CAM-61 — the two untracked hardware defects — remain untracked by any fix.**
The Bluetooth UART bring-up race, and `wlp2s0` lost from the PCI bus across a warm reboot. Both are inherited from `archive/2026-08-01-pyrite-baremetal-nixos/retrospective.md:233-237`. This cycle's cold power cycle is *not* evidence against the second: `verify.md` §9.2 is a cold cycle, and the standing hazard is specifically the warm-reboot path.

**Two coverage residuals from `verify.md` §7, each one idle window and no redeploy.**
The 35-minute battery idle window (`tasks.md` 4.2) and the 30-minute panel blank-and-lock window (`tasks.md` 4.3). Both were discharged by evaluation on the operator's explicit decision and are labelled as such everywhere they appear.

**The §8b undischarged row.**
Disposition (a) was taken — accept `design.md`'s reasoning and record it here — and the row is carried into `packages/docs/src/content/docs/development/traceability/satisfaction.md` with a follow-up reference. Disposition (b), promoting the greeter and user dconf database content to a `machine-interface` capability so the requirement has a named S, remains available and is the schema-purer answer; it belongs to its own change and would also give 4.2's evaluation discharge something to point at.

**Three designation rows are owed to the vocabulary table.**
`laptop`, `person`, and `network` (`verify.md` §8a). Recommended dispositions: restate the requirement title using `host` rather than adding a `laptop` synonym row; add a `person` row, since it is genuinely distinct from `operator` and the requirement leans on that distinction; add a shared `network` row rather than dropping "and remains reachable over the network", because that clause is why an unattended suspend is a cost. Not applied during verify, and not applied at archive either — editing a delta table at sync time would defeat the convergence property described below.

**The `world-assumptions` archive-order hazard, restated because this archive changes its shape.**
`design.md:47` records that `stand-up-nixbot-on-magnetite` is unarchived and also `MODIFIES` `Grounded vocabulary for behavioral requirements`, and that a `MODIFIED` delta carries full content. This change's delta was authored as the living corpus table **plus** nixbot's fourteen rows **plus** its own eight, and that property was re-verified against the current content of both files before syncing. Two obligations survive this archive:
- If `stand-up-nixbot-on-magnetite` is **abandoned** rather than archived, its fourteen rows arrive in the corpus through this archive anyway and must be removed deliberately.
- If it is **archived after this change**, its delta's forty-six rows do not include this change's eight, so archiving it as it currently stands would drop them. Its `world-assumptions` delta must be refreshed against the post-sync corpus before it is synced. This direction is not covered by `design.md`'s convergence claim and is recorded here as the live obligation.

**Four items remain out of scope by name and are unchanged by this cycle.**
The lid handlers stay at `"lock"`/`"lock"`/`"ignore"` (declined by operator decision under an existing Non-Goal; an idle-timeout change has no standing to reopen it). Manual suspend is not blocked — no masked `sleep.target`, no `AllowSuspend=no`, no logind inhibitor — because the operator requires it and blocking it would strand the three D21 units that exist to make a suspend survivable. The screen still blanks and locks at 30 minutes, because the complaint was that the machine disappears, not that the panel goes dark. And the pre-existing alphabet violation in the incumbent `graphical-desktop-session` requirement — which names `nix eval`, option paths and nixpkgs source lines inside a `behavioral` capability — is recorded at `design.md:45` and `verify.md:308-311` and deliberately left as it stands, because resolving it inside a power-policy change would be scope creep.
