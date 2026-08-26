# design — niri as a second selectable session on pyrite (slice A)

## Context

pyrite is a bare-metal Apple laptop running NixOS. Its graphical desktop is stock GNOME under GDM, enabled at system level by `services.displayManager.gdm.enable`, `services.displayManager.gdm.autoSuspend = false` and `services.desktopManager.gnome.enable` in `modules/machines/nixos/pyrite/default.nix:338-345`. The living capability `graphical-desktop-session` records that arrangement and currently excludes niri from it.

Two prior facts constrain everything below.

**A13.** Resuming this host from a suspended state is unreliable and recovering a failed resume requires a person at the machine (`openspec/specs/world-assumptions/spec.md`). The recorded rate is now 8 failures against 38 attempts — 7/30 at the time A13 was written, plus the failure recorded at `openspec/changes/archive/2026-09-09-pyrite-never-sleep/tasks.md` task 4.4, which was also a counterexample to that file's "the first suspend of a boot never fails" asymmetry. `disable-lid-wakeup` (`default.nix:278-296`) leaves the power button as the only wake source.

**The never-suspend guarantee is GNOME-shaped.** Everything discharging `The laptop does not suspend itself when nobody is using it` is `gsd-power` reading dconf: the GDM greeter database written by `autoSuspend = false`, and the four keys in `programs.dconf.profiles.user.databases` at `default.nix:376-388`. A niri session runs no gnome-settings-daemon. None of it applies.

Seven research reports in `logs/` are the evidence base and are cited rather than re-derived; `brainstorm.md` lists them as R1–R7. Nix-managed claims below were re-established by evaluation, per `openspec/config.yaml:24-30`, and the evaluation output is quoted.

## Goals

- niri is a second session at pyrite's login screen, selectable by a person at the panel.
- GNOME under GDM remains the default and the fallback, and per-user session choice persists.
- A niri session does not suspend the host on inactivity, established from source and verified by observation.
- The niri configuration is generated from a typed schema and checked at build time by the same niri the system installs.

## Non-Goals

- **Slice B: DankMaterialShell.** No shell assembly — no bar, launcher, notification daemon, lock screen, wallpaper tool, clipboard manager, or polkit agent beyond what the system already provides. R6 establishes that DMS supplies most of that list and that `xwayland-satellite` and a terminal are not among them; none of it is taken here.
- **Slice C: greetd + DankGreeter, dropping GDM and GNOME.** R3 §6 establishes that gnome-shell's `canLock()` asks `org.gnome.DisplayManager` for its Version and returns false on failure, and that `ScreenShield` is only constructed when it returns true — verified in pyrite's *delivered* `gnome-shell-50.2/lib/gnome-shell/libshell-18.so`, not only in upstream source. GNOME retained as a fallback session under greetd would therefore have no screen lock. That is a security regression that belongs to its own change.
- **The lid handlers.** Held at `"lock"`, `"lock"`, `"ignore"` by operator decision (`openspec/changes/archive/2026-08-01-pyrite-baremetal-nixos/retrospective.md:229-231`). Not reopened.
- **Yesterday's never-suspend configuration.** Not edited, not reorganized, not "tidied".
- **The resume defect.** Tracked as CAM-59; unexplained; not addressed here.
- **Blocking manual suspend.** No masking, no `AllowSuspend=no`, no inhibitor.

## Decisions

### D1: nixpkgs' `programs.niri` at system level

**Boundary: vendored versus first-party.** This sits on the vendored side and stays there — the session is registered by nixpkgs' module, not by anything this repository writes.

The pinned nixpkgs ships niri `26.04`, which is the current upstream release: `api.github.com/repos/niri-wm/niri/releases/latest` returns `v26.04`, published 2026-04-25, the same tag the package selects (R1 §8). Release-date lag is zero. The module registers the session with `services.displayManager.sessionPackages = [ cfg.package ]` and the package already satisfies that option's contract — `share/wayland-sessions/niri.desktop` plus `passthru.providedSessions = [ "niri" ]` (R4 §1). Confirmed here by evaluation: `providedSessions` on the registered package is `["niri"]` and `sessionData.sessionNames` becomes `["gnome","niri"]`.

