# Design

Four decisions and one honest finding. The diagnosis is in `logs/`; this file records only what is chosen over it.

## D1 — Use `services.displayManager.gdm.autoSuspend = false` rather than writing the greeter profile by hand

**Boundary: vendored-versus-first-party.** `programs.dconf.profiles` is an attrset keyed by profile name, and nixpkgs' `gdm.nix:337-356` already owns the `gdm` key, ending its list with `"${gdm}/share/gdm/greeter-dconf-defaults"`. A first-party `programs.dconf.profiles.gdm.databases` entry **merges with** that list rather than replacing it. First-match-wins ordering means a prepended entry would work, but only if it lands first, which is a property of list merge order rather than of anything written here (`logs/pyrite-idle-suspend-diagnosis.md` §6.3).

`autoSuspend = false` goes through the vendored option and produces exactly the database this change wants — both timeouts `0`, both types `"nothing"` — with no ordering hazard.

Cost, accepted rather than overlooked: the option is all-or-nothing across AC and battery. There is no supported way to say "never on AC, 30 minutes at the greeter on battery" without taking on the hand-written profile and its merge hazard. Given the failure rate, a greeter that never sleeps on battery is the wanted answer anyway.

## D2 — Set the `-type` keys to `"nothing"`, not merely the timeouts to `0`

From gnome-settings-daemon 50.1 `plugins/power/gsd-power-manager.c`, `idle_configure()`, quoted at `logs/pyrite-graphical-session-idle-evidence.md` §4:

```c
if (timeout_sleep != 0) {
        if (action_type != GSD_POWER_ACTION_NOTHING) {
                manager->idle_sleep_id = gnome_idle_monitor_add_idle_watch (...);
        }
```

A zero timeout skips arming the watch. `"nothing"` skips it too, and additionally survives someone setting a nonzero timeout later — which is not hypothetical, since exactly that happened on this machine on 2026-09-08 when the settings panel wrote `3600` (`logs/pyrite-graphical-session-idle-evidence.md` §5). Both are set: the timeouts express the intent, the types enforce it at the point of arming.

## D3 — Keep the module's no-`locks` stance, and clear the stale user-database keys operationally

`modules/machines/nixos/pyrite/default.nix:341-344` omits `locks` deliberately so a change made in GNOME Settings wins over the declared value. That is kept. The consequence is that this change cannot make the declared values operative on pyrite by activation alone: `~/.config/dconf/user` already holds `sleep-inactive-ac-type` and `sleep-inactive-ac-timeout`, and `/etc/dconf/profile/user` lists `user-db:user` ahead of the Nix file-db.

**Boundary: source-versus-delivered.** Evaluating the flake proves what the generated database contains; it does not prove what `gsd-power` reads, because a second database sits in front of it. So the post-deploy step is a `dconf reset` of those two keys, and verification is a session-correct read on the machine rather than a `nix eval`.

Rejected alternative: adding `locks` for these four keys. It would make activation sufficient and drift impossible, but it greys out the Power panel controls, which directly contradicts the stated rationale of the comment above. That is an operator decision about a different question and is not folded into this one.

## D4 — Retain `idle-delay = 1800`

Blanking and locking are not the complaint and cost nothing. Per `logs/pyrite-graphical-session-idle-evidence.md` §4, the sleep watch is measured from the same zero as every other idle watch rather than added to `idle-delay`, so the two settings are independent and leaving one alone does not weaken the other.

## Designation finding — recorded rather than reported clean

`openspec/specs/world-assumptions/` exists and carries a designation table (lines 98-132), so the lint is not vacuous. It carries **no** rows for the terms this change's subject matter is made of: no `suspend`, no `inactivity`, no `wake`, no `panel`, no GNOME, dconf, or `gsd-power` terms of any kind. Two dispositions were applied, both deliberately:

- The GNOME, dconf, and gsd names are **machine-side** and are kept out of the behavioral requirement entirely. They appear in this file and in `tasks.md`, which are not vocabulary-governed. No interface capability is created for them, because this change adds no new interface property — it changes the value of an existing one.
- The genuinely world-side terms the new behavioral requirement does use — `suspend` (fleet sense), `inactivity`, `wake source`, `panel` — are **added** to the designation table by this change's `world-assumptions` delta, per that spec's own scenario "A behavioral requirement uses an unlisted term", which requires the disposition be explicit rather than silent.

A separate observation, recorded because it is true and not because this change fixes it: the existing `graphical-desktop-session` requirements name `nix eval`, option paths, and nixpkgs source lines directly, which is not the world vocabulary its `behavioral` stratum implies. The requirement added here does not follow that precedent; the inconsistency between them is left as it stands rather than being resolved as a side effect of a power-policy change.

A collision worth naming: `stand-up-nixbot-on-magnetite` is unarchived and its own `world-assumptions` delta modifies this same requirement, and a `MODIFIED` delta must carry full updated content. This change's full content is therefore the living corpus table **plus that change's fourteen rows plus this change's eight**, so the two converge on the same table whichever archives first, rather than one silently deleting the other's rows. If that change is abandoned rather than archived, its rows arrive here anyway and should be removed deliberately.
