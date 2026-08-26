# brainstorm — niri as a second selectable session on pyrite (slice A)

**Provenance.** This is not the transcript of a live brainstorming conversation. It is a decision log reconstructed from seven source-grounded research reports written on 2026-09-09, all in `logs/`, plus fresh evaluation performed while authoring this change. Recording it that way is the honest form: the exploration happened in those reports, and repeating it here as if it were dialogue would misdescribe where the evidence came from.

Reports read in full and treated as the evidence base:

| Ref | File |
|---|---|
| R1 | `logs/niri-prime-nixpkgs-native-stack.md` |
| R2 | `logs/niri-prime-flake-vs-nixpkgs.md` |
| R3 | `logs/niri-prime-greetd-safety.md` |
| R4 | `logs/niri-research-session-switching.md` |
| R5 | `logs/niri-research-niri-flake.md` |
| R6 | `logs/niri-research-dankmaterialshell.md` |
| R7 | `logs/niri-research-joshsymonds-reference.md` |

## Background

pyrite runs a stock GNOME desktop under GDM, enabled at system level by two lines in `modules/machines/nixos/pyrite/default.nix:338-345`. The living capability `graphical-desktop-session` records that arrangement and, at `spec.md:17`, states that "niri and its Wayland shell assembly are NOT part of this capability", with `spec.md:29` adding that "home-manager carries no desktop toggle". Yesterday's archived change `2026-09-09-pyrite-never-sleep` (CAM-62) added the requirement that the host does not suspend itself on inactivity, discharged by world assumption A13.

The operator wants niri. The three research primes concluded that the whole niri + DankMaterialShell + greetd assembly is one change too large to take in one step, and that the first safe step is a second selectable session with the working desktop left intact.

## Decision chain

**Q1 — Which niri does the system install: nixpkgs' `programs.niri`, or a third-party flake's NixOS module?**

nixpkgs. It ships niri `26.04`, which is the current upstream release with zero release-date lag (R1 §8: niri released 2026-04-25, latest release is the same tag), and its module already registers the session (`nixos/modules/programs/wayland/niri.nix:34`, `services.displayManager.sessionPackages = [ cfg.package ]`). Its portal wiring is more complete than the flake's, not less (R2 §1). The original niri-flake author states in epireyn issue #12 (2026-07-12) that the stable packages and installation modules are "essentially obsolete" and "one should prefer" nixpkgs' modules, with the flake's continuing focus being configuration (R2 §5). Taking the flake's NixOS module would additionally `disabledModules` the nixpkgs one (R5 §1), which is a swap, not an addition.

**Q2 — Then why take a flake input at all?**

For one thing only: `epireyn/niri-flake`'s `homeModules.config`, which supplies a niri-specific typed Nix option schema and a KDL renderer that the pinned nixpkgs module does not have (R2 §1). The split is a supported public interface: that module imports only `settings.module`, does not import the flake's NixOS module, does not install a compositor, and does not configure portals (R2 §2, citing `flake.nix:401-452`). An in-memory evaluation of exactly this split against pyrite succeeded (R2 §2). We take the schema and refuse the packages, the NixOS module, and the binary cache.

**Q3 — Which niri validates the generated config?**

The same one the system installs. The config derivation runs `niri validate -c $configPath` using its own configurable package (R2 §1, §4). If that package is not the system's niri, the build checks a binary we never run: the guarantee would look present and be hollow. This is elevated to a requirement with its own verification rather than left as an implementation detail, because it is exactly the kind of thing that silently drifts when someone later bumps one side.

**Q4 — Does GNOME stay, and does it stay the default?**

Yes to both. GNOME is the fallback: if niri is unusable at the panel, the operator picks GNOME at the next login and loses nothing. GDM's session picker appears by itself once a second session is registered — gnome-shell hides the cog if and only if `ids.length <= 1` (R4 §2.3, `js/gdm/loginDialog.js:388-390` at tag 50.2, which is what pyrite runs). Per-user choice persists in AccountsService at `/var/lib/AccountsService/users/<user>`, key `Session=` (R4 §2.4).

**Q5 — What breaks that default?**

