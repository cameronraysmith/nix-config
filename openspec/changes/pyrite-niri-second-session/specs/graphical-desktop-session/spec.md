## MODIFIED Requirements

### Requirement: The pyrite host provides a local GNOME desktop under GDM

The pyrite host module SHALL enable a stock GNOME desktop with `services.displayManager.gdm.enable = true` and `services.desktopManager.gnome.enable = true`, the two options nixpkgs seeds into `nixos-generate-config` at `nixos/modules/services/desktop-managers/gnome.nix:250-251`.
The desktop SHALL be system-level: no home-manager desktop configuration is required, because a stock GNOME session takes nothing from the admin user's already-imported home-manager.
niri IS part of this capability, as a second desktop a person may choose at the login screen; its Wayland shell assembly — bar, launcher, notification daemon, lock screen, wallpaper, clipboard manager — is NOT.

#### Scenario: the two GNOME system options are set

- **WHEN** `nix eval .#nixosConfigurations.pyrite.config.services.displayManager.gdm.enable` and `nix eval .#nixosConfigurations.pyrite.config.services.desktopManager.gnome.enable` are evaluated
- **THEN** both return `true`
- **AND** these are the post-rename option paths at the pinned nixpkgs — not `services.xserver.displayManager.gdm` or `services.xserver.desktopManager.gnome`, which are renamed away — so the eval resolving at all is part of the check

#### Scenario: no home-manager desktop configuration is required

- **WHEN** the admin user cameron's home-manager is imported at the machine level and carries no GNOME desktop module
- **THEN** the GNOME session is nonetheless complete, because `services.desktopManager.gnome.enable` supplies the shell, portals, polkit agent, keyring, dconf, settings daemon, applet, and control center at system level
- **AND** the GNOME side of the desktop is therefore near-zero on the user side, since home-manager carries no GNOME desktop toggle; home-manager now carries desktop configuration for the second desktop only, and that configuration has no effect on the GNOME session

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

## ADDED Requirements

### Requirement: A person at the panel can choose between two desktops, and the established one is what they get if they do not choose

The pyrite host SHALL offer more than one desktop at its login screen, so that a person standing at the machine may sign in to either.
The desktop that was already there SHALL remain what a person gets when they express no choice, and SHALL remain reachable at every login regardless of what happened in any earlier session, so that a newly offered desktop is something a person tries rather than something they are moved to.
A person's own choice SHALL persist across logins for that person alone, and SHALL NOT be overwritten on the host's behalf.

#### Scenario: two desktops are offered where one was offered before

- **WHEN** a person is at the login screen of a host that offers two desktops
- **THEN** both are presented as choices and the person can sign in to either
- **AND** the choice is presented without anyone having asked for it to be presented, because a login screen that has only one desktop to offer does not offer a choice at all

#### Scenario: a person signs in without choosing

- **WHEN** a person who has never chosen a desktop on this host signs in
- **THEN** they reach the desktop that was established before the second one was offered

#### Scenario: a person's own choice is remembered, and nothing else changes it

- **WHEN** a person chooses a desktop, signs in, and later signs in again
- **THEN** they reach the desktop they chose
- **AND** no other person's choice is altered by that, and no person's recorded choice is replaced on the host's behalf when the host next presents its login screen

#### Scenario: the newly offered desktop is unusable at the panel

- **WHEN** a person signs in to the newly offered desktop and finds it unusable at the machine's own panel
- **THEN** the established desktop is still offered at the next login and still works, so recovering costs a sign-out rather than a repair
- **AND** this remains true without anyone being at the machine having done anything to prepare for it

### Requirement: A newly offered desktop does not suspend the host when nobody is using it

A desktop newly offered at this host's login screen SHALL NOT cause the host to enter a suspended state on account of inactivity alone, whether the host is running on mains power or on its battery.
This SHALL be established for that desktop in its own right, and SHALL NOT be inferred from the fact that another desktop on the same host does not suspend it, because a property established for one desktop is a property of that desktop and not of the host.
A person SHALL remain able to suspend the host deliberately from the newly offered desktop. An ordinary press and release of the physical control that is this host's only wake source (A13), while using that desktop, SHALL NOT suspend or power off the host. That control SHALL remain a wake source; preventing an accidental suspend SHALL NOT prevent a person from waking the host after a deliberate one.

**Discharged by**: world assumption `A13 — Resuming this laptop from a suspended state is unreliable, and recovering a failed resume requires a person at the machine`. A13 is what makes an unattended suspend a cost rather than a convenience, and it applies to every desktop this host offers, not to the one it happened to be written about.

#### Scenario: nobody touches the machine during a session on the newly offered desktop

- **WHEN** a person signs in to the newly offered desktop and stops interacting with the host for any length of time, on mains power or on battery
- **THEN** the host stays awake and remains reachable over the network, rather than suspending itself and requiring a person to be present at the machine to wake it

#### Scenario: the established desktop and the login screen are unaffected

- **WHEN** the second desktop is offered
- **THEN** the established desktop still does not suspend the host on inactivity, and the login screen still does not, exactly as before
- **AND** neither behaves differently on mains power than on battery, in either direction

#### Scenario: a person presses the host's only wake source while the host is awake

- **WHEN** a person makes an ordinary press and release of the physical control that is this host's only wake source while using the newly offered desktop
- **THEN** the host neither suspends nor powers off, and the desktop remains usable
- **AND** a person can still deliberately suspend the host from that desktop and use that same wake source afterwards, without any promise that this unreliable host will successfully resume

#### Scenario: the operator suspends the host on purpose from the newly offered desktop

- **WHEN** an operator deliberately chooses to suspend the host from the newly offered desktop, rather than by pressing the physical control that is its wake source
- **THEN** the host suspends, and the operator accepts the resume risk knowingly on that occasion, as they would from any other desktop

#### Scenario: the reason the guarantee had to be re-established is that it did not carry

- **WHEN** the mechanism that keeps one desktop from suspending the host is one that only that desktop runs
- **THEN** a second desktop inherits nothing from it, and stating the guarantee for the host as a whole without checking the second desktop would assert something nobody established

### Requirement: A desktop is not offered until the settings it will start with have been checked by the program that will start it

Where this host generates the settings a desktop starts with, those settings SHALL be checked before the desktop is offered, and SHALL be checked by the very program that will start the desktop rather than by another copy or another version of it.
Every file those settings draw in SHALL be fixed at the time of the check and unchangeable afterwards, so that what was checked is what is used.

#### Scenario: settings that would be rejected are caught before anyone can select the desktop

- **WHEN** settings are generated for a desktop and the program that starts that desktop would reject them
- **THEN** the rejection surfaces while the host's configuration is being prepared, not at the moment a person selects the desktop at the login screen
- **AND** the failure is therefore recoverable from anywhere, rather than only by a person standing at the machine

#### Scenario: the checking program and the running program are the same

- **WHEN** settings are checked and the desktop is later started
- **THEN** the program that performed the check and the program that starts the desktop are the same one
- **AND** a check performed by a different copy would be a guarantee that looks present and is hollow, so it does not count as having checked

#### Scenario: a drawn-in file cannot change after the check

- **WHEN** the settings draw in a further file
- **THEN** that file is fixed at the time of the check and cannot be altered afterwards
- **AND** a file that could be altered afterwards would mean the settings in force are not the settings that were checked, however well the check went
