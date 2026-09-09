## ADDED Requirements

### Requirement: The relay module ships disabled and is inert when imported

The configuration SHALL provide the Buzz relay as a `flake.modules.nixos.buzz-relay` module whose `services.buzz-relay.enable` option defaults to false.
Every systemd unit, firewall opening, and clan-vars generator the module declares SHALL sit behind that `enable` option, so that importing the module changes nothing.
No host SHALL set `services.buzz-relay.enable` in this change.
The module SHALL be imported by magnetite so that it stays inside the evaluated configuration and is type-checked on every evaluation, and that import SHALL NOT be an enablement.

#### Scenario: the module is imported without being enabled

- **WHEN** the magnetite NixOS configuration is evaluated with `flake.modules.nixos.buzz-relay` imported
- **THEN** `services.buzz-relay.enable` resolves to false because no host sets it, and the evaluation succeeds

#### Scenario: an imported but disabled module emits nothing

- **WHEN** the magnetite configuration is evaluated with the module imported and `enable` left at its default
- **THEN** no `systemd.services.buzz-relay` unit exists, no `buzz-relay` clan-vars generator is declared, and the ZeroTier-scoped firewall port list is unchanged from before the import

### Requirement: Missing required options fail at evaluation rather than at runtime

The module SHALL declare `relayUrl`, `objectStore.endpoint`, `objectStore.bucket`, `database.url`, and `redis.url` with no defaults, because upstream's defaults for each are a live development target that an unconfigured relay would address without complaint.
An enabled configuration that omits a required option SHALL fail at evaluation time.
The module SHALL assert that `relayUrl` is non-empty, that `objectStore.endpoint` and `objectStore.bucket` are both set, that `database.url` is non-empty, and that `redis.url` is non-empty.
The module SHALL declare no option naming a path to a secret, because the object-store credentials and the database password reach the relay from their clan-vars generators rather than from a file an operator manages by hand.
The module SHALL assert that `database.url` does not contain the string `buzz_dev`, because that is both upstream's published development password and a signal that a password has been written into an option that is rendered world-readable into the Nix store.
The module SHALL assert that `relayUrl` carries a `ws://` or `wss://` scheme, because the scheme drives the expected-URL reconstruction that NIP-42 and NIP-98 verify signatures against, so a wrong scheme fails authentication at runtime rather than at parse.

#### Scenario: an enabled configuration omits a required option

- **WHEN** `services.buzz-relay.enable` is set to true with `objectStore.endpoint` left undefined
- **THEN** evaluation fails at the option layer reporting that the option was accessed but has no value defined, rather than producing a relay that would start against a development default

#### Scenario: an enabled configuration supplies wrong values

- **WHEN** an enabled configuration sets a non-websocket `relayUrl` scheme, a public `bindAddress`, and a `database.url` containing `buzz_dev`
- **THEN** the corresponding assertions fire at evaluation time, each with a message naming the silent runtime failure it prevents

#### Scenario: a complete enabled configuration evaluates cleanly

- **WHEN** an enabled configuration supplies every required option with valid values
- **THEN** evaluation succeeds with no failed assertions and the unit's `ExecStart` resolves to the `buzz-relay` package's binary

### Requirement: The module refuses a public bind

The module SHALL constrain `bindAddress` to loopback or to the fleet's ZeroTier mesh prefix, and SHALL default it to `127.0.0.1` rather than inheriting upstream's `0.0.0.0`.
This constraint SHALL be an assertion rather than a convention, because magnetite retains `net.ipv6.ip_nonlocal_bind=1`, under which binding an address the host does not hold succeeds silently instead of failing at startup.
The assertion message SHALL record that the health and metrics listeners bind `0.0.0.0` unconditionally and independently of `bindAddress`, so a mesh-scoped firewall rule is their only containment.

#### Scenario: a public bind address is rejected

