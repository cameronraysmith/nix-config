## 1. Object-storage verification at source (D1)

This section precedes the packaging and module work because the binding decision made it the gate, and because its outcome determines what the enable path must provide.
No object store is built here; the finding is the deliverable.

- [x] 1.1 Identify the exact conformance probe and the exact S3 semantics it depends on, phase by phase, at the pinned upstream revision
  - Four phases at `store.rs:576-883`, entered from `main.rs:496-521`. Phase 1 sequential create-only plus read-after-write; phase 2 `If-Match` race; phase 3 `If-None-Match: *` race; phase 4 ETag-token consistency.
  - Established what the probe does NOT exercise, which narrows the question: no multipart, no `x-amz-checksum-*`, no `ListObjectsV2`. Integrity is application-level SHA-256.
  - `DeleteObject` is used at `store.rs:623`, `733`, `876`, but all three are `let _ =` ignored, so a 403 leaks scratch keys rather than failing the probe. This corrects the prior note's token-scoping claim.
- [x] 1.2 Establish the probe's concurrency shape, which is the decisive fact
  - `race_width` defaults to 32 and is floor-clamped at 2 (`store.rs:114-121`, `578`); `race_rounds` defaults to 3.
  - All concurrency targets ONE key per phase: `store.rs:591`/`644` for phase 2's pointer key, `store.rs:731`/`738` for phase 3's content-addressed key. Dispatch is simultaneous via `join_all` (`649`, `742`).
  - 3 rounds × 32 racers × 2 race phases = 192 concurrent single-key conditional PUTs per boot, correcting the prior note's figure of roughly 96.
- [x] 1.3 Check whether upstream changed the probe, its classifier, its defaults, or the storage layer since the 2026-08-04 note
  - No. `store.rs` has exactly one commit in its history and is byte-identical at the pinned revision; `git diff --stat` against that commit produces no output.
- [x] 1.4 Check R2's current documented support for precisely those semantics, by live fetch rather than recall
  - Per-key write limit still 1/sec returning HTTP 429, now corroborated by a second page (error code 10058) that the prior note did not cite.
  - Conditional `If-Match` and `If-None-Match` on `PutObject` are implemented, and 412 is documented; but the error-codes page links to a `#conditional-operations-in-putobject` section that does not exist, so CAS atomicity is undocumented.
  - No R2 changelog entry after 2026-08-04 touches rate limits, conditional writes, or consistency.
- [x] 1.5 Check the S3 client layer the prior note did not check
  - Client is `rust-s3` v0.37.2 with `fail-on-err`, so every non-2xx becomes `Err(HttpFailWithBody(..))`. PUTs are wrapped in a `retry!` macro, but the budget is 1, the backoff is 1s, and the retry is status-blind — it retries 412 as well, wasting a second per losing racer on every backend.
  - One 1-second retry cannot absorb 32 writers against a 1-write/sec ceiling, so the verdict stands; the prior note simply reached it without checking.
- [x] 1.6 Record the verdict with citations in both directions, including where the prior note was wrong
  - R2 fails twice: deterministically at the startup probe, and in steady state where the pointer key is the sole writer-serialization primitive (`cas_publish.rs:61-63`) so a 429 surfaces as an opaque 500 instead of a `409 non-fast-forward` (`transport.rs:851`ff).
  - Recorded that `BUZZ_GIT_CONFORMANCE_PROBE=false` exists and that using it converts a loud startup failure into a silent correctness hazard, and that `BUZZ_GIT_PROBE_WRITERS=2` risks a false pass which is worse than failing.
  - Three corrections to the prior note recorded as such: the missed off-switch, the unchecked client layer, and the overstated consistency weakness where the real gap is silence on CAS atomicity.
- [x] 1.7 Write the self-hosted recommendation reasoning about fleet fit rather than features in the abstract
  - Garage single-node on magnetite, on RSS footprint against seven co-tenant services and a documented disk-starvation incident, plain-file storage that backs up by ZFS snapshot and send, and real nixpkgs packaging. Ceph disqualified on footprint, SeaweedFS on unestablished conditional-PUT CAS.
  - Recorded honestly that Garage's conditional-PUT CAS was not doc-verified in this pass and is the thinnest claim, that upstream verifies empirically against MinIO which is therefore the known-good fallback, and that the probe itself is the cheap final adjudicator.

