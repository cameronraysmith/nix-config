## Why

The Buzz relay is the server half of the Buzz communications platform, and this fleet already ships the client half: `buzz-source`, `buzz-cli`, `buzz-git-credential-nostr`, and `buzz-git-sign-nostr` are packaged and consumed by the desktop configuration.
Self-hosting the relay was investigated in a 2026-08-04 working note (`docs/notes/development/buzz/self-hosting.md`) which reached no verdict on the one question that gates everything: whether Cloudflare R2 can serve as the relay's object store.
The binding human decision of 2026-08-19 (`decision-deploy-scope`) resolved the scope question directly: land the packaging, the NixOS module, and the OpenSpec change reviewed and buildable, with the module's `enable` defaulting to false and magnetite not enabled, and keep the operational go/no-go as a separate later change.
That decision also required the R2 incompatibility to be established at the source rather than inherited from the note as a premise, and named that finding as one of the more valuable things this change can produce.
This change is the land-it-disabled half.
It delivers a reviewable configuration surface and declared credential slots, it records the verified object-storage finding with citations, and it states the enable path's prerequisites explicitly so the later go/no-go change inherits them rather than rediscovering them.
Nothing on the live host changes: the module is imported by magnetite and not enabled, so every unit, firewall opening, and secret sits behind an `enable` that no host sets.

## What Changes

This change packages the relay, declares its configuration surface as a NixOS module, and imports that module on magnetite without enabling it.
It provisions no daemons, opens no vhost, spends no DNS record, and chooses no tenant hostname, because the binding decision reserves every irreversible naming choice for the change that actually turns the relay on.
The object-storage question is answered here as a finding rather than as an implementation: R2 was verified at source and fails, Garage single-node is recommended with MinIO as the known-good fallback, and no object store is built in this change.

**A separate `relay-v*` source pin, independent of the shared desktop pin**
- From: one `pkgs/by-name/buzz/source` derivation pinned to the `desktop-v*` tag line, feeding every Buzz package this fleet builds.
- To: a second `pkgs/by-name/buzz/relay-source` derivation pinned to `relay-v0.2.1` (`6e5c462ac524de60d7edb46c66130fd779cc9006`, 2026-08-08) with its own `update.sh`, alongside the untouched `source` derivation.
- Reason: the relay releases on its own tag line and its own cadence, so a single shared pin would couple a server upgrade to a client upgrade — bumping the relay to pick up a server fix would simultaneously move the CLI and the credential helper the desktop configuration installs.
- Impact: a second `fetchCargoVendor` of the same workspace lockfile, in exchange for two upgrade decisions that stay independent.

**A `buzz-relay` package derivation built from that pin**
- From: no relay binary is buildable from this repository.
- To: a `pkgs/by-name/buzz/relay` derivation building the `buzz-relay` binary, with the compiled-in pre-receive hook shebang rewritten to a store path, a runtime PATH prefix carrying the six tools the fail-closed hook and the git transport both need, and an install check that drives the relay's own configuration validator.
- Reason: the hook is a compiled-in `const &str` that `patchShebangs` cannot reach, and a missing tool does not degrade the hook but rejects every push, so both facts are asserted at build time rather than assumed.
- Impact: `buzz-relay` builds on aarch64-darwin and x86_64-linux, and the two new package checks register automatically.

**A NixOS module shipped with `enable = false`**
- From: no relay configuration surface exists in this repository.
- To: a `flake.modules.nixos.buzz-relay` module with sixteen typed options, a free-form `settings` escape hatch rendered last, seven assertions, four clan-vars generator declarations wired into the unit's `EnvironmentFile`, and a hardened systemd unit — all behind `services.buzz-relay.enable`, which defaults to false.
- Reason: the binding decision is to land the surface reviewed and buildable while the operational go/no-go stays a separate change, so the configuration and the credential slots are declared before anything is switched on.
- Impact: the module is inert; importing it changes no unit, no firewall rule, and no secret on any host.

