# Brainstorm: stop pyrite suspending itself

The diagnosis is already done. Three read-only reports in `logs/` establish the mechanism, the scope, and the cost, and this change exists to record a decision over them rather than to explore a problem space. This file is short because the exploration happened elsewhere.

## What is settled

- **The suspends are the GDM greeter's.** `logs/pyrite-idle-suspend-diagnosis.md` §1.1 quotes `systemd-logind`'s own client attribution: `suspend requested from client PID 8844 ('.gsd-power-wrap') (unit user@60578.service)`, uid 60578 = `gdm-greeter`. Two consecutive suspends at 15 m 01 s and 15 m 00 s after resume (§1.2) match the gnome-settings-daemon schema default of 900 s exactly. Root cause is `services.displayManager.gdm.autoSuspend`, whose nixpkgs default is `true` and which appears nowhere in this repository (§1.4).
- **The logged-in session's good behaviour is not ours.** `logs/pyrite-graphical-session-idle-evidence.md` §5: AC never-suspends only because GNOME Settings wrote `sleep-inactive-ac-type='nothing'` and `sleep-inactive-ac-timeout=3600` into `~/.config/dconf/user` at 22:33:44 on 2026-09-08, which outranks the flake's file-db. On battery the session still suspends at 1800 s, from our declared timeout plus an undeclared `-type` falling through to the schema default `'suspend'` (§8).
- **Suspend is not reliable here.** `logs/pyrite-resume-failure-diagnosis.md` §1.3: 30 successes, 7 failures across 14 boots, 18.9 % raw. The duration hypothesis is refuted; no mechanism is identified; §4.4 says so plainly.
- **`'nothing'` beats a zero timeout.** gnome-settings-daemon 50.1 `idle_configure()`, quoted at `logs/pyrite-graphical-session-idle-evidence.md` §4: the guard `if (action_type != GSD_POWER_ACTION_NOTHING)` means no idle watch is registered at all. A zero timeout is checked when the watch would fire; `'nothing'` is checked when it would be armed.

## What the decision actually is

Given a suspend path that fails one time in five and a machine whose only remaining wake source is the power button (`logs/pyrite-resume-failure-diagnosis.md` §5.2), every automatic suspend is a coin flip that can cost a physical trip and a held power button. The decision is to stop taking that risk unattended, while leaving the operator free to take it deliberately.

Three candidate postures were considered and two rejected:

- **Block suspend outright** (mask `sleep.target`, `AllowSuspend=no`). Rejected: the operator requires manual suspend, and it would strand the three D21 units that exist to make suspend survivable.
- **Fix the resume failure first.** Rejected as a precondition: `logs/pyrite-resume-failure-diagnosis.md` §4.4 cannot name the mechanism, and §4.5's discriminating tests each cost a supervised power-cycle risk. Waiting for that fix means continuing to eat unattended suspends in the meantime.
- **Remove automatic suspend, keep manual.** Chosen. It is harm reduction, not a repair; the failure rate is unchanged and is simply only incurred on purpose. `logs/pyrite-resume-failure-diagnosis.md` §0 reaches the same conclusion independently: "the best-supported improvement is not a fix at all; it is removing the automatic suspend."

## What was deliberately left alone

The lid handlers, because `retrospective.md:229-231` records restoring them to `"suspend"` as declined by operator decision and an idle-timeout change has no standing to reopen it. The no-`locks` stance on the dconf profile, because `modules/machines/nixos/pyrite/default.nix:341-344` chose it deliberately so GNOME Settings can win. Screen blank and lock at 30 minutes, because the complaint is about the machine disappearing, not about the screen going dark.