- **WHEN** an enabled configuration sets `bindAddress` to an address that is neither loopback nor inside the ZeroTier mesh prefix
- **THEN** the no-public-bind assertion fires at evaluation time and its message names the retained `ip_nonlocal_bind=1` behaviour that would otherwise make the mistake silent

#### Scenario: the health and metrics containment is stated rather than assumed

- **WHEN** the no-public-bind assertion message is read
- **THEN** it records that the health and metrics listeners bind `0.0.0.0` regardless of `bindAddress` and that the mesh-scoped firewall rule is what contains them

### Requirement: The module provisions no daemons and no backing services

The module SHALL provision no PostgreSQL, no Redis, and no object store, and SHALL model all three as dependencies expressed through typed options and assertions.
`redis.url` SHALL carry no default, so that an enabled configuration which omits it is refused at evaluation rather than silently directed at a `redis://localhost:6379` that no host on this fleet serves.
The module SHALL NOT enable `services.postgresql`, SHALL NOT enable `services.redis`, and SHALL NOT create a bucket.
The module SHALL NOT declare an nginx vhost, a DNS record, or an ACME certificate.

#### Scenario: enabling the relay does not colonise the host's backing services

- **WHEN** the module is evaluated with `enable` set to true
- **THEN** it enables no `services.postgresql` and no `services.redis`, creates no bucket, and declares no nginx vhost, DNS record, or ACME certificate

#### Scenario: an absent backing service is reported as a configuration error

- **WHEN** an enabled configuration supplies no `redis.url`
- **THEN** evaluation fails because the option has no default and no value, rather than the relay inheriting a localhost Redis address that resolves to nothing on this fleet

### Requirement: The relay's tenant hostname is not chosen in this change

The module SHALL declare `relayUrl` with no default and no placeholder value, so that the tenant hostname is a mandatory choice at enable time rather than an inherited one.
The `relayUrl` option's documentation and its assertion messages SHALL record that the Host derived from it is persisted as `communities.host` in PostgreSQL and signed into every NIP-42 and NIP-98 auth event, so changing it later orphans the existing community row and invalidates the signed history against it.
This change SHALL spend no vhost, no DNS record, and no hostname, because those are the irreversible naming choices reserved for the change that turns the relay on.

#### Scenario: no hostname is committed by this change

- **WHEN** this change's package derivations, module, and magnetite import are inspected for a relay hostname
- **THEN** none is present, because `relayUrl` has no default and no vhost or DNS record is declared

#### Scenario: the tenant-key consequence is recorded where an operator will meet it

- **WHEN** an operator reads the `relayUrl` option description or triggers its assertions
- **THEN** the durable-tenant-key consequence is stated explicitly, including that the Host is persisted as `communities.host` and signed into every auth event

### Requirement: The relay is built from a source pin independent of the shared desktop pin

The configuration SHALL package the relay from a `relay-source` derivation pinned to the upstream `relay-v*` tag line, held separate from the existing `source` derivation that tracks `desktop-v*` and feeds the client-side packages.
The shared `source` derivation and the four existing client packages built from it SHALL remain untouched by this change.
The separation SHALL exist so that a server upgrade is not coupled to a client upgrade in either direction.
The relay source's update script SHALL read the upstream tag-refs API rather than the releases API, because upstream publishes no GitHub Release object for `relay-v*` tags, and SHALL exclude prereleases lexically because a bare tag carries no prerelease flag.

#### Scenario: the relay pin moves without moving the client packages

- **WHEN** the `relay-source` pin is advanced to a newer `relay-v*` tag
- **THEN** the shared `source` derivation and the client packages built from it are unchanged, so the desktop CLI and git credential helper do not move with the server

#### Scenario: the update script can actually resolve a relay tag

- **WHEN** the relay source's update script queries upstream for the newest non-prerelease `relay-v*` version
- **THEN** it resolves the tag through the tag-refs API and asserts the ref object is a commit, rather than filtering a releases API that contains no `relay-v*` entries

### Requirement: The relay package asserts its fail-closed runtime dependencies at build time