**Object storage answered as a verified finding, not an implementation**
- From: the 2026-08-04 note asserted R2 incompatibility with a shaky consistency argument, an unchecked S3 client layer, and no named off-switch.
- To: a source-verified finding recorded in design.md — R2 fails both the startup probe and steady state on the documented per-key 1-write/sec throttle, with Garage single-node recommended and MinIO named as the known-good fallback because upstream verifies against MinIO — together with three explicit corrections to the note's own claims.
- Reason: the binding decision required the incompatibility to be established at source rather than taken as a premise, and required a recommendation reasoning about fleet fit rather than features in the abstract.
- Impact: no object store is built here; the recommendation becomes the input to the later go/no-go change.

**Postgres, Redis, and backups modelled as dependencies rather than provisioned**
- From: the working note framed Postgres, Redis, and object storage as things the module would wire up, and its Phase 4 prescribes deploying with `enable = true`.
- To: all three modelled as typed options and assertions with no provisioning — no `services.postgresql` colonisation, no `services.redis`, no bucket — and the three unmet prerequisites stated explicitly as the enable path's inheritance.
- Reason: the binding decision forbids provisioning new daemons on magnetite in this change and requires the change to carry the prerequisites explicitly so the later go/no-go inherits them.
- Impact: enabling the relay without an object store, a Redis, and a backup story fails at the option layer or the assertion layer rather than starting a relay that cannot work.

**A magnetite import that is deliberately not an enablement**
- From: magnetite imports its service modules and enables them in the same place.
- To: magnetite imports `buzz-relay` with a comment recording that `services.buzz-relay.enable` defaults to false and is not set here, pointing at the module header for the prerequisites that gate switching it on.
- Reason: importing keeps the module inside the evaluated configuration so it is reviewable and cannot silently rot, while the unset `enable` keeps the live host unchanged.
- Impact: magnetite's evaluated configuration is semantically unchanged — no new unit, no new firewall port, no new generator.

## Capabilities

### New Capabilities
- `buzz-relay`: the Buzz relay's packaging and NixOS configuration surface as a deliberately inert deployment — two package derivations on a `relay-v*` source pin held separate from the shared `desktop-v*` pin, and a `flake.modules.nixos.buzz-relay` module that ships `enable = false`, provisions no daemons, refuses a public bind, asserts on every option whose absence would be silently wrong, declares four clan-vars credential slots and wires each one into the unit that consumes it, forces auth-token enforcement on against an upstream default that would otherwise select a published development key, and is imported by magnetite without being enabled; together with the recorded object-storage finding (R2 fails the relay's conformance probe and its steady-state push path, Garage single-node recommended, MinIO the known-good fallback) and the three explicit prerequisites the enable path inherits.

### Modified Capabilities
<!-- None. This change introduces a new capability; no existing capability's requirements change. -->

## Impact

Files added: `pkgs/by-name/buzz/relay-source/package.nix`, `pkgs/by-name/buzz/relay-source/update.sh`, `pkgs/by-name/buzz/relay/package.nix`, and `modules/nixos/buzz-relay.nix`.
Files updated: `modules/machines/nixos/magnetite/default.nix` gains the module import and a comment recording that it is deliberately not enabled.
`modules/checks/packages.nix` is unchanged, because both new packages build on aarch64-darwin and need no blacklist entry.
The four existing `pkgs/by-name/buzz/{source,cli,git-credential-nostr,git-sign-nostr}` packages are verified untouched, which is the point of the separate source pin.
Live-host impact is nil: magnetite's evaluated configuration gains no systemd unit, no firewall opening, and no secret, because every one of them is behind an `enable` that defaults to false and is set on no host.
Out of scope, and each named as an explicit prerequisite the later go/no-go change inherits: standing up the object store, introducing Redis as a new daemon class on this fleet, and establishing a backup story that does not exist fleet-wide.
Also out of scope: the nginx vhost, the Cloudflare DNS record, and the tenant hostname, because the Host derived from `RELAY_URL` is a durable tenant key persisted in Postgres and signed into every auth event, so it is not a free rename and belongs to the change that turns the relay on.
Also out of scope: building the `web` and `admin-web` Vite/React bundles, which would add a second JavaScript dependency closure; both variables are left unset, which is upstream's own source-tree default.
Verification here is confined to what a disabled module can prove: both packages build, the magnetite configuration evaluates with the module imported and stays semantically inert, and the enabled path evaluates with no failed assertions when given a complete configuration.