## 2. Independent relay source pin (D4)

- [x] 2.1 Add `pkgs/by-name/buzz/relay-source/package.nix` pinned to the newest non-prerelease `relay-v*` tag, with `passthru.cargoDeps` vendored for that pin
  - Pinned `relay-v0.2.1` at `6e5c462ac524de60d7edb46c66130fd779cc9006` (2026-08-08), version attribute `0.2.1`.
  - The header records that unlike the shared `source` derivation, `version` here is a real crate version rather than a release-train number, because the relay crate declares its version explicitly and does not inherit the frozen workspace version.
- [x] 2.2 Leave the shared `pkgs/by-name/buzz/source` derivation and the four client packages built from it untouched
  - Verified: `nix build .#buzz-source .#buzz-cli` still succeeds unchanged, and no file under the four existing buzz package directories was modified.
- [x] 2.3 Add `pkgs/by-name/buzz/relay-source/update.sh` modelled on its sibling, deviating only where the sibling's mechanism cannot work
  - DEVIATION, forced: upstream publishes no GitHub Release object for `relay-v*` tags, so the sibling's releases-API filter could never bump the pin. The script reads the tag-refs API instead, with the reason documented in its header.
  - Prerelease exclusion is lexical because a bare tag carries no `draft`/`prerelease` flag, and the rev extraction asserts the ref object is a commit so a future annotated tag fails loudly instead of recording a tag-object sha.
  - Verified live end to end: the filter yields the three relay tags, selects the newest, resolves the pinned rev, and a re-run exits 0 with no diff.

## 3. Relay package derivation (D5)

- [x] 3.1 Add `pkgs/by-name/buzz/relay/package.nix` building the relay binary from the relay-source pin
  - Inherits `version` and `cargoDeps` from the pin so a bump moves both together; `cargoBuildFlags` names the binary explicitly so an upstream second binary changes the install set visibly.
- [x] 3.2 Rewrite the compiled-in pre-receive hook shebang to a store path, asserting the substitution rather than assuming it
  - Done in `postPatch` with `--replace-fail`, because the hook is a compiled-in string constant with no file on disk at build time and plain substitution does not fail on an absent pattern.
  - Verified in the built artifact: the wrapped binary contains a store-path bash shebang and zero occurrences of `/usr/bin/env bash`.
- [x] 3.3 Wrap the binary with the runtime PATH prefix the fail-closed hook and the git transport both need
  - The hook is fail-closed by construction and upstream encodes the same requirement as a compiled-in test asserting its own container installs curl and openssl.
  - The prefix is load-bearing on a second independent path: the relay shells out to a bare `git` in its git transport, so git must be on PATH for fetch and push to work at all.
- [x] 3.4 Leave `BUZZ_WEB_DIR` and `BUZZ_ADMIN_WEB_DIR` unset, with the asymmetry documented
  - Both upstream directories are Vite/React TypeScript sources, not prebuilt assets; packaging them would vendor a 7118-line pnpm lockfile plus two patches as a second hash-churn surface.
  - Unset is upstream's own source-tree default and is safe; setting either to a directory lacking `index.html` is a HARD STARTUP FAILURE. Recorded cost: no admin dashboard, no invite landing page, no git repo browser. Unaffected: relay, REST, git transport, auth.
- [x] 3.5 Add an install check that reaches real relay code without a network or a database
  - DEVIATION, forced: a `--help` probe fails, because the relay registers no argument parser at all and any invocation proceeds to open a database pool and time out.
  - Replaced with a check that drives the configuration validator, which runs before any database work, and asserts both the non-zero exit and the exact message. This pins the very semantics 3.4 relies on.
  - The check also asserts the wrapper contents and the shebang rewrite both positively and negatively, because either failure yields a relay that serves traffic normally and then rejects every git push.
