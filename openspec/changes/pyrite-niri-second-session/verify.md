# Verification Report

**Change**: `pyrite-niri-second-session` (CAM-63)
**Verified at**: 2026-09-09
**Verifier**: final read-only runtime/research worker; schema `superpowers-bridge-wrspm`, numbered manual fallback (skill tool unavailable).

**Verdict: FAIL — acceptance verification is incomplete, not a demonstrated compositor failure.** The deployed smoke test works, but the change's explicit independent idle/power and fallback acceptance obligations are not yet discharged. Do not archive as fully verified. Neither §7's recording of gaps nor §8's non-blocking analysis is itself a failing test.

Evidence attribution: **[inherited execution]** means the predecessor/ledger actually ran the cited command; **[verified here]** means this worker read the host or exact source; **[operator]** means physical observation supplied by the operator. Those are not interchangeable. No deployment, restart, reload, suspend, button test, source edit, writing git/jj command or `just lint` was performed here. First action was `pwd` → `/Users/crs58/projects/vanixiets`.

## 1. Structural Validation (`openspec validate --all --json`)

- [x] All items report `"valid": true`.

Actual summary [verified here], `logs/niri-final-prechecks-20260909.log`:

```json
"totals": { "items": 27, "passed": 27, "failed": 0 }
"byType": {
  "change": { "items": 12, "passed": 12, "failed": 0 },
  "spec": { "items": 15, "passed": 15, "failed": 0 }
}
```

Final change-local command/output (verbatim; `logs/niri-final-strict-20260909.log`):

```console
$ openspec validate pyrite-niri-second-session --strict
Change 'pyrite-niri-second-session' is valid
```

Exit 0. No failed structural item. **This checks Markdown structure and delta well-formedness only**, not runtime behavior, vocabulary grounding, alphabet discipline or entailment (`openspec/config.yaml`, `rules.verify`). §8 is agent-executed and non-blocking, never validation.

## 2. Task Completion (`tasks.md`)

- [ ] All tasks complete — **23 checked / 9 unchecked**, 32 total including new task 6.5.

Five existing tasks were newly discharged: **4.1, 4.4, 6.3, 6.4, 8.8**; new **6.5** records the already-performed manual logind reload plus live verification. Prior 17 checked tasks retain the ledger's actual evaluation/build evidence, not claimed re-execution here.

| Newly discharged | Evidence/method |
|---|---|
| 4.1 | Evaluated explicit idle policy plus deployed live `IdleAction=ignore` [inherited execution], runtime log lines 107–123. |
| 4.4 | Evaluated/rendered policy, delivered config/drop-in inspection, live short/long-press `ignore` [inherited execution], same lines; not a physical press. |
| 6.3 | Successful remote `clan-boot` and `clan-switch` units and finished switch at 19:00:04 [verified here], `logs/niri-final-package-20260909.log`, activation-unit section; subsequent SSH and matching current generation [inherited execution]. Local update-command exit transcript was not recovered; journal success is the explicitly recorded equivalent. |
| 6.4 | GDM restart at 19:03:10 follows activation at 19:00:04 [verified here], `logs/niri-final-portal-context-20260909.log:959,994-1011`; inherited ActiveEnterTimestamp agrees. |
| 6.5 (new) | Sudo reload and `Config file reloaded.` at 19:02:28 [verified here], same log lines 983–987; live D-Bus values [inherited execution]. |
| 8.8 | niri actually failed to spawn satellite and disabled integration, followed by unset-DISPLAY diagnostic [inherited execution], runtime log lines 226–227. Task now explicitly allows this direct diagnostic instead of pretending interactive shell commands ran. |