The relay package SHALL rewrite the compiled-in pre-receive hook shebang from `#!/usr/bin/env bash` to a store path, using a substitution that fails when its pattern is absent, because the hook text is a compiled-in string constant that shebang patching cannot reach and the file only appears on disk at runtime.
The relay package SHALL wrap the binary with a PATH prefix carrying the tools the fail-closed hook and the git transport both require, because a missing tool does not degrade the hook but causes it to reject every push.
The relay package SHALL verify both the shebang rewrite and the wrapper contents in an install check, because a dropped wrapper or a missed substitution yields a relay that starts and serves traffic normally and then rejects every git push.
The relay package's install check SHALL drive the relay's own configuration validator rather than a flag probe, because the relay registers no argument parser and any flag invocation proceeds to open a database connection.

#### Scenario: the hook shebang is rewritten and the rewrite is asserted

- **WHEN** the relay package is built
- **THEN** the compiled-in pre-receive hook shebang resolves to a store-path bash and no `#!/usr/bin/env bash` remains in the wrapped binary, with the substitution failing the build if the upstream pattern is absent

#### Scenario: the install check exercises real relay code without a database

- **WHEN** the relay package's install check runs
- **THEN** it points `BUZZ_WEB_DIR` at a directory without `index.html` and asserts both a non-zero exit and the validator's exact message, needing no network and no database

### Requirement: The web and admin bundles are deliberately unset

The relay package and the module SHALL leave `BUZZ_WEB_DIR` and `BUZZ_ADMIN_WEB_DIR` unset, because both upstream directories are TypeScript sources requiring a pnpm build rather than prebuilt static assets, and packaging them would vendor a second JavaScript dependency closure.
Leaving them unset SHALL be recognised as upstream's own source-tree default and as the only safe value, because setting either to a directory lacking `index.html` returns a configuration error that makes the relay refuse to start.
The resulting gap SHALL be recorded explicitly: no read-only admin dashboard, no bundled invite landing page, and no optional git repository browser, while the WebSocket relay, the REST surface, git push and pull over HTTP, and NIP-42 and NIP-98 authentication are unaffected.

#### Scenario: the bundles are absent rather than misconfigured

- **WHEN** the relay package and the module are inspected for `BUZZ_WEB_DIR` and `BUZZ_ADMIN_WEB_DIR`
- **THEN** neither variable is set, rather than being pointed at a directory that lacks `index.html` and would make the relay refuse to start

#### Scenario: the missing admin surface is documented as a known gap

- **WHEN** a reader asks what the unset bundles cost
- **THEN** the change records that there is no admin dashboard, no invite landing page, and no git repository browser, and that the relay, REST, git transport, and auth surfaces are unaffected

### Requirement: Credential slots are declared before the service is enabled

The module SHALL declare four clan-vars generators for the relay's Nostr identity key, its git hook HMAC secret, its PostgreSQL role password, and its object-store credentials, all inside the `enable` guard so that none is realised while the module is disabled.
Generator names SHALL be derived from the service name rather than from upstream environment variable names, because a generator name is effectively immutable once minted and renaming one orphans the encrypted material committed for that host.
The identity and hook-HMAC generators SHALL exist because upstream's unset behaviour is unsafe rather than merely absent: an unset identity key falls back to a published development key or panics, and an unset hook HMAC secret is regenerated on every boot with no log line at all.
The module SHALL deliver secrets through `EnvironmentFile` rather than `LoadCredential`, because the relay exposes no `*_FILE` configuration variant and never consults the systemd credentials directory.
Every generator the module declares SHALL have its `env` file wired into the unit's `EnvironmentFile`, so that no generator prompts an operator or commits encrypted material for a secret the relay never receives.
The module SHALL NOT additionally declare an option naming a path to the same secret, because a secret on this fleet travels the sops-backed clan-vars lane and a hand-managed file would place it outside that lane while asking the operator for it a second time.