- [x] 3.6 Build on both supported systems and confirm no package-check blacklist entry is needed
  - Builds on aarch64-darwin and on x86_64-linux; aarch64-linux evaluates to a valid derivation path and was not built (builder unreachable, expected).
  - `modules/checks/packages.nix` deliberately unchanged, because both new packages build on darwin. The two new package checks auto-registered and pass.
  - Confirmed empirically that the TLS backend is `aws-lc-sys` via the cmake backend and that `openssl-sys` is never compiled, so native dependencies are cmake only, with no bindgen and no perl.

## 4. NixOS module option surface (D6)

- [x] 4.1 Author `modules/nixos/buzz-relay.nix` as `flake.modules.nixos.buzz-relay` using the plain deferred-module pattern
  - Chosen over a clan service because the relay needs values only visible in `config.*`, which the statically evaluated clan inventory layer cannot see; this matches every other service module on the host.
- [x] 4.2 Type the options whose wrong value is unrecoverable or silent, and route everything else through `settings`
  - Sixteen typed options across three groups: unrecoverable (`relayUrl`, the database identity), silently wrong (bind address and port, the object-store endpoint, bucket, region and addressing style, `redis.url`, `autoMigrate`), and interface contract (health and metrics ports, `adminHost`, `stateDir`, `openFirewall`).
  - No option names a path to a secret, and no option is declared that nothing reads: `database.name` and `database.user` were dropped on review because the relay reads only `DATABASE_URL`, so both were typed, documented, and referenced nowhere.
  - Roughly 90 further variables reach the unit through free-form `settings`, rendered LAST so it can override any typed value without a module edit.
  - `settings` renders booleans as the literal strings `"true"`/`"false"`, because the relay has five distinct boolean dialects and those two literals are the only forms all five read identically.
- [x] 4.3 Give the required options no defaults rather than inheriting upstream's
  - `relayUrl`, `objectStore.endpoint`, `objectStore.bucket`, `database.url`, and `redis.url` have no defaults. Upstream's values for each are a live development target that an unconfigured relay would address without complaint.
  - Verified: enabling with a required option missing fails at the OPTION layer first, reporting the option was accessed but has no value defined.
- [x] 4.4 Default `bindAddress` to loopback rather than upstream's public bind
  - Defaults to `127.0.0.1`, not `0.0.0.0`, with IPv6 literals bracketed automatically when the bind target is assembled.
- [x] 4.5 Force `BUZZ_REQUIRE_AUTH_TOKEN` on rather than inheriting upstream's default of false (D10)
  - Upstream's default is what selects the published hardcoded dev private key when no identity key is supplied, so it fails open: the configuration that starts is the unsafe one.
  - Set in the rendered environment rather than asserted on, because an assertion cannot fire on an operator who never wrote the variable, which is exactly the dangerous case. `settings` renders last, so the upstream behaviour remains reachable by explicit intent.

## 5. Assertions that convert silent runtime wrongness into build-time refusal (D3, D6)

- [x] 5.1 Assert `relayUrl` is non-empty, with the durable-tenant-key consequence in the message
  - The message states that the Host derived from it is persisted as `communities.host` and signed into every auth event, so it cannot be changed later without orphaning that community and invalidating its signed history.
- [x] 5.2 Assert `relayUrl` carries a `ws://` or `wss://` scheme
  - The scheme drives the expected-URL reconstruction both auth schemes verify against, so a wrong scheme fails authentication at runtime rather than at parse.
- [x] 5.3 Assert the no-public-bind invariant, admitting only loopback or the fleet's ZeroTier prefix
  - Load-bearing because the host retains `ip_nonlocal_bind=1`, under which binding an address the host does not hold succeeds SILENTLY instead of failing at startup.
  - The message records that the health and metrics listeners bind `0.0.0.0` unconditionally regardless of this option, so the mesh-scoped firewall rule is their only containment.
- [x] 5.4 Assert the object-store endpoint and bucket are both set
  - Both have no default, so omitting one fails at the option layer before the assertion is reached; the assertion covers the empty-string case that a default would not.
  - No assertion demands a credentials file, because there is no such option: the object-store credentials arrive from their generator through `EnvironmentFile`.