| Incomplete task | Reason | Blocks complete acceptance/archive now? |
|---|---|---|
| 2.3 | `includes=[]`; explicitly vacuously satisfied, not exercised. Task itself forbids checking an empty-list branch. | No; no artificial include needed. |
| 4.2 | No in-niri process/user-service/autostart snapshot. | Yes: D7 explicitly requires runtime evidence, not source absence. |
| 8.1 | Niri login/terminal/exit observed; new interactive GNOME fallback login not observed. | Yes: both desktops/fallback must work. |
| 8.2 | Session=niri persisted; no no-history GNOME login, next-login preselection/relogin, or post-selection restart comparison. | Yes for full scenario verification; persistence itself is no longer missing. |
| 8.3 | Only 2min 33.945s interactive niri use; no 35-minute untouched AC interval. | Yes: independent inactivity guarantee unestablished. |
| 8.4 | No battery idle window; task explicitly refuses configuration-only discharge. | Yes. |
| 8.5 | No repeated GNOME and greeter idle windows for this deployment. | Open regression coverage; must be completed or explicitly dispositioned before full acceptance. |
| 8.6 | No separately consented deliberate suspend/guard-unit/entry/wake observation. | Open explicit behavioral scenario; do not perform without separate risk consent. |
| 8.7 | No ordinary power-key press test; wake unobserved. | Open explicit D9 behavioral scenario; live configuration is not a physical test. |

## 3. Delta Spec Sync State

CLI-resolved delta (`openspec status --change pyrite-niri-second-session --json`, in prechecks log):
`openspec/changes/pyrite-niri-second-session/specs/graphical-desktop-session/spec.md`.

| Capability | Sync status | Notes |
|---|---|---|
| graphical-desktop-session | Pending sync | Main spec still excludes niri and says home-manager has no desktop toggle. Delta modifies that requirement and adds the choice/persistence, independent inactivity/power-control, and same-program settings-check requirements. Expected unarchived state; no main-spec edit here. |

## 4. Design / Specs Coherence Spot Check

| Decision | Requirement correspondence (delta spec lines) | Result |
|---|---|---|
| D1/D4, additive niri and explicit null | 39–66, two choices; never-chosen GNOME; prior choice persists | Mechanism matches scenarios. **Not unconditional GNOME on every login.** §9.1. |
| D3/D6, exact validator and immutable includes | 103–124 | Same niri store path plus positive/negative builds establish validation; includes are vacuous. |
| D7, desktop-independent idle protection | 68–85 | Source reasoning and live logind agree; promised runtime absence-of-idle-manager and AC/battery observation remain missing. |
| D9, paired power-key policy | 72,87–96 | Correct delivered config only became daemon policy after manual reload. New task 6.5 closes the operational omission; physical scenarios remain untested. |
| D8, preserve GNOME/GDM power configuration | 81–85 | Actual baseline/evaluated-byte comparison passed; repeated behavioral windows not run. |
| OQ2, portal sufficiency | Not a separate behavioral acceptance requirement | Installed/started backends verified, functional transactions not exercised; qualification and B-portal follow-up added. |

Drift warnings: design's shorthand “still the default” needs the never-chosen qualification, now explicit; its migration prose does not mean no user state exists. The pin at former `design.md:121` and `tasks.md:7` was wrong and is corrected (§9.5). No acceptance requirement was rewritten to fit the observed smoke test. Bare compositor, no shell/locker, and no X11 support remain the declared slice boundary, not newly supplied features.

## 5. Implementation Signal

- [ ] Whole worktree clean — not asserted or surveyed; active shared jj diamond contains other agents' work and is outside this verification scope.
- [ ] All related commits pushed — not independently established; orchestrator owns routing.

Schema prechecks [verified here] returned **56** commits and **17** previously checked tasks before edits (`logs/niri-final-prechecks-20260909.log`). This is only an implementation-presence signal, not ownership/push proof. Change-scoped prior committed range `a34162bf401e1b8db4d0d98fcdc7a414c28d9690..50b2c0dd152e7279a323495a48bcd662daccd1bf` and immutable evaluated wip `28ecab07…` are grounded by `logs/niri-slice-a-ledger.md:15-16,104-115`. This pass's three change-artifact writes are intentionally unrouted. Other agents' edits were not touched or reported.

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```console
$ ls docs/superpowers/specs/*.md 2>/dev/null
(no output)
```