#### Scenario: the generators are declared but not realised while disabled

- **WHEN** the magnetite configuration is evaluated with the module imported and disabled
- **THEN** no `buzz-relay` clan-vars generator is present in the configuration, because all four sit inside the `enable` guard

#### Scenario: generator names survive an upstream variable rename

- **WHEN** upstream renames the environment variable a generator feeds
- **THEN** the generator name is unaffected because it is derived from the service name, so the encrypted material committed under that name is not orphaned

#### Scenario: each secret is supplied once and actually reaches the relay

- **WHEN** an operator enables the relay and supplies the object-store credentials through the prompt its generator raises
- **THEN** those credentials reach the unit through its `EnvironmentFile`, and no separate option demands the same credentials by a file path

### Requirement: Auth-token enforcement is on by default, departing from upstream

The module SHALL set `BUZZ_REQUIRE_AUTH_TOKEN` to true in the environment it renders, rather than inheriting upstream's default of false.
This departure SHALL exist because upstream's default is what selects the published hardcoded development private key when no relay identity key is supplied, so the upstream default fails open and the configuration that starts is the unsafe one.
With enforcement on, that same missing-key case SHALL become a startup failure rather than a relay signing events with a key that anybody can read from a public repository.
The value SHALL remain overridable through the `settings` escape hatch, which renders last, so an operator who needs upstream's behaviour states that intent explicitly.

#### Scenario: the published development key cannot be selected silently

- **WHEN** the relay is enabled and its identity key is absent from the environment
- **THEN** the relay refuses to start rather than falling back to the published development key, because the module has already forced auth-token enforcement on

#### Scenario: the departure from upstream is recorded rather than discovered

- **WHEN** a reader asks why this module's auth-token default differs from upstream's
- **THEN** the change records it as a deliberate security decision, naming the published development key that upstream's default selects

### Requirement: The object-store finding and the enable path's prerequisites are recorded by this change

This change SHALL record the object-storage verification as a decision with its citations intact, establishing that Cloudflare R2 fails both the startup conformance probe and the steady-state push path, that the probe's off-switch converts a loud startup failure into a silent correctness hazard, that lowering the probe's race width risks a false pass which is worse than failing, and that Garage single-node is recommended with MinIO as the known-good fallback because upstream verifies against MinIO.
This change SHALL record honestly that Garage's conditional-PUT compare-and-swap conformance was not documentation-verified in this pass and that the startup probe is the cheap adjudicator of the question.
This change SHALL record the three corrections the verification made to the prior working note's claims: that the note missed the documented probe off-switch, that it asserted the rate-limit mechanism without checking the S3 client layer's retry behaviour, and that it overstated the backend's consistency weakness when the documented gap is silence on compare-and-swap atomicity rather than weak consistency.
This change SHALL state the enable path's unmet prerequisites explicitly — an object store that passes the probe, Redis as a new daemon class on this fleet, and a backup story that does not exist fleet-wide — so that the later go/no-go change inherits them rather than rediscovering them.

#### Scenario: the later change inherits the prerequisites rather than rediscovering them

- **WHEN** the later go/no-go change reads this change's artifacts to determine what enabling the relay requires
- **THEN** it finds the object store, Redis, and backup prerequisites stated explicitly, together with the ordered enable path and the tenant-hostname consequence

#### Scenario: the object-storage verdict is auditable in both directions

- **WHEN** a reader checks the object-storage decision
- **THEN** it carries the probe's concurrency shape, the documented per-key write limit and its 429 response, the classifier's absent 429 arm, the steady-state push consequence, the recommendation, and the explicitly flagged thinness of the Garage claim

#### Scenario: the prior note's superseded claims are corrected rather than left standing

- **WHEN** a reader arrives at the object-storage question through the earlier working note
- **THEN** the note carries a dated addendum recording that the gate has been settled at source, the three corrections to its own claims, and that its instruction to enable the relay is superseded by the ship-disabled decision
