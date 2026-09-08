---
linear_story_id: CAM-62
linear_story_identifier: CAM-62
linear_story_title: "Stop pyrite suspending itself on idle"
linear_story_url: https://linear.app/cameronraysmith/issue/CAM-62/stop-pyrite-suspending-itself-on-idle
linear_story_state: Todo
linear_team: CAM
linear_project: pyrite-baremetal-nixos
last_synced_state: Todo
last_synced_at: 2026-09-08T23:19:42Z
review_round: 0
max_review_rounds: 3
attempt_log:
  - { at: "2026-09-08T23:19:42Z", transition: "Backlog->Todo", outcome: "posted", note: "T1 bind; issue created in the existing pyrite-baremetal-nixos project and seeded from this proposal's business-facing content" }
---

## Why

pyrite suspends itself 15 minutes after the operator walks away, and roughly one resume in five never comes back — 7 failures against 30 successes across 14 boots, with no identified cause and no crash record. Because the lid was removed as a wake source, recovering a failed resume means being physically at the machine to hold the power button. Every unattended automatic suspend is therefore a coin flip whose losing side costs a trip and a power cycle. The resume defect is not fixable on present evidence; the automatic suspend is, today, in one module. Removing it does not make the machine reliable — it makes the risk something the operator takes on purpose.

## What Changes

Configuration only, in `modules/machines/nixos/pyrite/default.nix`. No unit is added, removed, or reordered, and nothing in the sleep path itself is touched.

**The login screen stops suspending the machine**
- From: `services.displayManager.gdm.autoSuspend` is unset, so nixpkgs' default `true` leaves the greeter's power settings empty and it falls through to the gnome-settings-daemon schema default of 900 s / `suspend`. This is the confirmed source of every suspend in the journal (`logs/pyrite-idle-suspend-diagnosis.md` §1.1–§1.4).
- To: set to `false`, which makes nixpkgs write a greeter dconf database with both timeouts `0` and both action types `nothing`.
- Reason: it is the supported option for exactly this, and hand-writing the greeter profile merges with nixpkgs' own list rather than replacing it.
- Impact: the login screen never sleeps, on AC or battery. That is accepted, not overlooked.

**The logged-in session stops suspending on battery**
- From: `sleep-inactive-battery-timeout = 1800` with no `-type` declared, so it falls through to the schema default `suspend` and the session does suspend after 30 minutes on battery (`logs/pyrite-graphical-session-idle-evidence.md` §0, §8).
- To: timeout `0`, plus `sleep-inactive-ac-type` and `sleep-inactive-battery-type` both `nothing`.
- Reason: per gnome-settings-daemon 50.1's `idle_configure()`, the type is the stronger control — the `action_type != GSD_POWER_ACTION_NOTHING` guard means no idle watch is registered at all, whereas a zero timeout is only consulted where a watch would fire (`logs/pyrite-graphical-session-idle-evidence.md` §4).
- Impact: the AC behaviour the operator currently enjoys becomes reproducible from the flake instead of resting on one stray entry in one user's home directory.

**The flake becomes authoritative again on the machine**
- From: `~/.config/dconf/user` carries `sleep-inactive-ac-type` and `sleep-inactive-ac-timeout`, written by the GNOME Settings power panel on 2026-09-08, and that database outranks the one the flake generates (`logs/pyrite-graphical-session-idle-evidence.md` §5).
- To: a post-deploy operational step resets those two keys, so the declared values are the operative ones.
- Reason: the module deliberately carries no `locks` so the settings panel can win; that choice is kept, which means a stale local override has to be cleared by hand rather than overridden.
- Impact: one manual step on the machine after activation, and the same drift can recur if someone edits the panel again.

**The screen still blanks and locks**
- From: `idle-delay = 1800`, screen blanks and the session locks after 30 minutes.
- To: unchanged.
- Reason: the complaint is that the machine disappears, not that the screen goes dark. Blanking costs nothing and locking is a security property.
- Impact: none; stated so a reader does not read "never sleep" as "never lock".

**A comment recording why**
- The module gains a comment naming the resume failure rate and the fact that the power button is the machine's only wake source, so the next reader does not restore an idle timeout on the reasonable-sounding grounds that laptops should sleep.

## Capabilities

### Modified Capabilities

- `graphical-desktop-session` (stratum: `behavioral`): the capability is currently silent on power policy — it covers reaching a desktop, not what the machine does once nobody is at it. One requirement is added: the host does not suspend itself on inactivity, while a person can still suspend it deliberately, and the panel still blanks and locks.
- `world-assumptions` (stratum: `world`): one assumption is added — that resuming this hardware from suspend is unreliable and that recovering a failed resume requires a person at the machine — and the designation table gains the terms the new behavioral requirement uses. There is no interface capability in this change; the machine-side names (`autoSuspend`, the dconf keys, `gsd-power`) stay in design and tasks, which is why the behavioral requirement can be stated without them.

## Impact

Implementation, in a follow-up, touches exactly one file: `modules/machines/nixos/pyrite/default.nix` — one new `services.displayManager.gdm.autoSuspend` line beside the existing GDM enable, four keys in the existing `programs.dconf.profiles.user.databases` block, and a comment. Plus one operational step on pyrite itself, resetting two keys in cameron's dconf database, which is not a repository edit.

**Non-goals, stated because each is a live temptation:**

- **The lid handlers are not touched.** `retrospective.md:229-231` records restoring them to `"suspend"` as declined by operator decision, and `logs/pyrite-idle-suspend-diagnosis.md` §6.2 gives the standing reason. An idle-timeout change has no business reopening a closed decision on unrelated grounds.
- **Manual suspend is not blocked.** No masking of `sleep.target`, no `AllowSuspend=no`, no logind inhibitor. The operator requires manual suspend, and blocking it would also strand `disable-d3cold-all`, `nvme-d3cold-suspend-guard`, and `disable-lid-wakeup`, the three D21 units that exist to make a suspend survivable.
- **The resume failure is not fixed here and is not tracked here.** `logs/pyrite-resume-failure-diagnosis.md` §4.4 states plainly that its mechanism is unexplained. This change lowers how often the machine takes that risk; it does not lower the risk. Anyone reading these artifacts as "pyrite's suspend problem is solved" has read them wrong.
- **Remote wake is out of scope.** Wake-on-LAN over the only NIC this machine has is established as infeasible, so "just wake it remotely" is not an alternative to not suspending.