- [x] 5.5 Assert `database.url` is non-empty and does not contain the published dev password
  - The dev-password assertion catches both upstream's default and the more general hazard that any password written into that option is rendered world-readable into the Nix store.
- [x] 5.6 Assert `redis.url` is non-empty, stating that this fleet provisions no Redis
  - The option carries no default. It briefly did, and that made the assertion unreachable on every documented path while pointing an unconfigured relay at a `redis://localhost:6379` that no host here serves; removing the default makes the requirement fail at eval instead.
- [x] 5.7 Confirm the assertions actually fire together on a wrong configuration
  - Verified: an enabled configuration with a bad scheme, a public bind, and a dev password in the database URL fires each of the corresponding assertions with its full message.

## 6. Credential slots declared before enablement (D7)

- [x] 6.1 Declare the four clan-vars generators inside the `enable` guard, named after the service rather than the upstream variables
  - Generator names are effectively immutable once minted, because renaming one orphans the encrypted material committed for that host; naming them after the service means an upstream variable rename cannot strand this fleet's material.
- [x] 6.2 Declare the relay identity generator, because upstream never generates or persists one
  - With the variable unset the relay falls back to a hardcoded published dev key, or panics outright when auth tokens are required. Upstream's own doc comment claiming a fresh keypair is generated at startup is stale, and the code behaviour was encoded rather than the comment.
  - The key must be stable across restarts because it signs the events membership mode verifies.
- [x] 6.3 Declare the git hook HMAC generator, fixing a fail-silent upstream default
  - With the variable unset the relay mints a fresh secret on every boot and logs NOTHING about having done so, unlike the identity key which at least warns, so every restart silently invalidates outstanding hook signatures.
- [x] 6.4 Declare the database password generator in the established dual shape
  - One generated value emitted twice: a bare password for whatever provisions the role, and an env fragment for the relay, which keeps the password out of the store-resident database URL entirely.
- [x] 6.5 Declare the object-store credentials generator in the prompt-and-fail-loudly shape
  - Provider-minted credentials are not derivable on the host, so the generator prompts rather than inventing a value. Emitted as a single env file because the relay reads both keys only from the process environment.
- [x] 6.6 Deliver secrets via `EnvironmentFile` rather than `LoadCredential`, and record why
  - The database password was initially staged through `LoadCredential` and then removed on review: the relay reads no `*_FILE` variant and never consults the credentials directory, so it was dead config.
  - A comment records that `EnvironmentFile` preserves the same DynamicUser-safety property, because systemd reads it as root before privilege drop.
- [x] 6.7 Wire every generator's env file into the unit's `EnvironmentFile` so no declared slot is inert
  - Found on review: the object-store and database-password generators were declared but unconsumed, so enabling would have prompted the operator for S3 credentials, committed them encrypted, and then still failed an assertion demanding the same credentials by a separate file path.
  - Resolved by wiring both generators in and deleting `objectStore.credentialsFile` and the database password-file option, so each secret is prompted for exactly once and actually reaches the relay (D9).
  - The binding constraint is that a secret on this fleet must travel the sops-backed clan-vars lane and never reach the Nix store or a committed file, which a hand-managed path option cannot satisfy.

## 7. Hardened systemd unit, each fact verified before encoding (D6)

- [x] 7.1 Use `Type = "exec"`, verified rather than assumed
  - Verified there is no readiness-notification support anywhere in the upstream workspace, so a notify type was never an option.
- [x] 7.2 Set a stop timeout above the relay's real shutdown budget
  - Verified upstream: a fixed grace period plus a drain timeout that force-exits, giving a 35-second worst case. The configured timeout leaves margin without racing it.
- [x] 7.3 Apply the restart-loop configuration from the prior host incident precedent
  - Justified because database connection failure at start aborts with no retry, so the relay would otherwise exhaust its start limit against a temporarily unavailable dependency.
- [x] 7.4 Put git on the unit's PATH, verified against the relay's actual subprocess use
  - Verified nineteen git subprocess spawns across the relay's git modules at the pinned revision, correcting the prior note's count of roughly sixteen.
