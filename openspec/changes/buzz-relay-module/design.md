## Context

The Buzz relay is the server half of the Buzz communications platform, whose client half this fleet already packages and consumes.
A 2026-08-04 working note (`docs/notes/development/buzz/self-hosting.md`) assembled a synthesis and a refutation into a single record and left the object-storage question as the gate on everything else.
The binding human decision of 2026-08-19 (`decision-deploy-scope`) fixed the scope of this change: land the packaging derivation, the NixOS module, and the full OpenSpec change reviewed and buildable, with the module's `enable` defaulting to false and magnetite NOT enabled, and keep the operational go/no-go as a separate later change.

Confirmed facts, verified at upstream `6e5c462ac524de60d7edb46c66130fd779cc9006` (tag `relay-v0.2.1`, committed 2026-08-08), load-bearing and not open questions:

- The relay hard-requires an S3-compatible object store.
  Media storage initialisation is fatal at startup (`main.rs:444-448`: `config.media.validate()` then `MediaStorage::new`, both `?`-propagating) and no feature flag disables media.
- The git object store additionally runs a four-phase conformance probe at boot (`main.rs:496-521`), default on, which races 32 concurrent conditional PUTs against a *single* key per phase (`store.rs:591`/`644` phase 2; `store.rs:731`/`738` phase 3) dispatched via `join_all`.
  A failing probe propagates with `?` and the relay refuses to start.
- Redis is a hard runtime requirement (`config.rs:515`), not an optional cache.
  This fleet has never run Redis as a daemon class: there is no precedent, no hardening baseline, and no backup story for it here.
- There is no backup system on this fleet at all.
  magnetite has local ZFS snapshots and explicitly no off-site replication, while the relay's Postgres would hold community, membership, and signed-auth history.
- The Host derived from `RELAY_URL` is the durable tenant key.
  It is persisted as `communities.host` in Postgres and signed into every NIP-42 and NIP-98 auth event, so it cannot be renamed later without orphaning the community row and invalidating the signed history against it.
- The relay releases on its own `relay-v*` tag line with its own crate version, explicitly not inheriting the workspace version (`crates/buzz-relay/Cargo.toml`), while the client packages this fleet already ships track `desktop-v*`.
- The relay exposes no `*_FILE` configuration variant anywhere, so every secret must arrive as a `KEY=value` line through `EnvironmentFile`.
- `web/` and `admin-web/` are TypeScript sources, not prebuilt assets: 65 and 14 files respectively, both Vite/React apps whose `build` script is `tsc && vite build`, with a 7118-line `pnpm-lock.yaml` and two pnpm patches.

This design covers the disabled landing only.
The operational go/no-go — standing up the object store, introducing Redis, establishing backups, choosing the tenant hostname, opening the vhost — is a separate later change that inherits the prerequisites stated here.

## Goals / Non-Goals

**Goals:**

Deliver two package derivations for the relay on a `relay-v*` source pin held separate from the shared `desktop-v*` pin, so a server upgrade is not coupled to a client upgrade.
Deliver a `flake.modules.nixos.buzz-relay` module whose full configuration surface and credential slots are reviewable, and which is inert because `enable` defaults to false and is set on no host.
Import that module on magnetite without enabling it, so the module stays inside the evaluated configuration and cannot silently rot, while the live host is unchanged.
Settle the object-storage question at the source with citations, in both directions, and record the finding as the input to the later go/no-go change.
State the enable path's three unmet prerequisites explicitly, so the later change inherits them rather than rediscovering them.
Assert at evaluation time on every option whose absence or wrong value would be silently wrong at runtime rather than loudly wrong at startup.

**Non-Goals (out of scope):**

Do not build or provision an object store, in any implementation, in this change.
Do not provision PostgreSQL or Redis on magnetite; model all three backing services as dependencies and options only.
Do not implement backups; carry the prerequisite explicitly instead.
Do not spend a vhost, a DNS record, or a tenant hostname, because those are the irreversible naming choices reserved for the change that turns the relay on.
Do not enable the relay on any host, and do not set `services.buzz-relay.enable = true` anywhere.
Do not package the `web` and `admin-web` bundles, which would add a second JavaScript dependency closure and a second hash-churn surface to every version bump.

## Decisions

### D1: the object store question is settled at source, and R2 fails on both the startup probe and steady state

The binding decision required R2 fitness to be established at the source rather than inherited from the 2026-08-04 note as a premise, and named the finding as one of the more valuable things this change can produce.
It was verified against upstream `6e5c462` and against live Cloudflare documentation fetched on 2026-08-19.

**Verdict: R2 fails, and it fails twice over.**