- [x] No files found. CLI resolves brainstorm to this change's `brainstorm.md` (prechecks log). No leak action.

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` is absent; the schema graph reports that unmet dependency (`logs/niri-final-schema-20260909.log`). Tasks carry the live-check role. No `[~]` plan rows exist, but omitting the actual coverage gaps would mislead.

| Manual check | Closest executed evidence | Equivalent? / follow-up |
|---|---|---|
| 4.2 idle consumers | niri source, logind D-Bus, short session journal | No; capture process/service/autostart snapshot in next authorized niri session. |
| 8.1 both interactive desktops | Niri operator smoke plus registered GNOME entry | No; observe interactive GNOME after choosing it at the cog. |
| 8.2 never-chosen/relogin/restart memory | Pinned GDM source, persisted Session=niri, empty evaluated preStart | No; observe the remaining sequence without unauthorized state clearing. |
| 8.3/8.4 niri AC/battery idle | Zero whole-boot suspend counts, 2m33.945s niri session | No; two untouched 35-minute intervals and continuity evidence. |
| 8.5 GNOME/greeter regression | Byte-identical dconf against actual baseline | No; repeat required windows. |
| 8.6 deliberate suspend/wake | No blanket block in protected source; existing CAM-59 | No; only separately consented physically supervised test; resume failure remains known risk, not this change's promised fix. |
| 8.7 ordinary key | Live ignore/ignore and built disabled niri handling | No; operator ordinary press, usability/SSH and scoped journal; no prolonged hold. |

Carry these into retrospective **Misses**, with these task IDs as follow-up references; no retrospective exists yet and none is claimed written. §7 recording itself is non-blocking. The overall incomplete-acceptance finding rests on the delta's explicit requirements to establish independent behavior and observe the working fallback, not on a rule that every optional dogfood gap automatically fails a change.

## 8. Designation Lint and Discharge Coherence (agent-executed; warning, non-blocking)

This section is **not validation**. Main `openspec/specs/world-assumptions/spec.md` exists and its designation table was read; this is not a clean/vacuous lint. Proposal tags the sole changed capability `behavioral`; no world/interface delta exists.

### 8a. Designation lint

Requirement-statement extraction (delta lines 5–7,41–43,70–74,105–106): grounded compound terms include `host`/`machine` (fleet sense), `panel`, `login screen`, `desktop session` (only the logged-in state), `inactivity`, `suspended state`, `wake source`, `operator`, and `power source` (mains/battery). The table does not designate the following remaining subject matter; related scenario vocabulary is also recorded rather than used to claim a clean result.

| Unresolved noun/term | Disposition |
|---|---|
| desktop (including established/newly offered/default desktop) | World/shared selectable thing, not the designated desktop-session state; design OQ6 accepted open finding. |
| settings | World/shared contents, not the designated settings panel; OQ6. |
| person | Not synonymous with operator; vocabulary follow-up. |
| choice / recorded choice | User selection and persisted selection need distinct grounding; vocabulary follow-up. |
| login / sign-in | Event, not the designated login-screen state; vocabulary follow-up. |
| session (graphical use) | Existing bare `session` rows are autonomous/Pi-persisted; explicitly use/designate desktop-session sense. |
| physical control / press / release | Related to wake source but event/control vocabulary is not separately designated. |
| network | Shared reachability phenomenon; existing table mentions it but has no row. |
| program | Machine phenomenon in same-program requirement, not a designated world term; review stratum/observable contract. |
| copy / version | Program identity/version, machine phenomenon; same review. |
| file / check / configuration | In generated-settings requirement these are machine artifacts/operations, not grounded by generic target/path or human activation rows. |
| host module / options / system-level / home-manager configuration | Machine phenomena retained by MODIFIED stock-GNOME requirement; move to interface in a separately scoped corpus repair. |
| GNOME / GDM / niri / nixpkgs / home-manager | Named machine software, not designation rows; same retained alphabet issue. |
| Wayland shell assembly / bar / launcher / notification daemon / lock screen / wallpaper / clipboard manager | Undesignated machine components in the modified requirement's scope sentence. |
| shell / portals / polkit agent / keyring / dconf / settings daemon / applet / control center | Further machine-component nouns in retained scenarios, not grounded world vocabulary. |
| boot / LUKS container / ZFS root / stage-1 prompt / initrd / token / PIN / passphrase / credential / unlock | Retained boot/unlock scenario vocabulary is not grounded by this table; the forge-credential row is not a general credential designation. Separate corpus review, not repaired here. |

The known OQ6 gaps are not the only lexer findings. Related action nouns such as selection/rejection/failure/recovery inherit no automatic designation from prose mentioning them. Follow-up **V-vocabulary**: next sole owner of the designation table should enumerate/add the world/shared rows and relocate machine predicates; OQ6's separately proposed sync-time superset check has no claimed issue ID. No table edits here.

### 8b. Discharge coherence

| Requirement | Discharged by (S) | Under (W) | Status |
|---|---|---|---|
| MODIFIED local GNOME under GDM | No named interface requirement; implementation options and boot ordering embedded directly in behavioral text | No explicit named world discharger; retained D1/D11 references are design, not W | **Undischarged (no named S)**; follow-up V-interface. Runtime regression coverage also incomplete. |
| ADDED two desktops/default/history | No named S; GDM registry/history mechanism exists only in design/tasks | No named W | **Undischarged (no named S)**; V-interface. Selection persistence observed; full fallback/relogin scenarios incomplete. |
| ADDED independent inactivity/power policy | No named S; niri/logind mechanisms described in design/tasks | Explicit A13, still applicable; no new resume experiment | **Undischarged (no named S)**; V-interface. Independent runtime proof incomplete. |
| ADDED same-program settings check | No named S; actual config derivation/binary equality and negative build are evidence, not a named interface spec | No named W | **Undischarged (no named S)**; V-interface. Executed build layer passes; includes vacuous. |

**V-interface follow-up:** retrospective §6 Promote → `architecture-decision`: explicitly decide whether to introduce named machine-interface properties for registry/history, idle/power control, and build-validator identity, or formally document this corpus's alternative discharge convention. Never omit these rows from archive's regenerated satisfaction projection; `openspec/config.yaml` archive guidance requires follow-up references for undischarged requirements.

### 8c. Alphabet check

MODIFIED stock-GNOME text retains option paths, commands, daemons and boot internals despite its behavioral tag (delta lines 5–35). The ADDED settings-check requirement also uses machine-side program/copy/version/file identity (105–118); treating those as world vocabulary without designation is not grounded. Added choice/idle text is primarily world/shared language but has §8a gaps. No interface delta exists, so the unobservable-world-state restriction has no interface subject. No requirement rewritten here. These are warn-and-record findings, not the basis of the overall FAIL.

## 9. Runtime Findings and Corrections

### 9.1 AccountsService persisted; GNOME is fallback, not cameron's next default

[inherited execution] `logs/niri-verify-discrepancies-20260909.log:1-13`:

```text
Modify: 2026-09-09 19:04:57.497589650 +0000
 Birth: 2026-09-09 19:04:57.497589650 +0000