Alternative considered: `epireyn/niri-flake`'s `nixosModules.niri`. Rejected. It `disabledModules` the nixpkgs module (R5 §1, `flake.nix:462`), so it is a replacement rather than an addition; its portal handling is less complete than nixpkgs' rather than more (R2 §1); and the original niri-flake author wrote on 2026-07-12 that the stable packages are "essentially obsolete", the installation modules "also essentially obsolete", and that "one should prefer" nixpkgs' modules, with the flake's intended focus being configuration (epireyn issue #12, cited at R2 §5).

### D2: `epireyn/niri-flake`'s `homeModules.config` at home-manager level, for typed KDL only

**Boundary: vendored versus first-party**, again — and specifically the part of a vendored flake we take versus the part we refuse. We take `homeModules.config` and nothing else: not `nixosModules.niri`, not `packages.*`, not `niri-flake.cache`.

The split is a supported public interface, not a workaround. `homeModules.config` imports only `settings.module`, defines the validation package, exposes the action and include helpers, and writes `niri/config.kdl`; it does not import the flake's NixOS module, does not reference NixOS `config.programs.niri`, does not install a compositor, and does not configure portals (R2 §2, `flake.nix:401-452`). Only `nixosModules.niri` carries the `disabledModules` and the `home-manager.sharedModules` bridge (R2 §2, `flake.nix:453-542`), so omitting it omits both. R2 §2 evaluated exactly this split against pyrite in memory and it worked: system niri `26.04`, validator `26.04`, native `useNautilus` retained, a 626-character generated config, sessions `["gnome","niri"]`.

What we are buying is the one capability the pinned nixpkgs does not have: a niri-specific typed option schema and renderer (R2 §1). What we are not buying is any claim that the schema is complete or derived from niri's grammar. R2 §4 demonstrates by direct evaluation that an unknown top-level setting fails, a wrongly-typed scalar fails, and an invented bind action *succeeds and renders* — the binary is the backstop, not the schema. R2 §4 also documents a real schema bug (epireyn #91) where the typed layer accepted a value that produced invalid niri configuration.

One consequence to state, since it is a loss and not only a gain: `homeModules.config` disables home-manager's own `wayland.windowManager.niri` module (R2 §2, `flake.nix:451`). We cannot use both interfaces.

### D3: the validation package MUST be the system niri

The config derivation runs `niri validate -c $configPath` using its configured package (R2 §1, §4; `flake.nix:223-234`). The standalone home-manager module defaults that package to the flake's own stable build, and without the flake's NixOS bridge, validator/runtime agreement is the consumer's responsibility (R2 §2, `flake.nix:415-420`).

So this is set explicitly to the system's niri and given its own requirement and its own verification. The failure mode it guards is not a build error; it is a build *success* that means nothing — a config checked against a niri we do not run, presented as a guarantee. Today both sides resolve to upstream `26.04`, which makes the pairing unusually strong (R2 §2), but "they happen to agree" is not the property we want to depend on.

Verification is by evaluating both sides and asserting equality of the store path, not of the version string: two different derivations can both call themselves `26.04`.

### D4: GNOME and GDM stay; the explicit default session is `null`

**The hazard.** nixpkgs' `programs/wayland/niri.nix:36-42` sets `services.displayManager.defaultSession = lib.mkDefault "niri"`, with a comment explaining it is there for niri-only setups. Under GDM that reaches `gdm.nix:249-252`, which puts `set-session <autologinSession>` in `display-manager.service`'s `ExecStartPre`; `set-session.py:60-82` then iterates every AccountsService user that is not a system account and calls `set_session` and `set_session_type` on each, without comparing previous values. Its own comment says "basically ignore session history" (R1 §6, R4 §2.4). Since slice A keeps GDM, this fires on every display-manager start.

**The resolution, determined by evaluation rather than argument.** Four states were evaluated against `nixosConfigurations.pyrite` using in-memory `extendModules` overlays — hypothetical configurations, not repository edits:

| Hypothetical | `defaultSession` | `generic.preStart` | `sessionNames` |
|---|---|---|---|
| pyrite today | `null` | `""` | `["gnome"]` |
| `programs.niri.enable = true`, nothing else | `"niri"` | `set-session niri` | `["gnome","niri"]` |
| ... plus `defaultSession = "gnome"` | `"gnome"` | `set-session gnome` | — |
| ... plus `defaultSession = null` | `null` | `""` | `["gnome","niri"]` |

The chosen value is an explicit `null`. An explicit `null` is a plain definition and therefore beats `mkDefault "niri"`, while the option's own `null` default does not — that is why it must be written out. The evaluation shows the pre-start collapsing to the empty string, so nothing is rewritten on any start.

`"gnome"` was considered and rejected: it also pins GNOME, but it does so by rewriting every user's saved session on every start, which destroys the per-user memory that makes the session picker useful. `null` gets GNOME as the default by a different route — GDM's own fallback, `get_fallback_session_name()`, tries the literal name `"gnome"` first before falling back to the alphabetically first entry (R4 §2.4 item 6) — while leaving a person's own saved choice intact. Note that `null` also makes `sessionData.autologinSession` resolve to `"gnome"` (evaluated), which is the first registered name; autologin is not enabled on this host, so this is recorded rather than relied upon.

The `defaultSession ∈ sessionNames` assertion is satisfied either way, because it short-circuits on `null` (`display-managers/default.nix:196-202`).

**The picker needs nothing.** gnome-shell's `SessionMenuButton._populate()` reads `Gdm.get_session_ids()` and hides the button when `ids.length <= 1` (`js/gdm/loginDialog.js:388-390`, verified at tag 50.2, which is what pyrite runs — R4 §2.3). The cog is hidden today because there is one session, not because a switch is off.

### D5: a fuller typed config, not a token one

This is the answer to "what is the minimum viable `config.kdl`", and it is settled by niri's own behaviour rather than by preference.

niri writes its bundled `resources/default-config.kdl` into `~/.config/niri/config.kdl` only when no file exists there — `Config::create_at` opens with `create_new(true)` and returns early on `AlreadyExists` (`niri-config/src/lib.rs:610-630`); the path itself comes from `default_config_path()` with `/etc/niri/config.kdl` as the system fallback (`src/main.rs:333-364`). Once a file exists, that file *is* the configuration; the bundled default is not merged into it. niri's own test states the consequence in as many words:

> "Some notable omissions: the default config has some window rules, and an empty config will not have any binds."
> — `niri-config/src/lib.rs:2430-2434`, `diff_empty_to_default`, tag `v26.04`

`Binds` derives `Default` over an empty `Vec` (`niri-config/src/binds.rs:19-20`). So a token config ships a session with no keybinding at all: no terminal, no window management, no quit. VT switching still works, because `KEY_XF86Switch_VT_1..12` is hardcoded (`src/input/mod.rs:4405-4410`), which is the only reason such a session would not be a trap.

Therefore slice A ships a config that is functionally sufficient rather than minimal: enough binds to open a terminal, move and close windows, and exit the session, plus the input settings this laptop needs. "Fuller" here means "usable", not "complete" — no shell integration, no bar keybindings, nothing from slice B.

### D6: store-referenced includes only

`programs.niri.settings.includes` is the typed-preserving escape hatch for settings the schema does not model, and is the supported way to reach them (R2 §4, `settings.nix:1273-1311`). Its boundary matters: niri parses included files recursively; `optional=true` ignores *NotFound* specifically, not malformed files; relative paths resolve against the config's base directory; and the flake validates a temporary build-time config, not the user's future home directory (R2 §4, citing niri `niri-config/src/lib.rs:297-444`). A required included file must therefore be available to that build, and a mutable runtime include can invalidate the effective config despite a successful build.

Slice A requires every include to be a store path. That keeps the build-time check meaningful. It does not make the included text typed — raw KDL inside an include has no Nix-level option checking, only the binary's parse.

### D7: the never-auto-suspend guarantee for a niri session, established from source

This is stated as what was verified, not as an absence of worry.

**niri itself has no idle timer.** `git grep -i idle` over `niri-config/src/` at tag `v26.04` returns *nothing*: there is no idle option in niri's configuration language at all. What niri has is the other half of the arrangement — it *implements* `ext-idle-notify-v1` and idle-inhibit as a compositor (`IdleNotifierState`, `IdleInhibitHandler`, `src/handlers/mod.rs:517-533`), so that an external idle daemon can ask to be told about inactivity. niri notifies; it does not act. Slice A starts no idle daemon, so nothing consumes those notifications.

**logind will not do it either, and this is made explicit rather than inherited.** `IdleAction` defaults to `ignore` (systemd v261 `logind.conf.xml:148-173`), pyrite declares no `IdleAction` (evaluated: `services.logind.settings.Login` carries only the three lid keys and `KillUserProcesses`), and the live value was read as `"ignore"` over the D-Bus API (R3, observation E5). Slice A carries an explicit `IdleAction = "ignore"` so that the property is declared and auditable rather than resting on an upstream default nobody wrote down.

**gsd-power is not present.** A niri session starts `niri-session`, which starts the user `niri.service`; GNOME's session units are pulled in by `gnome-session` and simply do not start under niri (R4 §4.2). That is why yesterday's dconf keys do not apply — and equally why GNOME's 900-second greeter default does not apply either.

**What was verified versus what was not.** Verified from source: niri has no idle configuration; niri implements only the notify and inhibit sides; logind's `IdleAction` default is `ignore` and pyrite's effective value is `ignore`. Not verified by this change: that no package on the system autostarts an idle daemon into a niri session through XDG autostart. `programs.niri` imports `wayland-session.nix`, which defaults `runXdgAutostartIfNone = true` (R4 §4.2), and although the target it creates is not `WantedBy` anything and stays dead unless the legacy X11 `none` session script runs, "the target is inert" is a source reading and not an observation of a running niri session. Task 4.2 turns that into an observation.

### D8: nothing in the GNOME or GDM power configuration is edited

`gdm.autoSuspend = false` and the four dconf keys stay exactly as yesterday's change left them. This is a design decision because the temptation is real: it would be tidy to unify power policy across both sessions, and it would put a working configuration at risk for no gain in this slice. The verification is a diff assertion, not a promise.

### D9: disable niri's power-key handling and explicitly make logind ignore the key (OQ5 resolved)

**Operator decision, 2026-09-09.** Ship `input { disable-power-key-handling }` in the generated niri config **and** declare `services.logind.settings.Login.HandlePowerKey = "ignore"`. This takes the key away from both handlers rather than trading niri's unconfirmed suspend for logind's poweroff. The operator's rationale is that this host's power button is its only wake source and roughly one suspend in five fails to resume; both alternatives are unacceptable. Waking is firmware-level and unaffected by logind policy, so the button remains the wake source. That hardware premise is supplied by the operator, not newly tested here; deliberate suspend remains available by an explicit session command, and CAM-59 remains unfixed.

**Boundary: upstream behaviour versus host policy; evaluated configuration versus delivered behaviour.** niri `v26.04` (`8ed0da44d974c32c6877d2f4630c314da0717ecb`) takes the `handle-power-key` inhibitor only when this flag is absent (`src/main.rs:219-224`, `src/niri.rs:2657-2677`). Its hardcoded `KEY_XF86PowerOff` → `Action::Suspend` returns before configured binds are searched (`src/input/mod.rs:4397-4440`); the action calls logind `Suspend` (`src/backend/tty.rs:2918-2928`). The flag disables both that default bind and the startup inhibitor. Do not add a configured power-key action in its place; start a fresh niri session for verification, since the inhibitor check is at startup.

**Exact pinned option, not a guessed rename.** At nixpkgs `044bfe75bfe4c7bbe043dc17b5e42ea823b84a09`, `nixos/modules/system/boot/systemd/logind.nix:13-39` defines the freeform **`settings.Login`** submodule; `:64-65` renders it into `[Login]`. The correct spelling includes `Login`. The old `services.logind.powerKey` still exists as a renamed alias (`:80-97`); a hypothetical assignment evaluates to `ignore` but emits this configuration warning:

```
The option `services.logind.powerKey' defined in `<unknown-file>' has been renamed to `services.logind.settings.Login.HandlePowerKey'.
```

Current pyrite, evaluated with `nix eval --json .#nixosConfigurations.pyrite.config.services.logind.settings.Login`:

```json
{"HandleLidSwitch":"lock","HandleLidSwitchDocked":"ignore","HandleLidSwitchExternalPower":"lock","KillUserProcesses":false}
```

Neither power-key setting is declared today. An **in-memory hypothetical** `extendModules` adding only `services.logind.settings.Login.HandlePowerKey = "ignore"` evaluates that setting to `"ignore"` and renders `HandlePowerKey=ignore` in `[Login]`; no implementation was written. Full commands and output: `logs/niri-slice-a-powerkey-decision.md`.

**Long press checked separately.** The pinned systemd is **261.1**, not merely v261 (`pkgs/os-specific/linux/systemd/default.nix:206-211`). It accepts `Login.HandlePowerKeyLongPress` (`src/login/logind-gperf.gperf:31-32`), reachable as `services.logind.settings.Login.HandlePowerKeyLongPress`; nixpkgs also retains the renamed `powerKeyLongPress` alias (`logind.nix:97`). Systemd defaults the short press to `poweroff` and the long press to **`ignore`** (`src/login/logind-core.c:50-51`, `man/logind.conf.xml:240-247`, tag `v261.1`). With long press ignored, its input path uses the short-press action instead (`src/login/logind-button.c:270-279`), which this decision makes `ignore` too. No additional long-press assignment is needed at this pin. This is not a promise to disable a firmware-enforced hard power cut from holding the button; that hardware path was not tested and is outside these software handlers.

Verification: tasks 2.5 and 4.4 check the built KDL and evaluated/rendered logind setting before deployment; task 8.7 observes an ordinary press doing neither suspend nor poweroff after a fresh login. No GNOME dconf, greeter auto-suspend, lid or wake policy changes are part of this decision. Logind policy is host-wide, not niri-only.

## Risks / Trade-offs

- **The typed schema is hand-maintained and can lag or be wrong.** → The binary validator is the backstop (D3), and `settings.includes` is the escape hatch (D6). R2 §4's epireyn #91 is a concrete case where the schema accepted something the binary rejected.
- **One more flake input, maintained by one person.** → We take only the schema; the packages, NixOS module and cache are refused, so the blast radius of the input going stale is "we hand-author KDL again", not "the machine does not boot". R2 §3 records the maintenance profile honestly: active and responsive, young, concentrated.
- **Validator and runtime drift apart at a later nixpkgs bump.** → D3 makes them the same store path by construction and verifies it by evaluation, so a drift is a build-visible change rather than a silent one.
- **A niri session is started and is unusable at the panel.** → GNOME is still registered, still the default, and still the fallback; the recovery is picking GNOME at the next login, with no rollback and no reboot. This is the whole reason for the slice boundary.
- **`xwayland-satellite` is absent, so X11 applications do not run under niri.** → Accepted for slice A and stated in Open Questions rather than fixed silently.
- **The power key would become an immediate suspend under niri.** → Mitigated by the operator's paired decision D9: disable niri handling and explicitly make logind ignore it. Firmware wake remains available; firmware hard power cut is not claimed to be disabled.

## Migration Plan

There is nothing to migrate. The change is additive: a second session appears, the first is untouched. Rollback is picking GNOME at the login screen; there is no state to unwind, because with `defaultSession = null` nothing is written to AccountsService by the configuration at all. Removing the change entirely is removing one flake input and the lines that use it, after which `sessionNames` returns to `["gnome"]` and the picker hides itself again.

## Open Questions

**OQ1 — answered: does nixpkgs' `programs.niri` wire `xwayland-satellite`?** No. Evaluated: filtering the hypothetical system package list for names matching `xwayland` or `satellite` returns `[]`. The module's `environment.systemPackages` is `[ cfg.package ]` and nothing else. This matches R2's finding that neither niri-flake's NixOS module nor its home-manager module installs satellite either.

What niri does supply is the *integration*: at `v26.04` it opens the X11 sockets itself, sets `DISPLAY`, and spawns satellite on demand from the path in its config, defaulting to the bare name `xwayland-satellite` resolved on `PATH` (`src/main.rs:203-213`, `src/utils/xwayland/satellite.rs:35-120`, `niri-config/src/misc.rs:176`). So satellite must be put on the session's PATH separately; nothing else is needed to connect it. Slice A does not do that, which means X11-only applications will not run in the niri session. Stated as a known limitation of the slice, not an oversight.

**OQ2 — answered: what portal backend does a nixpkgs niri session get, and is it sufficient without implicating GNOME's portal stack?** Evaluated, the hypothetical writes `xdg.portal.config.niri` as:

```
default = "gnome;gtk"
org.freedesktop.impl.portal.Access = "gtk"
org.freedesktop.impl.portal.Notification = "gtk"
org.freedesktop.impl.portal.Secret = "gnome-keyring"
```

with `xdg-desktop-portal-gnome` added to `extraPortals` (`niri.nix:62-79`), and `xdg-desktop-portal-gtk` arriving through the imported `wayland-session.nix`. It is sufficient: `xdg-desktop-portal-gnome` is the backend upstream recommends for niri and is required for screencast.

GNOME's portal stack is not implicated in either direction. Portal configuration is per-desktop: `portal.nix:157-165` writes `xdg.portal.config.<desktop>` to `/etc/xdg/xdg-desktop-portal/<desktop>-portals.conf`, so niri's lands at `niri-portals.conf`, while GNOME's arrives by a different route entirely — `configPackages`, evaluated as `["gnome-session-50.1"]` in the same hypothetical. `xdg-desktop-portal` selects by `XDG_CURRENT_DESKTOP`, which differs between the two sessions. Portal *packages* merge as a list, and the evaluated `extraPortals` shows `xdg-desktop-portal-gnome` and `xdg-desktop-portal-gtk` each appearing twice — duplicates, not conflicts. The one caveat to state plainly: niri's session does route its Secret portal to `gnome-keyring` and its default to the GNOME backend, so it depends on GNOME's *portal packages* being installed. Under slice A they are, because GNOME is. Slice C removes GNOME, which is where that dependency becomes a question — noted there, not here.

**OQ3 — answered: does adding a second `sessionPackages` entry require anything else for GDM to offer it?** No. The aggregated `-desktops` derivation reaches GDM through `XDG_DATA_DIRS` on `display-manager.service` (`gdm.nix:223-253`), and R4 §1 established that it is *not* in `environment.systemPackages` — `/run/current-system/sw/share/wayland-sessions` does not exist on the machine. Evaluated here: the hypothetical's `services.displayManager.generic.environment.XDG_DATA_DIRS` contains `/nix/store/k4cpgwdykkv2877gsk9grzsl7cppfp7g-desktops/share`, which is the same derivation `sessionData.desktops` evaluates to, and `sessionNames` is `["gnome","niri"]`. GDM enumerates `$XDG_DATA_DIRS/wayland-sessions` and infers the session type from the directory the entry was found in (R4 §2.2). Nothing else is needed. There is no assertion anywhere against multiple sessions (R4 §1).

One residual, carried from R4 §6 and not closed here: niri's desktop entry uses a relative `Exec=niri-session`, and R4 verified that `/etc/pam/environment` exports a PATH containing `/run/current-system/sw/bin` but did not trace `gdm-session-worker`'s exec of a Wayland session end to end. Task 4.1's observation of an actual login is what closes it.

**OQ4 — answered: minimum viable `config.kdl`.** See D5. A functionally sufficient config, because an empty one has no binds at all by niri's own test.

**OQ5 — resolved by operator decision: disable both software handlers.** See D9 for the paired niri/logind policy, pinned option spelling, long-press default, rationale and verification. This is no longer awaiting an answer.

**OQ6 — operator-accepted disposition; designation finding remains open.**

`openspec/config.yaml` `rules.specs` requires every content noun in a `behavioral` requirement to resolve against the designation table in `openspec/specs/world-assumptions/`. Three do not:

| Term | Used in | Nearest existing row | Why it is not the same |
|---|---|---|---|
| `desktop` | "a second desktop is offered", "the established desktop" | `desktop session` — "the state in which a person is logged in at a host's panel and interacting with a graphical desktop" | The existing row designates a *state*. This change needs the *thing that can be chosen* at the login screen, of which there are now two. A state is not selectable. |
| `default desktop` | "a person who does not choose gets the established desktop" | none | Denotes which desktop a person gets absent a choice of their own, and the persistence of a person's own past choice. |
| `settings` | "the settings a desktop will start with" | `settings panel` — the interface for changing a desktop's settings | The panel is designated; the settings themselves are not. |

This change deliberately does **not** add them, and the reason is a cross-change hazard rather than laziness. `world-assumptions`'s `Grounded vocabulary for behavioral requirements` requirement is `MODIFIED` by two other unarchived changes — `stand-up-nixbot-on-magnetite` and `stand-up-gitea-mq-on-magnetite` — and `MODIFIED` is full replacement, so a third or fourth modifier's delta must be a superset of a corpus that is moving underneath it (`openspec/changes/stand-up-nixbot-on-magnetite/design.md` D11; `logs/nixbot-world-assumptions-superset-repair.md`). Adding three rows would mean re-authoring the whole table against a moving target for a deliberately small slice, with a real chance of silently dropping rows another change added.

Recorded as an open finding, per `openspec/config.yaml` `rules.verify`: "If specs/world-assumptions does not exist, record that as the designation-lint finding rather than reporting the lint clean." The table exists but does not cover these terms, which is the same failure to report honestly rather than paper over. The operator explicitly accepts this disposition for slice A (2026-09-09); it is not an unanswered question and the lint is not clean. Whichever change next owns that table alone should add these three rows. The structural follow-up is a **sync-time superset check**, being filed separately as its own Linear issue; no issue identifier is claimed here and no table repair is added to CAM-63.