**(i) It fails the startup probe, deterministically, at defaults.**
The probe fires 32 concurrent conditional PUTs at *one* key per race phase (`store.rs:591` and `644` for phase 2's `If-Match` race on `probe/pointer-<nonce>`; `store.rs:731` and `738` for phase 3's `If-None-Match: *` race on one content-addressed key), dispatched simultaneously via `futures_util::future::join_all` (`store.rs:649`, `742`).
At defaults that is 3 rounds × 32 racers × 2 race phases = **192** concurrent single-key conditional PUTs per boot.
R2 documents, verbatim: "Maximum concurrent writes to the same object name (key) | 1 per second", with footnote 5 stating "Concurrent writes to the same object name (key) at a higher rate return HTTP 429 (rate limited) responses" (<https://developers.cloudflare.com/r2/platform/limits/>).
A second Cloudflare page corroborates it: error code 10058 `TooManyRequests` 429, "Rate limit exceeded. Often caused by multiple concurrent requests to the same object key (limit: 1 write/second per key)" (<https://developers.cloudflare.com/r2/api/error-codes/>).
The relay's classifier has no 429 arm: `classify_cas` maps only `HttpFailWithBody(412, _)` to `LostRace` (`store.rs:546`), the transport-drop escape hatch matches only `S3Error::Reqwest | Http | Io`, and a 429 therefore falls to the catch-all at `store.rs:686` in phase 2 and `store.rs:781` in phase 3, producing `ProbeFailure` and a `?` at `main.rs:521` that refuses the boot.

**(ii) It is unsafe in steady state, and this is the disqualifying finding, because it survives disabling the probe.**
The pointer key is the *sole* writer-serialization primitive for a repository: `cas_publish.rs:61-63` states outright that there is no advisory lock and that writer serialization is the CAS, and that adding a per-repo mutex would hide the exact contention the design's `Inv_NoFork` proves safe.
Every push to a repository writes that same pointer key, so two pushes within one second earn a 429 by the citation above.
`classify_cas` is shared by probe and production and turns a 429 into `StoreError::Backend` rather than `Conflict`, and `finalize_push` maps only `Conflict` to a 409 while routing everything else to the catch-all `(StatusCode::INTERNAL_SERVER_ERROR, "git error")` (`transport.rs:851`ff).
The net effect is that concurrent pushes to one repository return an opaque 500 instead of the `409 non-fast-forward` that tells the client's git to pull and rebase, intermittently and load-dependently.

**The off-switch exists, and using it is worse than the failure it hides.**
`BUZZ_GIT_CONFORMANCE_PROBE=false` skips the probe entirely (`main.rs:496-499`, default on, any value other than the exact string `"false"` leaves it on), and upstream uses it themselves at `crates/buzz-test-client/tests/nip42_host_binding_live.rs:15`.
Disabling removes only the *admission check*, never the *dependency*, so on R2 it converts a loud startup failure into the silent, load-dependent 500 described above.
That is a correctness hazard rather than an inconvenience, and it is the strictly worse failure mode.

**Lowering the race width risks a false pass, which is worse than failing.**
The minimum is 2 (`store.rs:578`), and two concurrent writes to one key is already twice the documented ceiling.
At width 2 the probe becomes a coin-flip that may pass when the two writes happen to straddle a second boundary, producing a *false admission* that hides the steady-state defect underneath.
`BUZZ_GIT_PROBE_WRITERS=2` is therefore not a workaround and recommending it would be harmful.

**Recommendation: Garage, single-node, on magnetite, with MinIO as the known-good fallback.**
The binding requirement is narrow and unusually demanding: `PutObject` honouring `If-Match`/`If-None-Match` with linearizable CAS, returning 412 on loss and an `ETag` on the winning response that chains into the next `If-Match`.
Multipart, checksums, and listing are never exercised by the probe.
Garage is preferred on fleet fit: roughly 100–200 MB RSS against seven co-tenant services on a host with a documented 2026-06-10 disk-starvation incident and a 250 GiB `/nix` quota, plain-file storage that backs up by `zfs snapshot` and `zfs send` with no cluster-aware dance, and real nixpkgs packaging (`pkgs.garage`, `services.garage`).
Ceph is disqualified on that same incident (multi-daemon cluster, GBs of RAM, wants raw devices) and SeaweedFS on the requirement that matters, since documented conditional-PUT CAS could not be established for it.

**Recorded honestly: Garage's conditional-PUT CAS was not doc-verified in this pass.**
That claim rests on prior knowledge and is the thinnest evidence in the finding; Garage's documentation was not fetched.
Upstream has empirically verified **MinIO**, not Garage (`store.rs:14-15`, `store.rs:1174-1188`), which makes MinIO the lowest-conformance-risk choice and a defensible answer if the operator's priority is certainty.
Since the probe *is* the decision procedure and is cheap to run, the recommendation is to stand up Garage, point the relay at it, and let the probe adjudicate, falling back to MinIO if it fails.
The probe, not this document, is the final authority.

**This verification corrected three claims of the 2026-08-04 spike.**

1. **It missed the off-switch.**
   The note judged correctly that disabling the probe hides the problem rather than fixing it, but it never named `BUZZ_GIT_CONFORMANCE_PROBE`, so an operator reading it would not know the flag exists.
2. **It asserted the 429 mechanism without checking the client layer.**
   The client is `rust-s3` v0.37.2, not `aws-sdk-s3`, built with `fail-on-err` (`crates/buzz-relay/Cargo.toml:65`), so every non-2xx becomes `Err(HttpFailWithBody(..))` (`tokio_backend.rs:111-117`), and PUTs *are* wrapped in a `retry!` macro (`tokio_backend.rs:171`, `bucket.rs:2348-2363`).
   The retry does not rescue R2 for three reasons: the budget is exactly 1 because `RETRIES` defaults to `AtomicU8::new(1)` (`lib.rs:38`) and `set_retries` is never called anywhere in the buzz workspace; the retry is status-blind, matching `Err(e)` with no inspection; and it retries 412 too, so every losing CAS racer wastes a second and issues a duplicate write on *every* backend.
   One 1-second retry cannot absorb 32 writers against a 1-write/sec ceiling, so the verdict stands — but the note reached it without checking.
3. **It overstated R2's consistency weakness.**
   The note framed R2 as last-write-wins and implied weak consistency.
   R2 in fact documents itself as "strongly consistent", with read-after-write "Strongly consistent: readers will immediately see the latest object globally" and object listing "Strongly consistent" (<https://developers.cloudflare.com/r2/reference/consistency/>).
   The last-write-wins line is real but describes *unconditional* concurrent PUTs, which is S3's own behaviour and not in itself a defect.
   R2 would likely *pass* the probe's phases 1, 3, and 4 on consistency grounds.
   The real gap is **silence on CAS atomicity, not documented weakness**: Cloudflare's error-codes page links to a `#conditional-operations-in-putobject` anchor that does not exist on the extensions page, and the only atomicity language there is a disclaimer about `cf-copy-destination-if-*` not being atomic relative to `x-amz-copy-source-if-*`.
   Cloudflare is willing to call out non-atomicity where it applies, which makes the silence on PutObject-CAS a genuine gap rather than a charitable oversight.
   The corrected reading is that **R2 fails on throttling, and separately lacks a documented CAS-atomicity guarantee** — it is not "eventually consistent" in the way the note's framing suggested.

Nothing relevant changed upstream or at Cloudflare since 2026-08-04: `store.rs` is byte-identical to its only prior commit (2026-08-03), and a grep for rate-limit, 429, conditional-write, and consistency terms across the full R2 changelog returns zero matches after that date.

### D2: the module ships disabled, and the three unmet prerequisites are named as the enable path's inheritance

`services.buzz-relay.enable` is `mkEnableOption` defaulting to false, every unit, firewall opening and generator sits inside `lib.mkIf cfg.enable`, and no host sets it.
The binding decision is the proximate reason, but the substantive reason is that three operational prerequisites are unmet, and each is its own change.

1. **Object storage.**
   The relay hard-requires an S3-compatible store, media storage initialisation is fatal at startup with no flag to disable media, and the git store's boot probe raises the bar above "speaks S3" to "passes the conformance probe" (D1).
   Which bucket, on which provider, is undecided, and D1 rules out the provider the decision preferred.
2. **Redis as a new daemon class.**
   Redis is a hard runtime requirement (`config.rs:515`), and this fleet has never run it: no precedent, no hardening baseline, no backup story.
   Adopting a new daemon class is a fleet-level decision, not a side effect of enabling a service.
3. **Backups, which do not exist fleet-wide.**
   There is no backup system on this fleet at all — magnetite has local ZFS snapshots and explicitly no off-site replication.
   The relay's Postgres would hold community, membership, and signed-auth history, which is exactly the class of state that must not live on one disk.

Rationale: shipping the surface disabled makes the configuration and the credential slots reviewable before anything is switched on, which is precisely what a change that cannot yet meet its prerequisites should deliver.
Naming the three prerequisites here is a direct requirement of the binding decision, so the later go/no-go change inherits them rather than rediscovering them.
Alternatives considered: enabling on magnetite (rejected — the binding decision forbids it, and all three prerequisites are unmet); provisioning Postgres, Redis and a bucket here (rejected — the binding decision forbids provisioning new daemons in this change, and D1 shows the object-store choice is not settled); not landing the module at all until the prerequisites are met (rejected — the decision explicitly wants the surface reviewed and buildable now, and an unlanded module cannot be reviewed).

### D3: no vhost, no DNS record, and no tenant hostname are spent in this change

This change opens no nginx vhost, adds no Cloudflare DNS record, and chooses no hostname.
`relayUrl` is a typed option with **no default**, required at enable time.

The reason is that the Host derived from `RELAY_URL` is the durable tenant key, not a display name.
The relay derives the deployment community's host from it and seeds it into Postgres as `communities.host`, and that host is then embedded in every signed NIP-42 and NIP-98 auth event.
Changing it later does not rename a deployment; it orphans the existing community row and invalidates the signed history against it.
The binding decision states this consequence directly and reserves the irreversible naming choice for the change that actually turns the relay on, adding that a placeholder must be obviously a placeholder and the option mandatory at enable time rather than defaulted.
There is no placeholder here at all, which is the strongest form of that instruction: `relayUrl` has no default, so an enabled configuration that omits it fails at the option layer.

The scheme is load-bearing too, not cosmetic: it drives the expected-URL reconstruction that both auth schemes verify against, so a TLS-terminated deployment must say `wss://` and an `https://` value fails authentication at *runtime* rather than at parse.
An assertion therefore constrains `relayUrl` to a `ws://` or `wss://` prefix, and a second asserts it is non-empty with the tenant-key immutability spelled out in the message.
Refusing upstream's `ws://localhost:3000` default is part of the same decision: inheriting it would produce a relay that starts, serves, and writes a permanent `localhost` tenant row.

Rationale: the one setting that cannot be corrected later is the one this change most carefully declines to choose.
Alternatives considered: defaulting `relayUrl` to `wss://buzz.scientistexperience.net` (rejected — that is the irreversible choice the decision reserves, and a default is exactly how it would get made by accident); defaulting to an obvious placeholder such as `wss://placeholder.invalid` (rejected — it would satisfy the assertions and let an enabled configuration evaluate, converting a build-time refusal into a runtime tenant-row mistake); opening the vhost now and enabling later (rejected — the vhost's server name *is* the hostname choice).

### D4: a separate `relay-v*` source pin rather than repinning the shared `desktop-v*` source

`pkgs/by-name/buzz/relay-source` is a second, independent pin of the same upstream repository as the existing `pkgs/by-name/buzz/source`.
`source` tracks `desktop-v*` and feeds the desktop and home-side CLI and git helpers; `relay-source` tracks `relay-v*` and feeds the server.

The separation is deliberate rather than incidental.
A single shared pin would couple a server upgrade to a client upgrade: bumping the relay to pick up a server fix would simultaneously move the CLI and the credential helper that the desktop configuration installs on every machine, and bumping the desktop train would silently redeploy the relay.
The binding decision took this recommendation directly, instructing that the shared buzz source the desktop configuration consumes must not be repinned.
The cost is a second `fetchCargoVendor` of the same roughly 1000-package workspace lockfile; the benefit is that the two upgrade decisions stay independent.

Unlike `source`, the relay's `version` is a real crate version rather than a release-train number: `crates/buzz-relay/Cargo.toml` declares `version = "0.2.1"` with an explicit comment that it does not inherit the frozen workspace `0.1.0`, because the relay ships as a pinnable artifact released on its own cadence.
The tag, the derivation attribute, and the crate version therefore all agree, which is not true of the client packages.

One forced deviation is recorded here because it will otherwise look like carelessness.
Upstream publishes **no GitHub Release object for `relay-v*` tags** — `gh api repos/block/buzz/releases/tags/relay-v0.2.1` returns 404, and the full releases listing contains `desktop-v*`, `mobile-v*`, `chart-v*` and bare `v0.x.y` entries but zero `relay-v*` entries.
`source/update.sh` filters the *releases* API, so a verbatim copy with the prefix swapped could never bump the pin and would always take its loud-failure path.
`relay-source/update.sh` therefore reads `GET /repos/block/buzz/git/matching-refs/tags/relay-v` instead, with prerelease exclusion done lexically because a bare tag carries no `draft`/`prerelease` flag, and with an assertion that the ref object is a commit rather than an annotated tag.

Rationale: independent upgrade decisions are worth one duplicated vendor fetch, and the decision explicitly required it.
Alternatives considered: repinning `source` to `relay-v0.2.1` (rejected — couples server and client upgrades in both directions and would move the desktop CLI on every relay fix); a single pin with per-package `rev` overrides (rejected — the vendored dependency set is per-pin, so this is the same duplicate fetch with less clarity).

### D5: the `web` and `admin-web` bundles are deliberately unset, so there is no admin UI and no invite landing page

`BUZZ_WEB_DIR` and `BUZZ_ADMIN_WEB_DIR` are not set by the package and not set by the module.

They are not prebuilt static assets.
At `relay-v0.2.1`, `web/` is 65 files of `.tsx`/`.ts`/config and `admin-web/` is 14, with no `dist/` and no built `index.html`; both are Vite/React apps whose `build` script is `tsc && vite build`.
Upstream's container sets the two variables to `/srv/buzz/web` and `/srv/buzz/admin-web` (`Dockerfile:151-152`), but only after `Dockerfile:117-118` runs `pnpm install --frozen-lockfile` and then `pnpm -C web build && pnpm -C admin-web build`.
Packaging them would mean vendoring a second, JavaScript dependency closure — a 7118-line `pnpm-lock.yaml` plus two pnpm patches — alongside the cargo one, and adding a second hash-churn surface to every version bump.

**The asymmetry is the sharp part and is why "optional" is the wrong word.**
Setting either variable to a directory that lacks `index.html` is a **hard startup failure**: `Config::from_env` returns `ConfigError::InvalidValue` (`config.rs:968-975`, and `:947-955` for the admin path) and the relay refuses to start.
Leaving them **unset** is safe and is upstream's own source-tree default (`TESTING.md:285` lists `BUZZ_WEB_DIR` as "unset (source)"), leaving `web_dir = None` (`config.rs:960-964`) with the relay running normally.
`BUZZ_ADMIN_WEB_DIR` is read only when `BUZZ_ADMIN_HOST` is set (`config.rs:930-942`), so with that host unset the admin surface is absent entirely and the web dir is never consulted.
A wrapper that "helpfully" pointed at a plausible path would therefore convert a working relay into one that cannot boot, which is why unset is the only safe value until the bundles are actually built.

**What that costs, stated plainly:** no read-only admin dashboard, no bundled invite landing page at `/invite/{code}`, and no optional git repository browser (`BUZZ_SERVE_GIT_WEB_GUI`).
**What is unaffected:** the WebSocket relay, the REST surface, git push and pull over HTTP, and NIP-42/NIP-98 authentication.

This gap is recorded as a known gap rather than a defect, and the package's install check pins the semantics it depends on by asserting that a `BUZZ_WEB_DIR` without `index.html` is fatal.
Rationale: the JavaScript closure is a real cost with a real maintenance tail, the relay's core surfaces do not need it, and the failure mode of getting it wrong is a relay that will not start.
Alternatives considered: vendoring the pnpm closure now (rejected — out of scope, and it doubles the hash surface of every bump for a surface nothing yet consumes); setting the variables to a path the module creates empty (rejected — an empty directory has no `index.html`, so this is exactly the hard startup failure); leaving them settable by the operator (the `settings` escape hatch already permits this, with the failure mode documented).

### D6: the typed option surface, a `settings` escape hatch rendered last, and seven assertions

An option is typed if getting it wrong is either unrecoverable or silent; everything else routes through a free-form `settings` attribute set rendered *last*, so it can override any typed value without a module edit.
That is the escape-hatch pattern `modules/nixos/cognee.nix` already uses, and it keeps roughly 90 further environment variables reachable without enumerating them.

`settings` renders booleans as the literal strings `"true"`/`"false"` because the relay has at least five distinct boolean dialects, and those two literals are the only forms all five read identically.

No option in this module names a path to a secret, because secrets arrive from the clan-vars generators themselves (D9).

The seven assertions each guard a failure that would otherwise be silent rather than loud:

- `relayUrl` non-empty, and `relayUrl` matching `ws://` or `wss://` — the tenant-key and expected-URL-reconstruction reasons in D3.
- No public bind: `bindAddress` must be loopback or inside the fleet's ZeroTier `/64`.
  This is load-bearing because magnetite retains `net.ipv6.ip_nonlocal_bind=1`, under which binding an address the host does not hold *succeeds silently* rather than failing at startup.
  The message records that the health and metrics listeners bind `0.0.0.0` unconditionally regardless of `bindAddress`, so the mesh-scoped firewall rule is their only containment.
- `objectStore.endpoint` and `.bucket` both set — upstream's defaults are a live MinIO dev target (`http://localhost:9000`, bucket `buzz-media`) that an unconfigured relay would address without complaint.
  Neither carries a default here, so omitting one fails at the option layer before its assertion is reached; the object store's credentials are not asserted on at all, because they are not an option — the generator supplies them (D9).
- `database.url` non-empty — this module provisions no PostgreSQL, and connecting is fatal at startup with no retry.
- `database.url` must not contain `buzz_dev` — this catches both the published default and the more general hazard that any password written into that option is rendered into the Nix store and is world-readable on the host.
- `redis.url` non-empty — Redis is a hard requirement and this fleet provisions none.
  This option carries no default, so the requirement is genuinely reachable: an enabled configuration that omits it fails at the option layer, rather than silently inheriting a `redis://localhost:6379` that points at a Redis no host on this fleet runs.

Rationale: the module cannot prevent a bad deployment, but it can convert every silent runtime wrongness into a build-time refusal, which is the only leverage a disabled module has.
Alternatives considered: typing all ~106 variables (rejected — unmaintainable, and most are numeric tunables whose wrong values are loud); typing none and using `settings` alone (rejected — the unrecoverable and silent classes are exactly what needs names and assertions); defaulting the object-store and database options to upstream's values (rejected — every one of those defaults is a live dev target that fails late and confusingly rather than early).

### D7: four clan-vars credential slots, named after the service and declared before use

Four generators are declared, all inside the `enable` guard, named `buzz-relay-<subject>` after the *service* rather than the upstream environment variable, because generator names are effectively immutable once minted — renaming one orphans the encrypted material committed under `vars/per-machine/<host>/<generator>/` — and an upstream variable rename must not be able to strand this fleet's sops material.

- `buzz-relay-identity` emits the relay's Nostr secret key.
  Auto-generated because upstream **never generates or persists one**: with the variable unset the relay falls back to a hardcoded, published dev key or panics outright, despite a stale upstream doc comment claiming a fresh keypair is generated at startup.
  The key must be stable across restarts because it signs the events membership mode verifies.
- `buzz-relay-git-hook-hmac` fixes a fail-silent upstream default: with the variable unset the relay mints a fresh random secret on every boot and logs nothing at all about having done so, so every restart silently invalidates outstanding hook signatures.
- `buzz-relay-db-password` follows the `cognee-db-password` dual shape, emitting one value twice — a bare `password` for whatever provisions the role, and an `env` fragment carrying `PGPASSWORD=` for the relay — which keeps the password out of the store-resident `DATABASE_URL` entirely.
- `buzz-relay-object-store` follows the niks3-s3 prompt pattern, because provider-minted credentials are not derivable on the host, and emits a single `env` file because the relay reads both keys only from the process environment.

All four generators' `env` files are wired into the unit's `EnvironmentFile`, so every declared slot is one the relay actually reads (D9).
A generator whose output nothing consumes is worse than no generator, because it still prompts the operator and still commits encrypted material, while the service it was minted for never receives it.

`LoadCredential` is deliberately **not** used, unlike the sso-gateway precedent.
The relay reads no `*_FILE` variant and never consults `CREDENTIALS_DIRECTORY`, so `LoadCredential` would be dead config; `EnvironmentFile` preserves the same DynamicUser-safety property because systemd reads it as root before privilege drop.

Rationale: declaring the credential slots before the service is enabled is the other half of "reviewable surface" — the slots are the part a reviewer most needs to see, and the immutability of their names makes minting them a decision rather than a detail.
Alternatives considered: naming generators after the upstream variables (rejected — an upstream rename would strand sops material behind an immutable name); deferring the generators to the enable change (rejected — the names are the immutable part, so choosing them under review now is strictly better than choosing them under deployment pressure later); delivering secrets by `LoadCredential` (rejected — verified dead config for this binary).

### D8: magnetite imports the module and does not enable it

`modules/machines/nixos/magnetite/default.nix` gains the `buzz-relay` import alongside its neighbours, with a comment recording that `services.buzz-relay.enable` defaults to false and is not set there, and pointing at the module header for the prerequisites that gate switching it on.

Importing without enabling keeps the module inside the evaluated configuration, so it is type-checked, formatted, and dead-code-checked on every evaluation and cannot silently rot between now and the go/no-go change.
Semantic inertness was verified rather than assumed: with the module imported and disabled, the configuration reports `enable = false`, no `buzz-relay` clan-vars generators, no `systemd.services.buzz-relay` unit, and an unchanged ZeroTier-scoped firewall port list.

One investigation is recorded because it would otherwise read as a contradiction.
The magnetite `drvPath` *does* differ between the with-import and without-import evaluations, which would appear to contradict "changes nothing".
It was chased rather than accepted: `nix-diff` showed the only difference in the entire secrets manifest was the `sopsFile` store path for an unrelated age key — that is, `inputs.self`, the whole-flake source hash — with zero occurrences of "buzz" in either derivation, and a control experiment appending a newline to an unrelated docs file with *no module import at all* shifted the `drvPath` identically.
The shift is `inputs.self` source-hashing, which any file addition triggers, and is not attributable to the module.

Rationale: an unimported module is unreviewed and unevaluated, while an imported and disabled one is fully checked and operationally inert, which is exactly the posture this change wants.
Alternatives considered: leaving the module unimported until the enable change (rejected — it would not be evaluated, so nothing would catch it rotting); importing and enabling with a placeholder configuration (rejected — D2 and D3 both forbid it, and the placeholder hostname is the irreversible choice).

### D9: secrets reach the relay from the clan-vars generators themselves, not from an operator-managed file path

The generators' `env` files are wired directly into the unit's `EnvironmentFile`, and the `objectStore.credentialsFile` option is deleted along with any `database.passwordFile` option.
There is no option anywhere in this module that names a path to a secret.

The binding constraint is where secrets are allowed to live on this fleet.
Every secret travels the sops-backed clan-vars lane, encrypted at rest under `vars/per-machine/<host>/<generator>/` and decrypted onto the host at activation, and it must never reach the Nix store or a file committed in this repository.
A hand-managed `credentialsFile` path cannot satisfy that constraint, because the file it names is by definition outside the lane: somebody has to put it there by hand, keep it there, and remember it exists.
So the generator was always the real mechanism and the path option was a second, weaker one standing beside it.

Carrying both was worse than carrying either alone, and this was the shape review found.
`buzz-relay-object-store` prompts the operator for an access key and a secret key, encrypts them, and commits them — and then the unit never read that file, while an assertion separately demanded `objectStore.credentialsFile` be set.
An operator flipping `enable` would therefore be asked for the same credentials twice by two different mechanisms, and the one that looked most like the answer was the inert one.
`buzz-relay-db-password` had the same defect: it minted a password into an `env` file that nothing consumed.
Wiring the generator files in and deleting the options resolves both halves at once — the operator is prompted exactly once per secret, and the relay actually receives what they supplied.

Rationale: a credential path option is not a neutral convenience when a sops-backed lane already exists, because it invites a secret to be managed outside the only mechanism that keeps it encrypted.
Deleting the option removes the duplication, removes the inert prompt, and removes the possibility of the weaker path being chosen.
Alternatives considered: keeping the path options as the real mechanism and deleting the two generators as premature (rejected — it would delete the sops lane and leave a hand-managed plaintext file as the only way to supply a secret, which is the wrong direction on the constraint that actually binds); keeping both and documenting the precedence (rejected — the duplication was itself the defect, and a comment cannot stop an operator from populating the inert one); leaving the generators unconsumed with a comment saying so (rejected — a prompt-bearing generator is not inert at enable time, so this would keep the double prompt).

### D10: `BUZZ_REQUIRE_AUTH_TOKEN` is defaulted to true, departing from upstream

The module sets `BUZZ_REQUIRE_AUTH_TOKEN=true` in its typed environment rather than inheriting upstream's default of false.
This is a deliberate departure from an upstream default, recorded here because departures from upstream defaults should be visible rather than discovered.

The reason is that upstream's default selects a published hardcoded development key.
With `BUZZ_RELAY_PRIVATE_KEY` unset the relay falls back to a dev private key of `0000…0001` when `BUZZ_REQUIRE_AUTH_TOKEN` is false, and panics outright when it is true (`main.rs:419-440`).
Upstream's default therefore fails open: the unsafe configuration is the one that starts.
Defaulting the variable to true inverts that, so the same misconfiguration becomes a loud startup failure instead of a relay signing with a key that anybody can read from a public repository.
The identity generator (D7) supplies a real key, so on the configured path this default costs nothing and changes no behaviour; it only closes the failure mode that appears when the key is missing.

Setting it in `typedEnvironment` rather than asserting on it is the stronger of the two options review offered, because an assertion can only reject a wrong value an operator wrote, whereas a default also covers the operator who wrote nothing.
The `settings` escape hatch still renders last, so an operator who genuinely needs the upstream behaviour can override it explicitly — which is the right shape for a security default: on unless deliberately turned off.

Rationale: a security default that fails open is worth departing from upstream to close, and closing it by default rather than by assertion covers the silent case as well as the wrong-value case.
Alternatives considered: asserting on it instead of defaulting it (rejected — an assertion cannot fire on an operator who never set the variable, which is exactly the case upstream's default makes dangerous); leaving it at upstream's default and documenting the hazard (rejected — the module's whole posture is converting silent runtime wrongness into loud refusal, and this is the clearest instance of it); making it a typed option (rejected — it is a security invariant of this deployment rather than a knob, and `settings` already provides the escape hatch).

## Risks / Trade-offs

[Risk] R2 was the preferred backend and it fails, so the enable path now needs a self-hosted object store the fleet does not have. → Mitigation: the finding is recorded with citations in both directions (D1) and a fleet-fit recommendation is handed to the later go/no-go change rather than a store being built here.

[Risk] Garage's conditional-PUT CAS conformance is documented but was not doc-verified in this pass, making it the thinnest claim in the finding. → Mitigation: recorded honestly as such (D1), with MinIO named as the known-good fallback because upstream verifies against it empirically, and with the cheap startup probe designated as the final adjudicator rather than either document.

[Risk] An operator who reads only the R2 rate-limit line might reach for `BUZZ_GIT_CONFORMANCE_PROBE=false` or `BUZZ_GIT_PROBE_WRITERS=2`. → Mitigation: D1 records that the off-switch converts a loud startup failure into a silent correctness hazard, and that width 2 risks a false pass which is worse than failing.

[Risk] A disabled module is easy to mistake for a working deployment on a later reading. → Mitigation: the module header, the `enable` option description, the magnetite import comment, and this design all state the disabled posture and the three prerequisites, and no host sets `enable`.

[Risk] The tenant hostname is irreversible and a future author might default it for convenience. → Mitigation: `relayUrl` has no default at all and no placeholder, so an enabled configuration that omits it fails at the option layer (D3).

[Risk] A public bind would succeed silently on magnetite under the retained `ip_nonlocal_bind=1`. → Mitigation: the no-public-bind assertion constrains `bindAddress` to loopback or the mesh prefix, and its message records that health and metrics bind `0.0.0.0` regardless so the firewall is their only containment (D6).

[Trade-off] A second source pin duplicates a roughly 1000-package vendor fetch of the same lockfile. → Accepted as the cost of keeping server and client upgrade decisions independent, which the binding decision required (D4).

[Trade-off] No admin UI and no invite landing page ship, because the `web` and `admin-web` bundles are unset. → Accepted rather than vendoring a second JavaScript dependency closure; the alternative of pointing the variables at a directory lacking `index.html` is a hard startup failure, while unset is upstream's own source-tree default (D5).

[Trade-off] Redis would be a new daemon class on this fleet, with no precedent, hardening baseline, or backup story. → Not resolved here; carried explicitly as prerequisite 2 of the enable path (D2).

[Trade-off] The relay has no `*_FILE` variants, so every secret must reach it as a `KEY=value` line through `EnvironmentFile` rather than `LoadCredential`. → Accepted; systemd reads `EnvironmentFile` as root before privilege drop, preserving the DynamicUser-safety property (D7).

[Risk] A declared credential slot that nothing consumes is not inert at enable time: it prompts the operator, commits encrypted material, and still leaves the service without the secret. → Mitigation: every generator's `env` file is wired into the unit's `EnvironmentFile` and no path-to-a-secret option exists beside it, so each secret is asked for once and arrives where it was asked for (D9).

[Trade-off] Forcing `BUZZ_REQUIRE_AUTH_TOKEN` on departs from an upstream default, so a deployment expecting upstream's behaviour will find this one stricter. → Accepted, because upstream's default fails open onto a published development key; the `settings` escape hatch renders last, so the upstream behaviour stays reachable by explicit intent rather than by silence (D10).

## Migration Plan

Land order:

1. Add `pkgs/by-name/buzz/relay-source` pinned to `relay-v0.2.1` with its tag-refs-based `update.sh`, leaving the shared `source` derivation untouched (D4).
2. Add `pkgs/by-name/buzz/relay` building from that pin, with the compiled-in hook shebang rewritten to a store path, the six-tool runtime PATH prefix, and the config-validator install check (D5).
3. Author `modules/nixos/buzz-relay.nix` as `flake.modules.nixos.buzz-relay`: the sixteen typed options, the `settings` escape hatch rendered last, the seven assertions, the four clan-vars generator declarations wired into the unit's `EnvironmentFile`, and the hardened systemd unit, all behind `enable` defaulting to false (D2, D6, D7, D9).
4. Import the module on magnetite without enabling it, and verify semantic inertness at the configuration level rather than by `drvPath` (D8).
5. Record the object-storage finding with citations and its three corrections to the 2026-08-04 note (D1), and append a dated addendum to that note so its readers are not left with the superseded guidance.

There is no deploy step, no `clan vars generate`, and no terranix apply in this change, because nothing is enabled and no secret material is needed by a module that emits no unit.

Rollback: remove the magnetite import, the module file, and the two package directories.
No secret material exists to delete, because the generators are inside the `enable` guard and have never been realised; no DNS record, vhost, or ACME certificate exists to withdraw; no database, bucket, or Redis instance was created.
This is a substantially cheaper rollback than any enabled deployment would offer, which is part of the argument for landing disabled.

Enable path, inherited by the later go/no-go change and stated here so it is not rediscovered:

1. Choose and stand up an object store that passes the relay's conformance probe — Garage single-node recommended, MinIO the known-good fallback — and let the probe adjudicate (D1).
2. Decide whether Redis is accepted as a new daemon class on this fleet, and if so provision it with a hardening baseline and a backup story.
3. Establish a backup story for the relay's PostgreSQL, which requires a fleet-wide backup capability that does not currently exist in any form.
4. Choose the tenant hostname, understanding that it is persisted as `communities.host` and signed into every auth event and is therefore not a free rename, then set `relayUrl` with a `wss://` scheme (D3).
5. Open the nginx vhost and the Cloudflare DNS record for that hostname, correcting the body-size, proxy-timeout, and websocket-upgrade defaults, none of which suit a git transport that pushes large packs over long-lived upgraded connections.
6. Provision the PostgreSQL database, role, and extensions, which this module does not do.
7. Run `clan vars generate` so the four generators emit their material, and populate the object-store prompts with `clan vars set`.
8. Only then set `services.buzz-relay.enable = true`.

## Open Questions

Whether Garage's conditional-PUT CAS actually satisfies the probe's phases 2 and 4 is unresolved by documentation and is answered by running the probe against a real Garage instance, which is the first task of the go/no-go change (D1).

Whether Redis is accepted as a new daemon class on this fleet is a fleet-level decision that this change deliberately does not make (D2).

Whether the conformance probe should remain enabled in steady state, given that it couples relay startup to object-store reachability and spends 192 conditional writes per boot, is deferred until a backend that passes it exists; on is upstream's default and the honest posture (D1).

Which hostname the relay would take, and whether that interacts with retiring Gitea's `git.` name, is reserved for the change that turns the relay on because the choice is irreversible (D3).