[User]
Session=niri
Icon=/home/cameron/.face
SystemAccount=false
```

Live AccountsService `Session` is `s "niri"` (runtime log 258–259; `SessionType` empty). **The earlier “not persisted” report was a false negative:** the orchestrator ran unprivileged `cat ... 2>/dev/null || echo "(no file yet)"`, conflating unreadable with missing. This is the orchestrator's acknowledged evidence-gathering error, not a change defect. `logs/pyrite-niri-session-evidence-20260909-150844.log`'s “still absent” is superseded; neither historical log is edited.

[verified here] Exact installed GDM **50.1** source, not default branch (package selection and patch list in `logs/niri-final-portal-runtime-20260909.log`; fetched files in `logs/niri-final-gdm-source-20260909.log`):

- [`gdm-session-settings.c:285–309`](https://github.com/GNOME/gdm/blob/50.1/daemon/gdm-session-settings.c#L285-L309) reads `act_user_get_session`; [`368–390`](https://github.com/GNOME/gdm/blob/50.1/daemon/gdm-session-settings.c#L368-L390) saves with `act_user_set_session` when loaded and a session name exists.
- [`gdm-session-worker.c:2535–2549`](https://github.com/GNOME/gdm/blob/50.1/daemon/gdm-session-worker.c#L2535-L2549) saves account details in the worker's session state transition. This matches file birth at login, not a requirement that logout complete first.
- [`gdm-session.c:1101–1126`](https://github.com/GNOME/gdm/blob/50.1/daemon/gdm-session.c#L1101-L1126) checks saved entry validity and updates greeter default; [`687–694`](https://github.com/GNOME/gdm/blob/50.1/daemon/gdm-session.c#L687-L694) returns saved session before fallback; [`621–625`](https://github.com/GNOME/gdm/blob/50.1/daemon/gdm-session.c#L621-L625) tries GNOME only in fallback. [`2735–2743`](https://github.com/GNOME/gdm/blob/50.1/daemon/gdm-session.c#L2735-L2743) prefers explicit selection, otherwise that default.

**Plain operational consequence: cameron's remembered session is now niri. The next login defaults to niri unless the cog is used to pick GNOME. GNOME remains the default only for users with no recorded choice. For cameron, “safe fallback” now means one cog-click away, not what is obtained by default.** This is source-grounded expected next-login behavior, not an observed second login.

Does that satisfy acceptance as written? **The memory/default semantics do:** the delta explicitly limits its no-choice scenario to a person who has *never chosen* (53–54) and separately requires the chosen desktop at later logins (58–60). An unconditional GNOME-next-login claim would contradict those criteria and is false for cameron. **The full fallback criterion is not yet discharged:** lines 64–66 require GNOME still works; no new interactive GNOME login was supplied. A remembered niri session is not itself a FAIL; unverified GNOME usability must not be hidden behind the correct source argument.

### 9.2 Logind did not reload on switch

[operator/prior execution] Correct `logind.conf` was written while running logind still returned `HandlePowerKey=poweroff`, until manual `systemctl reload systemd-logind`. This worker did not witness the before-reload D-Bus call.

[verified here] Successful switch completed **19:00:04**; sudo ran reload at **19:02:28**, immediately followed by `Config file reloaded.` (`logs/niri-final-portal-context-20260909.log:959,983-987`). [inherited execution] post-reload D-Bus short press, long press and idle action all return `s "ignore"`, unchanged lid policy, and `systemd-analyze cat-config` shows the correct delivered file with no additional override (runtime log 107–123).

**Deploying this change does not fully take effect without a logind reload or a reboot.** File-only inspection would have passed falsely. New **task 6.5** makes the reload/runtime gate explicit, analogous to actual display-manager task **6.4** (the brief's “2.3” is the include task in this ledger). No source fix, reboot or reload was performed here. Pinned nixpkgs [`logind.nix:67–73`](https://github.com/NixOS/nixpkgs/blob/85f62611fa3f3eacbcfe3bc7a6d6518b443ca442/nixos/modules/system/boot/systemd/logind.nix#L67-L73) sets reload-if-changed but leaves the configuration-file trigger commented; the marker alone is no proof a changed file caused a reload.

### 9.3 Portal determination: running backends, teardown exits; transactions unproven

The orchestrator's blanket “no failed systemd units” used only `systemctl --failed`, not `--user`. **Acknowledged scoping/evidence-gathering error**, not a source defect. Predecessor observed zero failed system units **and two failed user units** (runtime log 239–251).

[verified here] Delivered units and exact journal in `logs/niri-final-portal-runtime-20260909.log:1-66`:

```text
Sep 09 19:04:59 pyrite systemd[1133]: Started Portal service (GNOME implementation).
Sep 09 19:04:59 pyrite systemd[1133]: Started Portal service (GTK/GNOME implementation).
Sep 09 19:04:59 pyrite systemd[1133]: Started Portal service.
Sep 09 19:07:31 pyrite xdg-desktop-portal-gnome[112853]: Lost connection to Wayland compositor.
Sep 09 19:07:31 pyrite xdg-desktop-portal-gtk[112869]: Error reading events from display: Broken pipe
Sep 09 19:07:31 pyrite systemd[1133]: xdg-desktop-portal-gtk.service: Main process exited, code=exited, status=1/FAILURE
Sep 09 19:07:31 pyrite systemd[1133]: xdg-desktop-portal-gnome.service: Main process exited, code=exited, status=1/FAILURE
```

Both backend units and frontend are **Type=dbus** with their expected BusNames. “Started” therefore means the bus name was acquired, not merely an attempted exec ([systemd v261.1 `systemd.service.xml:215–227`](https://github.com/systemd/systemd/blob/v261.1/man/systemd.service.xml#L215-L227)). They did not fail during the 19:04:59–19:07:31 session interval. They exited on losing the compositor exactly when niri quit. The user manager remained to retain failed status; this is **teardown failure-state noise, not a backend that never started**.

The source/delivery chain is real, not “xdg.portal enabled” alone:

1. Effective nixpkgs **85f6261** [`niri.nix:28–31,62–86`](https://github.com/NixOS/nixpkgs/blob/85f62611fa3f3eacbcfe3bc7a6d6518b443ca442/nixos/modules/programs/wayland/niri.nix#L28-L86) installs the GNOME portal, imports GTK wiring, uses GNOME/GTK preference and makes Nautilus D-Bus-activatable for FileChooser. Delivered `/etc/xdg/xdg-desktop-portal/niri-portals.conf` matches (portal-runtime log 53–57).
2. Installed backend is **xdg-desktop-portal-gnome 50.0**, GTK **1.15.3**, frontend **1.22.1** (delivered units). GNOME 50.0 [`filechooser.c:365–397`](https://github.com/GNOME/xdg-desktop-portal-gnome/blob/50.0/src/filechooser.c#L365-L397) exports FileChooser and delegates to `org.gnome.Nautilus`. Delivered service resolves to Nautilus **50.2.2**; actual bus config contains its service directory (`logs/niri-final-portal-context-20260909.log:1-7`; package log DBus section).
3. GNOME backend startup initializes FileChooser and ScreenCast after acquiring the bus ([50.0 main:110–178](https://github.com/GNOME/xdg-desktop-portal-gnome/blob/50.0/src/xdg-desktop-portal-gnome.c#L110-L178)). A failed compatible-display initialization would print `Non-compatible display server, exposing settings only.` ([304–310](https://github.com/GNOME/xdg-desktop-portal-gnome/blob/50.0/src/xdg-desktop-portal-gnome.c#L304-L310)); that diagnostic is absent from this backend's journal.
4. GNOME ScreenCast watches `org.gnome.Mutter.ScreenCast` ([50.0 `gnomescreencast.c:719–802`](https://github.com/GNOME/xdg-desktop-portal-gnome/blob/50.0/src/gnomescreencast.c#L719-L802)). niri **v26.04** implements/starts the corresponding D-Bus service ([`src/dbus/mod.rs:119–131`](https://github.com/niri-wm/niri/blob/v26.04/src/dbus/mod.rs#L119-L131)); pinned nixpkgs package defaults `withScreencastSupport=true` and enables `xdp-gnome-screencast` (`logs/niri-final-package-20260909.log`, package source). This explains why the GNOME backend is appropriate on niri; it is not inherently GNOME-Shell-only.

**Answer:** this nixpkgs niri session did get running, D-Bus-ready portal backends, with the source/delivered wiring needed for dialogs and screencast. **No successful FileChooser request or ScreenCast stream was observed.** Startup is not an end-to-end transaction test, and a post-session query could activate/change services rather than retrospectively test that session; none was attempted. Thus a claim “portals never worked” is unsupported, and so is an unconditional “file dialogs and screen sharing tested working.”

One separate, genuine startup warning is not hidden by the teardown determination:

```text
Sep 09 19:04:59 pyrite .gnome-control-[112862]: Failed to open service channel Wayland connection, portal dialogs may misbehave (GDBus.Error:org.freedesktop.DBus.Error.InvalidArgs: Invalid service client type).
```

Full journal places it after launching `org.gnome.Settings.GlobalShortcutsProvider`, not in either failed backend process (`logs/niri-final-portal-context-20260909.log:254-260`). niri v26.04 rejects service-client types other than `1` ([`mutter_service_channel.rs:14–21`](https://github.com/niri-wm/niri/blob/v26.04/src/dbus/mutter_service_channel.rs#L14-L21)). Actual dialog impact is **not established**. Record this bounded compatibility warning and the transaction-coverage limitation under **design.md B-portal**, slice B follow-up, not a slice-A task or invented claim that all portals are broken. No failed state was reset and no service was restarted.

### 9.4 Cursor and Xwayland: known slice-B limitations

[inherited execution] niri's actual messages, runtime log 226–229:

```text
WARN niri::cursor: error loading xcursor default@48: no default icon
WARN niri::utils::xwayland::satellite: error spawning xwayland-satellite at "xwayland-satellite", disabling integration: No such file or directory (os error 2)
```

Delivered config says `xcursor-theme "default"`. No theme installed is the operator-supplied premise; this worker did not audit all cursor search paths. The lookup failure itself is verified and cosmetic: **B-cursor**. Satellite absence is confirmed by the compositor, not merely an evaluated package list: X11-only applications unsupported, **B-xwayland**, accepted OQ1 limitation. Neither is added as a slice-A implementation task.

### 9.5 Pin correction and inherited runtime identity

Root lock follows **`nixpkgs_9 → 85f62611fa3f3eacbcfe3bc7a6d6518b443ca442`**, not the unrelated node `nixpkgs → 044bfe75…` (predecessor context log 1–47). Corrected former `design.md:121` and `tasks.md:7`; effective-pin logind lines were re-read in this pass (portal-context log 747–852). `logs/niri-slice-a-apply-phase1b.md:193-220`'s supersession claim and ledger line 18's supposed root/effective distinction are incorrect historical interpretations, not defects in the change. The logs remain unchanged and are explicitly superseded here.

Do not redo or conflate prior output paths: ledger builds at immutable wip produced pure `7gb7…` and impure `l4is…`; actual deployed current generation is **najhrzgayg05kd8bzm5g7n8rj74b7f80**, corroborated by successful activation journal. Full derivation equality of these differing generations is not claimed. Relevant delivered niri binary remains **`/nix/store/y32xfvyx99qp91s2g3d2dr8wsx7k3gb0-niri-26.04/bin/niri`** and KDL is store-backed (runtime log 49–88), matching ledger validator identity.

[inherited execution] niri opened IPC `/run/user/1000/niri.wayland-1.112705.sock`, consumed **1.020s CPU over 2min 33.945s wall time, 189.7M peak**, and exited after confirmation. The socket is a historical opening, not claimed still open. Whole-boot suspend counters were **0 / 0**, not proof of 35-minute niri AC/battery windows (runtime log 210–237). [operator] cog selection, Important Hotkeys overlay, Ghostty bind/command and clean return to GDM establish a usable bare-compositor smoke test, not a complete desktop assembly.

## Overall Decision

- [ ] PASS — fully verified, archive-ready.
- [ ] PASS WITH WARNINGS — may proceed to subsequent steps with the recorded warnings.
- [x] **FAIL — full acceptance verification not yet discharged.** Implementation/build and niri smoke test pass; return to the still-open runtime assertions, not to a fabricated persistence/portal source defect.

The decisive criteria are the change's own: both desktops usable and GNOME recovery works (delta 41,48,64–66); independent AC/battery no-idle-suspend established, not borrowed from GNOME (70–71); ordinary power key neither suspends nor powers off and deliberate suspend remains available (72,87–96). Evidence does not establish all of them. Task 8.4 expressly rejects the configuration-only substitution used in yesterday's change. This is an incomplete verification result, **not a claim these untested behaviors were observed failing**. Generic non-blocking §7/§8 findings do not authorize calling those explicit core obligations tested.

**What would constitute behavioral FAIL and did not occur in exercised checks:** niri unavailable/restart-looping/unusable at the panel did not occur in the operator smoke; settings accepted despite niri rejecting them did not occur in the negative build (it failed as intended); suspend did not occur in the short observed session; Session=niri was not lost on logout. Those exercised checks pass. An unavailable GNOME fallback, history rewritten at a later GDM restart, idle suspend after 35 minutes/on battery, poweroff on the ordinary key, or deliberate suspend blocked would also be FAILs, but their requisite scenarios were **not exercised**, so absence cannot be claimed. A failed resume during a separately consented deliberate suspend remains CAM-59/A13, explicitly not a promised fix.

The remembered-default consequence meets the explicitly written never-chosen/persisted-choice semantics (§9.1); it does **not** substantiate an operator-facing promise that cameron will default to GNOME after trying niri. The logind activation shortfall was real and needed manual correction; future operations must follow 6.5. Portal teardown failures and cosmetic/absent-X11 limitations do not by themselves defeat this bare-compositor slice's criteria.

**Next step:** orchestrator reviews/routes these artifacts, then arranges authorized physical/idle follow-ups for the open tasks and reruns verify. No unsafe operation is authorized by this report. Questions for that next run: when can the remaining GNOME/default-history and AC/battery observations be scheduled, and is separate informed consent granted for 8.6's suspend risk? Until then, leave the boxes and acceptance verdict open as recorded.