- [x] 7.5 Apply the fleet's standard hardening block, dynamic user, state directory, and mesh-scoped firewall
  - The firewall rule is scoped to the mesh interface only and covers the application, health, and metrics ports, because the latter two bind `0.0.0.0` unconditionally.

## 8. magnetite import without enablement (D8)

- [x] 8.1 Import the module on magnetite alongside its neighbours, with a comment recording that it is deliberately not enabled
  - The comment states that `enable` defaults to false and is not set there, and points at the module header for the object-store, Redis, and backup prerequisites that gate switching it on.
- [x] 8.2 Verify the disabled path evaluates and is semantically inert
  - Verified at the configuration level: `enable` false, no buzz generators, no relay unit, and an unchanged mesh firewall port list.
- [x] 8.3 Verify the enabled path evaluates cleanly when given a complete configuration
  - Verified: with the real relay package and every required option supplied, evaluation succeeds with no failed assertions and the unit's `ExecStart` resolves to the packaged binary.
  - Spot-checked that IPv6 bind targets are bracketed, that `settings` overrides typed values because it renders last, and that git is first on the unit's PATH.
- [x] 8.4 Investigate rather than accept the derivation-path shift, which would otherwise contradict inertness
  - The only difference in the entire secrets manifest was the source-path hash of an unrelated key, with zero occurrences of "buzz" in either derivation.
  - Control experiment: appending a newline to an unrelated docs file with NO module import at all shifted the derivation path identically, so the shift is whole-flake source hashing rather than anything attributable to the module.
- [x] 8.5 Confirm `services.buzz-relay.enable = true` appears on no host
  - Confirmed: it is set nowhere in the repository, which is the binding decision's central constraint.

## 9. Formatting and repository checks

- [x] 9.1 Format every new and modified Nix file and confirm re-running is a no-op
- [x] 9.2 Confirm the dead-code check and the shell lint pass on the new files
- [x] 9.3 Confirm the repository's formatting check passes

## 10. Change artifacts and the superseded working note (D1, D2)

- [x] 10.1 Author the OpenSpec change artifacts for `buzz-relay-module` under the repository's schema
  - `proposal.md`, `design.md`, `specs/buzz-relay/spec.md`, `tasks.md`, plus the `verify.md` and `retrospective.md` stubs, matching the artifact set the `sso-gateway` change carries at this stage.
  - Declares a NEW `buzz-relay` capability, because no archived capability covers self-hosted service deployment and the precedent for a service change declaring its own is the cognee endpoint change.
- [x] 10.2 Carry the object-storage finding into `design.md` as a decision with its citations intact
  - Includes the verdict on both axes, the off-switch hazard, the false-pass hazard at reduced race width, the recommendation, the honestly flagged thinness of the Garage claim, and the three corrections to the prior note.
- [x] 10.3 State the enable path's prerequisites explicitly so the later go/no-go change inherits them
  - The three unmet prerequisites are named in the proposal, in the module header, and as a decision in the design, and the design's Migration Plan carries an ordered eight-step enable path ending at setting `enable = true`.
  - That Migration Plan is the single forward pointer, deliberately: this ledger records only work this change completed, so an enable-path step carried here as an unchecked task would block archiving a change that is itself finished.
- [x] 10.4 Append a dated addendum to the existing self-hosting working note, append-only
  - Records that the object-store gate has been settled at source and how, the three corrections to the note's own claims, where the packaging and the disabled module now live, and that the note's own instruction to deploy with the relay enabled is superseded by the ship-disabled decision.
  - Append-only by construction: no existing line of that dated working note was reworded or removed, because its record stands as written.
- [x] 10.5 Validate the change strictly and keep the repository's totals at zero failed
- [x] 10.6 Reconcile the artifacts with the module fixes that landed after adversarial review
  - Review found no blocking defect and four should-fix items; the module was changed for all four and the artifacts were corrected to stay true of what ships.
  - Recorded the credential-path resolution as D9 and the auth-token default as D10, and rewrote every spec scenario that asserted on `credentialsFile`, on the dead `database.name`/`database.user`, or on a defaulted `redis.url`.