`programs.niri` sets `services.displayManager.defaultSession = lib.mkDefault "niri"` (nixpkgs `niri.nix:42`). Under GDM that flows to `generic.preStart`, which runs `set-session niri`, whose own comment says it will "basically ignore session history" and which iterates every non-system AccountsService user on every display-manager start (R1 §6, R4 §2.4, `set-session.py:60-82`). Since slice A keeps GDM, this fires. It must be neutralised, and the correct value has to be determined by evaluation rather than guessed.

**Q6 — Does yesterday's never-suspend work protect a niri session?**

No, and this is the decision that matters most. All of it is `gsd-power`/dconf based (`programs.dconf.profiles.user.databases` and `gdm.autoSuspend = false`). A niri session runs no gnome-settings-daemon, so none of those keys are read by anything. A13 says a failed resume needs a person at the machine; `disable-lid-wakeup` leaves the power button as the only wake source; the recorded failure rate is now 8 failures against 38 attempts (7/30 at the time A13 was written, plus the failure recorded at `2026-09-09-pyrite-never-sleep/tasks.md` task 4.4). An unattended suspend under niri costs a physical power cycle. So "the niri session never auto-suspends" has to be established in its own right, from source, and not assumed from the absence of a mechanism.

**Q7 — Minimum viable `config.kdl`: token or fuller?**

Fuller, and the reason is a fact about niri, not taste. niri only writes its bundled `resources/default-config.kdl` into `~/.config/niri/config.kdl` when no file is there (`niri-config/src/lib.rs:610-630`, `src/main.rs:333-364`). Once a file exists, that file is the config; the defaults are not merged into it. niri's own test says so: `diff_empty_to_default` at `niri-config/src/lib.rs:2423-2434` clears `default_config.binds.0` before diffing with the comment "an empty config will not have any binds". A token config therefore ships a session with no keybindings at all — no terminal, no quit — which is not a session anyone can use, and not a safe fallback experiment either.

**Q8 — What did the reports leave for this change to answer from source?**

Four, all answered in `design.md` §Decisions and §Open Questions: whether nixpkgs wires `xwayland-satellite`; what portal backend a nixpkgs niri session gets; whether a second `sessionPackages` entry needs anything else for GDM to offer it; and the minimum viable config above.

## Trade-offs weighed

- **One more flake input** versus hand-authored KDL with no semantic typing. R2 §5 frames this as a genuine choice, not fence-sitting: the schema is a real capability the pinned nixpkgs lacks, its maintenance is young and concentrated on one maintainer, and new upstream keys can temporarily require raw includes. Accepted, for the schema only.
- **Store-referenced includes** versus mutable runtime includes. `niri validate` runs against a temporary build-time config; a required included file must be available to that build, and a mutable runtime include can invalidate the effective config despite a successful build (R2 §4, citing niri `niri-config/src/lib.rs:297-444`). Slice A requires store-referenced includes so the build-time check keeps meaning something.
- **Doing slices A, B and C at once** versus three. Rejected. R3 §6 shows slice C alone removes GNOME's screen lock (gnome-shell's `canLock()` asks `org.gnome.DisplayManager` and returns false without GDM, verified in pyrite's *delivered* `libshell-18.so`, not just upstream source). That is a security regression that needs its own change and its own answer. Slice B needs a shell assembly that is not niri's problem. Slice A is separable and reversible.

## Discovered while authoring, not in the reports

niri v26.04 takes over the power key when started as a session: `src/main.rs:219-224` calls `inhibit_power_key()`, taking a logind `handle-power-key` block inhibitor, and `src/input/mod.rs:4414` maps `KEY_XF86PowerOff` to `Action::Suspend`, which calls logind `Suspend` (`src/backend/tty.rs:2918-2928`). That hardcoded bind is resolved *before* configured binds (`find_bind`, `src/input/mod.rs:4397-4440`), so it cannot be rebound — only `input { disable-power-key-handling }` removes it. On this host the power button is the only wake source. This is a keypress, not an idle path, so the never-auto-suspend requirement alone does not address it. Originally raised as OQ5; the operator has now resolved it (2026-09-09): disable niri's handling **and** explicitly make logind ignore the key. `design.md` D9 records the exact pinned option, rationale, long-press finding and verification. OQ6's designation gap is also operator-acknowledged: retain the open finding, with a structural sync-time superset check being filed as a separate Linear issue, not a table repair in this slice.
