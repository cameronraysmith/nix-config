# graphical-desktop-session Specification

## Purpose

This capability covers a graphical desktop reachable on the machine's own panel with no network involved, which is what travel-readiness amounts to for a laptop.
It governs a stock GNOME session under GDM enabled at system level, so the desktop is complete with no home-manager desktop configuration on the user side.
The criterion it holds is a rendered greeter and a reached, interactive shell observed at the machine, since a display manager reporting active is compatible with a blank panel and with a session that restart-loops back to the greeter.
Enabling the display manager leaves the stage-1 unlock prompt a stage-1 event, so reaching the desktop still begins with a credential typed before any graphical target starts.
Among the fleet's NixOS hosts pyrite carries this capability; the other laptops run nix-darwin and the servers are headless.

## Requirements

### Requirement: The pyrite host provides a local GNOME desktop under GDM

The pyrite host module SHALL enable a stock GNOME desktop with `services.displayManager.gdm.enable = true` and `services.desktopManager.gnome.enable = true`, the two options nixpkgs seeds into `nixos-generate-config` at `nixos/modules/services/desktop-managers/gnome.nix:250-251`.
The desktop SHALL be system-level: no home-manager desktop configuration is required, because a stock GNOME session takes nothing from the admin user's already-imported home-manager.
niri and its Wayland shell assembly are NOT part of this capability.

#### Scenario: the two GNOME system options are set

- **WHEN** `nix eval .#nixosConfigurations.pyrite.config.services.displayManager.gdm.enable` and `nix eval .#nixosConfigurations.pyrite.config.services.desktopManager.gnome.enable` are evaluated
- **THEN** both return `true`
- **AND** these are the post-rename option paths at the pinned nixpkgs — not `services.xserver.displayManager.gdm` or `services.xserver.desktopManager.gnome`, which are renamed away — so the eval resolving at all is part of the check

#### Scenario: no home-manager desktop configuration is required

- **WHEN** the admin user cameron's home-manager is imported at the machine level and carries no desktop module
- **THEN** the GNOME session is nonetheless complete, because `services.desktopManager.gnome.enable` supplies the shell, portals, polkit agent, keyring, dconf, settings daemon, applet, and control center at system level
- **AND** the user side of the desktop is therefore near-zero, since home-manager carries no desktop toggle

#### Scenario: the machine reaches a graphical login

- **WHEN** the installed machine boots, the LUKS container holding the ZFS root is unlocked at the stage-1 prompt, and boot completes
- **THEN** the GDM greeter renders on the internal Retina panel, and an operator authenticating as cameron with the clan-generated user password (`clan vars get pyrite user-password-cameron/user-password`) reaches an interactive GNOME shell whose Activities overview responds
- **AND** `systemctl is-active display-manager` returning `active` is necessary but NOT sufficient evidence, because GDM reports `active` while `i915` KMS leaves the panel blank on the installed 6.18.37 kernel and while a session restart-loops back to the greeter — so the criterion is discharged only by a rendered greeter plus a reached, interactive shell observed at the machine
- **AND** the check depends on no audio, which is a Non-Goal, and on no network, since the login is local — which is what travel-readiness requires
- **AND** travel-readiness now also depends on a credential typed before the desktop exists, because reaching this login means first passing the stage-1 unlock: the committed clan-vars passphrase, which is the only credential the installed machine carries until D30's post-boot enrollments land, and thereafter an enrolled token seated with its client PIN typed, with the passphrase as fallback
- **AND** that fallback is reached by pressing Enter on an empty PIN at the token prompt rather than by any timeout, so a traveller carrying the passphrase but not the tokens needs that keypress to reach the greeter at all

#### Scenario: enabling GDM does not perturb the stage-1 unlock prompt

- **WHEN** GDM is enabled on a machine whose root is unlocked by a stage-1 initrd prompt against a LUKS container (D1, D11)
- **THEN** the unlock prompt remains a stage-1 initrd event that unlocks the root before any graphical target starts, because `systemd.services.display-manager` is a stage-2 unit ordered after `systemd-user-sessions.service` (`nixos/modules/services/display-managers/gdm.nix:294-300`) and is reached only after the root the prompt gates is mounted
- **AND** GDM enables no plymouth: its only plymouth definition is guarded by `lib.mkIf config.boot.plymouth.enable` (`gdm.nix:313`), so with plymouth off per D11 the console ask-password path `systemd-cryptsetup` uses is unchanged, decidable by `nix eval .#nixosConfigurations.pyrite.config.boot.plymouth.enable` returning `false`
- **AND** the stage-1/stage-2 separation is unaffected by the FIDO2 enrollment, because disko forces `boot.initrd.systemd.enable = true` (`lib/types/luks.nix:354`) and that option was already true on this machine through `modules/system/initrd-networking.nix:7`, so the initrd's agent stack does not change

### Requirement: The laptop does not suspend itself when nobody is using it

The pyrite host SHALL NOT enter a suspended state on account of inactivity alone, whether the operator is at the login screen or in a desktop session, and whether the machine is running on mains power or on its battery.
A person SHALL remain able to suspend the host deliberately, and the host SHALL continue to blank and lock its panel after a period of inactivity, so that "does not suspend itself" does not mean "stays visible and unlocked".

**Discharged by**: world assumption `A13 — Resuming this laptop from a suspended state is unreliable, and recovering a failed resume requires a person at the machine`, which is what makes an unattended suspend a cost rather than a convenience.

This requirement is harm reduction and not a repair. It reduces how often the host takes the resume risk; it does not reduce the risk, which remains unexplained and is tracked separately.

#### Scenario: Nobody touches the machine at the login screen

- **WHEN** the host has reached its greeter and no person interacts with it for any length of time, on mains power or on battery
- **THEN** the host stays awake and remains reachable over the network, rather than suspending itself and requiring a person to be present to wake it

#### Scenario: Nobody touches the machine during a desktop session

- **WHEN** an operator is logged in to the desktop and stops interacting with it for any length of time, on mains power or on battery
- **THEN** the panel blanks and the session locks after the established period, and the host stays awake

#### Scenario: The operator suspends the machine on purpose

- **WHEN** an operator chooses to suspend the host, from the desktop or from a shell
- **THEN** the host suspends, unchanged by this requirement, and the operator accepts the resume risk knowingly on that occasion

#### Scenario: A person changes the power settings from the desktop's own settings panel

- **WHEN** a person sets an automatic-suspend policy through the desktop's settings panel
- **THEN** that person's choice takes effect over the declared fleet policy, because the fleet deliberately leaves these settings changeable at the machine
- **AND** the declared policy is therefore what the host does absent such a change, not a guarantee about what it does
