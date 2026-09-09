---
title: Self-hosting a Buzz relay decision spike
status: working-note
date: 2026-08-04
---

# Self-hosting a Buzz relay decision spike

## Provenance, and why the correspondence caveat is load-bearing

This is a research spike conducted 2026-08-04.
It records a decision and the evidence behind it; nothing here has been built or deployed.

Every claim below about relay behavior was read at block/buzz revision `651f6372754e60e3f936b3397040eb0f1e44c9f3`, which carries the tag `desktop-v0.5.4` and corresponds to the installed desktop build.
The relay does not ship on that axis.
`crates/buzz-relay` releases independently at version 0.2.0 under its own `relay-v*` tag namespace.
The correspondence between the code read for this spike and any relay that would actually be deployed is therefore unverified.

This is not a footnote to the analysis; it conditions all of it.
The relay-v0.2.0 changelog entry describes itself as "Multi-tenant Buzz relay: community_id as a server-resolved key (comprehensive rewrite)" (`crates/buzz-relay/CHANGELOG.md`).
The tenancy model, which is the exact subject of this spike, was rewritten between two consecutive relay versions, and the startup gates, config surface, and schema all moved materially inside one minor version.
Deploying commits you to tracking a moving target whose config surface, schema, and startup gates all change under you, rather than to the behavior read here.

Six claims carry most of the analytical weight and should be re-confirmed against the deployed relay before any of this is acted on, ranked by how much the conclusions lean on them:

- the ±15-minute ingest fence (`handlers/ingest.rs:1859-1865`), on which the entire "no client-side migration" conclusion rests
- the conformance probe's existence and its fatality at startup (`main.rs:496-521`), on which the whole object-store analysis rests
- the relay-only kind list (`buzz-core/src/kind.rs:816-826`), which determines what a client can republish
- the imeta local-URL predicate (`handlers/imeta.rs:61-63`), which determines whether media-bearing events are permanently host-bound
- `BUZZ_ADMIN_HOST` authorizing on Host header alone with no principal authentication (`api/admin/auth.rs:16-32`), which determines whether public exposure leaks cross-community moderation reports to anyone who can set a header
- `BUZZ_GIT_HOOK_HMAC_SECRET` silently auto-generating when unset (`config.rs:799-804`), a fail-silent default

One NIP-11 fetch settles the first two and identifies which version you would be pinning: `curl -s https://cameron.communities.buzz.xyz/ -H 'Accept: application/nostr+json' | jq`.
Publishing one event with a `created_at` twenty minutes old and reading the OK/false message settles the fence directly.

## Verdict

The spike produced two verdicts, and the adversarial pass overturns the synthesis pass.

The synthesis concluded that self-hosting is feasible and architecturally consistent with the fleet, at a realistic band of two to three weeks of focused work, front-loaded on one binary gate (does Cloudflare R2 pass the relay's startup conformance probe) and one prerequisite the fleet does not have (backups).

The refutation concluded that the R2 gate is already lost on published Cloudflare documentation, that every effort estimate in the spike is optimistic in the same direction, that nobody costed the ongoing operational burden, and that two materially cheaper options dominate the plan and were never argued for.

Where the two conflict, the refutation wins, and it wins on the central question.
The recommended position is to not self-host the relay now.
Self-host the forge already running, mirror the Buzz-hosted repositories to it on a timer, and remain a chat tenant on Block's relay.
That position is revisable: the mirroring makes the decision reversible rather than urgent, which is its main value.

## Decision gates

Five gates settle most of this, and the three that are direct observations cost under an hour combined.

Gate 0, roughly ten minutes and no nix, no build, no deploy.
On any machine holding R2 credentials, run twenty `aws s3api put-object --if-match <etag>` calls against one key in parallel and count the status codes.
If any return 429, the relay's default conformance probe fails and the relay does not start.
Do this before anything else.

Gate 1, one command, settles the entire CI question.
From a shell as the buildbot user with the credential helper configured, run `git ls-remote https://cameron.communities.buzz.xyz/git/<owner>/<repo>.git`.
If NIP-98 authentication over HTTPS does not work from that context, buildbot cannot consume Buzz-hosted repositories at all.

Gate 2, one command, may collapse the problem entirely: `curl -s https://git.scientistexperience.net/api/v1/repos/search | jq '.data | length'`.
If the answer is near zero, this is a decision to stop deploying Gitea rather than to migrate off it, and the whole plan gets cheaper.

Gate 3 is a precondition rather than an observation.
Backups must exist before any stateful Buzz service is stood up, and this is not negotiable.

Gate 4 is a question for Block: will they provide a community-scoped Postgres dump plus the corresponding S3 objects.
A yes makes a true migration mechanically supported; a no changes nothing else in this document.

## The R2 conformance gate

The synthesis treated R2 fitness as genuinely unknown and framed it as a cheap, binary, loud-failing gate to be settled empirically in minutes.
The refutation overturns that framing: R2 is documented incompatible with the probe as designed, and the incompatibility is not confined to the probe.
The refutation wins, and this is the single largest change between the two passes.

The relay ships the decision procedure itself: a four-phase conformance probe (sequential semantics, a 32-way `If-Match` race, a 32-way `If-None-Match: *` race, and ETag-token consistency) runs by default at startup and propagates failure with `?`, so failure is fatal.
The synthesis cited this at `crates/buzz-relay/src/main.rs:496-527` and the refutation at `crates/buzz-relay/src/main.rs:496-521`; the range differs slightly between the two readings of the same construct.
Upstream names MinIO, AWS S3, Ceph RGW, and Railway as targets and makes no R2 claim anywhere in `crates/`, `docs/`, or `deploy/`.

Cloudflare publishes a limit that contradicts the probe's design directly.
The R2 limits page gives "Maximum concurrent writes to the same object name (key): 1 per second", with footnote 5 stating that concurrent writes to the same key above that rate return HTTP 429 (https://developers.cloudflare.com/r2/platform/limits/).
The probe fires `race_width` concurrent conditional PUTs against a single key, defaulting to 32, for three rounds, twice: phase 2's `if_match_race` on `probe/pointer-<nonce>` and phase 3's `if_none_match_race` on one content-addressed key.

The classifier has no 429 arm.
In phase 2 the transport-drop escape hatch matches only `S3Error::Reqwest | Http | Io` (`651f637:crates/buzz-relay/src/api/git/store.rs:678`), so an `HttpFailWithBody(429, _)` falls to the catch-all at `store.rs:687` and returns `ProbeFailure`.
In phase 3 a 429 hits `Ok(code) => return Err(ProbeFailure { reason: "unexpected status {code}" })` at `store.rs:762`.
Either path refuses to boot.
Lowering the race width is not a workaround: `store.rs:579` rejects `race_width < 2`, and two concurrent writes to one key is already above the documented ceiling, so `BUZZ_GIT_PROBE_WRITERS=2` makes the situation marginal rather than safe.

Disabling the probe hides the problem rather than fixing it, and this is the part the synthesis did not reach.
The pointer key is the sole writer-serialization primitive per repository; `cas_publish.rs:56-59` states that there is no advisory lock and that writer serialization is the CAS.
`classify_cas` at `store.rs:521-546` maps only 412 to `LostRace` and turns everything else into `StoreError::Backend`.
The synthesis cited the same code as a risk (`store.rs:546` for the 412 mapping, `store.rs:527-544` for treating a missing ETag on the conditional PUT as non-conforming) and characterized it as three specific ways R2 could fail.
`finalize_push` in `transport.rs` maps `Conflict` to a 409 with "pull and retry" but routes every other error to the catch-all at approximately `transport.rs:1806`, which returns `(StatusCode::INTERNAL_SERVER_ERROR, "git backend error")`.
On R2, two pushes to the same repository inside one second therefore produce a 500 rather than a 409, and the client's git receives no signal to pull and retry.
That failure is intermittent and load-dependent, which is the worst shape for a correctness-adjacent defect.

Three further R2 hazards surfaced only in the refutation.
The probe requires `DeleteObject` (`store.rs:623`, `store.rs:733`, `store.rs:876`), so the earlier token-scope guidance of Put/Get/Head/List is wrong and would fail the probe on permissions alone.
The probe permanently pollutes the production `packs/` namespace: phase 1 writes three `packs/<sha256>` objects per boot through `put_pack` at `store.rs:599`, and `store.rs:874` states outright that immutable probe writes accumulate by design and that the bucket's retention policy handles them rather than the probe, while no retention policy exists in the plan.
Nothing ever deletes packs or manifests: `git grep delete_object` over `crates/` at `651f637` returns only media storage and the probe's own scratch keys, and `docs/git-on-object-storage.md` calls physical pruning future GC work outside the safety argument, so storage grows monotonically and any GC written later must not break Theorem 2's reliance on every named pack remaining GETtable.

R2's published consistency model is also weaker than the axiom the design's proof requires.
Cloudflare states that concurrent writes to the same key are resolved by the last writer to complete winning (https://developers.cloudflare.com/r2/reference/consistency/), which is last-write-wins rather than linearizable CAS.
Conditional PUT with 412 does exist on R2, but the interaction between conditional evaluation and the one-per-second throttle is undocumented, and a 429 means the precondition was never evaluated at all.
Axiom A3 as the design states it, that among any set of conditional PUTs predicated on the same `e` at most one succeeds and all PUTs are linearizable, is not established on R2 by anything Cloudflare publishes.

The fallback is MinIO or Garage on the host.
That reintroduces a stateful service with its own backup burden and materially weakens the architectural-fit argument that motivated self-hosting in the first place.
The synthesis's open question about whether to keep the probe enabled in steady state (upstream's default, at a cost of roughly 96 conditional writes per boot and a coupling of relay startup to object-store reachability) is moot until the backend question is resolved.

## The Gitea replacement gap and the capacity inversion

Gitea on magnetite fills three roles, and Buzz covers one of them partially.

As a private forge, Buzz is reasonable.
It provides NIP-34 issues, patches, pull requests and status, role-based branch protection keyed to channel membership, and in-browser repository viewing.
The gaps are HTTP-only transport with no SSH server anywhere in the workspace, which is structural rather than configuration; NIP-98 authentication required even on clone; no git-LFS, where Gitea has `lfs.enable = true`; no mirroring or import; and web browsing that clones client-side through isomorphic-git into IndexedDB rather than rendering server-side.
Implemented branch protection is also narrower than the VISION document advertises: `push:<role>`, `no-force-push`, `no-delete`, and `require-patch`, with no npub allowlist and no approval-count gate in code.

As a CI forge for buildbot-nix, Buzz covers none of it.
There is no outbound repository-event webhook — the only `/hooks/{id}` route is an inbound workflow trigger — and a case-insensitive search across all crates for commit-status or check-run concepts returns nothing, so there is no object for any CI system to report into.
buildbot-nix ships exactly three backends (github, gitea, pull_based) and none is nostr.

The synthesis treated the pull_based backend as a possible bridge whose viability was unproven.
The refutation sharpens this to a specific structural gap.
`PullBasedBacked.create_reporter` returns `NullReporter` and `create_change_hook` returns `None` (`/Users/crs58/ghq/github.com/nix-community/buildbot-nix/buildbot_nix/buildbot_nix/pull_based/backend.py:30-33`).
`PullBasedProject.create_change_source` passes exactly two authentication parameters to `GitPoller`, `sshPrivateKey` and `sshKnownHosts` (`.../pull_based/project.py:53-63`), and `known_hosts_path` returns `None` unconditionally.
There is no HTTP credential plumbing anywhere in that path, and Buzz is HTTP-only with NIP-98 on every route including clone.

Making it work is probably possible and costs far more than the day the spike estimated: a system-level `credential.helper nostr` in both the buildbot master's and the worker's git config, a service nostr key with a `relay_members` row and channel membership on every repository, a global `useHttpPath true`, git 2.46 or newer for both users, and a NIP-98 signature regenerated inside a ±60 second window on every poll.
`GitLocalPrMerge` at `nix_eval.py:830-838` always clones with `--recurse-submodules`, and submodule resolution through that helper is untested.
Even if all of it works, the result is polling instead of webhooks, all branches instead of PR-aware builds, no repository discovery by topic, and no status anywhere except the buildbot UI, which is a strict regression from what `modules/nixos/buildbot.nix:141-148` already provides with Gitea.
Writing a real backend instead means 400 to 800 lines of Python against a twelve-member abstract base class, plus an upstream feature request for a status primitive that does not exist.

As a CD execution environment, Buzz covers nothing.
The two Podman Gitea Actions runners are designated in this repository's own architecture note as the CD environment for private repositories.
Buzz's workflow engine has seven actions — `SendMessage`, `SendDm`, `SetChannelTopic`, `AddReaction`, `CallWebhook`, `RequestApproval`, `Delay` (`crates/buzz-workflow/src/schema.rs:92-147`) — and none of them executes a command.

The capacity consequence is where the refutation overturns the synthesis most cleanly.
The synthesis said capacity gets worse before it gets better.
The refutation says it inverts and stays inverted, and the refutation wins because none of the three retirements that would recover capacity is available.
Gitea and Buzz must coexist through any migration, the Actions runners cannot retire with Gitea, and Buzz adds Postgres tables, a Redis instance that exists nowhere in the fleet (`rg 'services\.(redis|valkey)' modules/` returns nothing, confirmed in this repository on 2026-08-04), roughly 17 GiB of git scratch and pack cache (the synthesis breaks this down as a 5 to 7 GiB pack cache plus about 10 GiB of git scratch), and object-store hydration CPU on every clone.
magnetite is a CX53 on a 304 GiB pool with `/nix` quota'd to 250 GiB after the 2026-06-10 starvation incident.
Buzz's durable-state footprint is genuinely cleaner than Gitea's — the refutation confirms that the relay keeps no authoritative per-repo filesystem state, that the only `delete_object` calls outside the probe are media, that hydration is per-request, and that durable state is Postgres plus the bucket plus one key — while its dependency footprint is strictly larger.

## Backups are a prerequisite

No backup configuration exists anywhere in this repository.
The synthesis reported that `rg -n 'postgresqlBackup|borgbackup|clan\.core\.state' /Users/crs58/projects/vanixiets/modules/` returns zero hits.
The refutation reported that the same search returns "only two unrelated home-package entries".
I re-ran both the escaped and the unescaped forms in this repository on 2026-08-04 and both return zero matches, so the synthesis's reading is the accurate one; the conclusion is identical either way.
clan-infra's analogous host runs `services.postgresqlBackup` plus borg plus `clan.core.state.folders` (`/Users/crs58/ghq/git.clan.lol/clan/clan-infra/modules/web01/gitea/postgresql.nix:9`, `borgbackup.nix:18-22`).

Buzz keeps its entire message, event, membership, and repository-name history in Postgres, applies 26 forward-only sqlx migrations at startup with no down-migrations, and offers no export path of any kind.
`BUZZ_AUTO_MIGRATE=true` means every deploy is a schema migration with no review gate.

The synthesis asserted that a nix generation rollback restores the binary against an already-migrated schema.
The refutation notes that nobody read `buzz-db/src/lib.rs:1012` or `migration.rs:11` to determine what sqlx's `Migrator` actually does when the database is ahead of the binary, and that this single question determines whether a rollback fails loudly or corrupts quietly.
Treat the rollback failure mode as unverified, and settle it before the first upgrade rather than during one.

Backup ordering matters and is cheap to get right.
Snapshot Postgres first, then the bucket: packs and manifests are create-only, so a bucket copy taken after the dump is a superset of what the dump references, while the reverse order can leave Postgres referencing absent objects.
The refutation adds that the bucket half of the backup was never costed at all, and that the bucket grows monotonically because nothing deletes packs or manifests, so a backup strategy for an append-only bucket with no GC is a cost model that nobody has written down.

This work is worth doing for Gitea, kanidm, matrix, and cognee regardless of whether Buzz is ever deployed.

## Identity

Buzz identity is nostr-native and there is no kanidm bridge worth building.
The refutation attacked this conclusion and could not refute it.

Every gate in the relay takes a 32-byte secp256k1 pubkey: NIP-42 WebSocket AUTH, NIP-98 HTTP, NIP-43 membership, NIP-OA delegation, git push policy, and invite mint and claim.
There is no principal shape that is not a pubkey.
`git grep -n -i okta 651f637 -- crates/` returns nothing, and the `users.okta_user_id` column is vestigial.
The relay observes no authentication ceremony, only signatures, so there is no password to centralize, no session to federate, and no server-side MFA to enforce.
kanidm's SCIM surface is real, but its own book states that SCIM is supported only for synchronisation from another IdP, and its CLI schema surface is read-only, so there is nowhere to store an npub mapping.
At four humans the entire provisioning surface is four `buzz-admin add-member` invocations.
The correct posture is to accept that Buzz sits outside the SSO story being built and to say so explicitly now.

Agents need no provisioning.
NIP-OA is a self-proving Schnorr attestation carried in the auth event; the agent-to-owner mapping is written first-write-wins on first authentication, and the agent is admitted through its owner's membership.
Per-human attestation isolates better than attesting everything to crs58, because a ban on an owner cascades to their agents while an agent ban does not cascade up.

Key custody for non-technical family members is better provisioned than expected.
The nsec lives in the OS keyring, and the desktop ships a NIP-49 encrypted-backup flow with a generated wordlist passphrase and decrypt-verification against the live pubkey before the blob is shown.
The instruction for family members is to create the ncryptsec backup, write the passphrase on paper, and keep the `.ncryptsec` file in the password manager.
New-laptop migration goes through NIP-AB device pairing, a `nostrpair://` QR with SAS confirmation, which means a self-hosted deployment probably also wants the separate `buzz-pair-relay` binary.

One unanswered question undercuts the family-adoption story and was never resolved in the spike: whether non-technical family members can point the desktop app at a custom relay at all.
If the answer is an environment variable at launch, self-hosted family adoption does not work in its current form.

Two custody facts should be internalized before starting anything.
The relay keypair is effectively unrotatable — upstream says not to rotate it — because rotation orphans every relay-signed addressable event and invalidates all outstanding v1 invites.
And the owner key is a single point of administrative failure.

On that second point the refutation overturns the synthesis's placement, and it wins.
The synthesis raised owner-key loss inside the identity discussion and left it adjacent to the open questions.
The refutation shows that NIP-IA archival is worse than "transfers nothing": `archived_identities.rs:50-77` is a single INSERT, and the only consent path available for a lost human key is `admin`, which requires a live owner or admin (`handlers/identity_archive.rs:228-250`).
That makes owner-key loss an unrecoverable administrative failure with no in-band remedy, which belongs in the risk register rather than the open questions.
Bootstrap a second admin npub on cold-stored keys at setup time.
A lost key still means re-adding to `relay_members`, re-joining every channel, and the dead pubkey keeps the NIP-05 handle until someone edits Postgres by hand.

Two configuration facts are identity-adjacent and durable.
`BUZZ_ADMIN_HOST` authorizes on exact Host-header match with no principal authentication whatsoever (`crates/buzz-relay/src/api/admin/auth.rs:16-32`), so the admin surface must stay off the public vhost.
And `buzz-nsec` is already declared unguarded at `/Users/crs58/projects/vanixiets/modules/home/users/crs58/default.nix:76`; only the consumer at `:139-152` is wrapped in `lib.optionalAttrs pkgs.stdenv.isDarwin`.

## Migration

Start fresh.
There is no move, and the refutation attacked this verdict without finding a better answer that does not require Block to hand over a Postgres dump.

There is no export path off Block's relay.
Searching for export, backup, dump, import, and restore across `crates/buzz-relay/src` and `crates/buzz-cli/src` returns zero hits, there is no `buzz-admin` export subcommand, and the admin HTTP API is read-only reports and feedback.
`buzz-relay-mesh` is an intra-deployment QUIC mesh between replicas of one runtime rather than federation, and "federation" appears in the tree only as Helm chart prose.
NIP-77 negentropy is absent, so there is no bulk sync primitive.

The client-side approach of issuing a REQ against the old relay and publishing to the new one is structurally dead.
Ingest rejects any event whose `created_at` is more than ±15 minutes from server time (`handlers/ingest.rs:1859-1865`), so verbatim republish is impossible, and re-signing to satisfy the fence changes every event id and dangles every `e`-tag reference.
Six kinds are relay-only and rejected outright on client submission (`buzz-core/src/kind.rs:816-826`): NIP-43 membership lists, channel summaries, presence, DM visibility, thread summaries, and window bounds.
Media URLs are frozen inside signatures — the imeta `url` is absolute and rooted at the old host (`buzz-media/src/upload.rs:550`) while the new relay rejects any imeta URL not local to itself (`handlers/imeta.rs:61-63`).

What is permanently lost, absent a Postgres dump from Block, is all chat messages, DMs, reactions, and thread structure; the six relay-only kinds; the timestamp and reference graph of every NIP-34 issue, patch, pull request, and status event, since those events are client-signed and so reproducible individually but the graph must be rewritten in dependency order with new ids and today's timestamps, yielding a lossy re-enactment; the channel membership rows and roles in `channel_members`, which are relational Postgres state with no admin CLI path since `buzz-admin`'s `AddMember` and `RemoveMember` are relay-level only; and all media URLs in already-signed events.

What is recoverable, but only by acting while tenancy still holds, is the repository contents via `git clone --mirror`; the media bytes, but only if they can be enumerated from imeta `x` tags in still-readable events and only if `BUZZ_REQUIRE_MEDIA_GET_AUTH` is off on the hosted relay; and the list of which repositories exist, which requires reading your own kind:30617 events off the source relay.

Git repositories are the clean exception.
`git clone --mirror` followed by `git push --mirror` moves them with full fidelity, once a kind:30617 announcement exists on the new relay — without it the relay 404s every clone and push.
The refutation adds that each repository needs that announcement created on the target before the mirror push, that repository enumeration must happen while source access holds, and that the credential helper must work against two different relay hosts with two different community bindings.

The new relay also gets a new npub, so every previously relay-signed addressable event (kind:30618 ref state, membership rosters, NIP-IA lists) is orphaned at its old `(pubkey, kind, d)` address.
This is harmless for 30618 because the new relay regenerates it on first push, and it is not harmless if anything downstream indexed those addresses.

Cutover therefore means running both relays in parallel under the same nostr keys, mirroring the repositories, recreating channels and memberships by hand, re-registering agents, and treating the old event log as a read-only archive that renders only while Block serves the host.
Events can optionally be dumped to JSONL through the paginated `/query` bridge for cold archive; those are faithful signed bytes that can never be replayed into a relay.

Total loss of chat history, DMs, reactions, and thread structure has to be an accepted loss before anything is stood up.
The one thing worth doing before building anything is asking Block for a community-scoped Postgres dump plus the corresponding S3 objects.
If they say yes, a true migration is mechanically supported: `migrations/0021_created_at_fence_floor.sql:29-36` documents the breaker-closed backfill path, and `buzz-admin reconcile-channels` exists to repair discovery events after direct-SQL seeding.

## What mulatta/buzz.nix provides, and what it does not

mulatta/buzz.nix is packages-only.
It exports no `nixosModules`, `darwinModules`, or `homeManagerModules`.

What it genuinely provides is build knowledge that would otherwise be bought with a failed deployment, and the refutation confirms both pieces are real and worth copying.
The first is the pre-receive hook shebang rewrite, where `packages/build-buzz-rust/default.nix:83-88` substitutes `#!/usr/bin/env bash` for a store path.
The second is the relay wrapper's runtime environment: `BUZZ_WEB_DIR`, `BUZZ_ADMIN_WEB_DIR`, `SSL_CERT_FILE`, and a PATH prefix of bashNonInteractive, coreutils, curl, gitMinimal, gnused, and openssl (`packages/buzz-relay/package.nix:36-45`).
Both are load-bearing because the relay writes a bash pre-receive hook that shells out to curl and openssl and is fail-closed, so a missing tool blocks every push.

What it does not provide is everything else: no systemd unit, no Postgres or Redis provisioning, no secrets wiring, no nginx, no clan integration.

Its source pin is stuck, and the refutation shows the abandonment is deeper than the synthesis read.
The updater regex fullmatches only `v<semver>` (`packages/source/update.py:25-31`), so it can see neither `desktop-v*` nor `relay-v*` and sits at `v0.5.2` in a namespace upstream abandoned.
Beyond that, `git log --oneline -- packages/source/pin.json` returns exactly one line, meaning the pin has been modified by one commit ever; the daily cron at `.github/workflows/update-buzz-source.yml` has produced zero pin bumps in eight days; the repository does define checks (`flake.nix:57` maps every package to `package-<name>`) but no workflow ever runs them, while `auto-merge.yaml` auto-merges dependabot nixpkgs bumps against no required checks; and `packages/buzz-relay/package.nix:24` labels the relay `0.2.0` from `relayVersion` while building from the `v0.5.2` tree, so the version label and the source are decoupled and could be misreporting.
Treat it as reference material, not as a flake input.

The recommendation is to vendor into `pkgs/by-name/buzz/{source,git-credential-nostr,cli,relay}/`, copying mulatta's builder knowledge deliberately.
Vendoring also drops the rust-overlay dependency, which vanixiets deliberately does not apply globally (nixpkgs rustc is 1.97.0 and the workspace MSRV is 1.88.0).
Pin one `buzz-source` revision per deployment epoch at a `relay-v*` tag and build relay, CLI, and credential helper from it, since there is no client-side version negotiation anywhere in buzz-cli and compatibility is therefore an operator obligation with no upstream contract.

One piece of this is worth doing regardless of whether self-hosting proceeds.
Vendoring `git-credential-nostr` and deleting the Darwin guard is clean: the crate depends only on nostr, serde_json, zeroize, and base64, with no HTTP client and no TLS, and its only platform-conditional code is the keyfile permission check, which has a `cfg(not(unix))` fallback (`crates/git-credential-nostr/src/lib.rs:28-45`), so linux is first-class.
The permission check rejects only group, other, and owner-execute bits (`mode & 0o177 != 0`), so sops-nix's default 0400 passes with no mode change.
The consumer at `modules/home/users/crs58/default.nix:139-152` is Darwin-guarded only because the helper path is `/Applications/Buzz.app/Contents/MacOS/git-credential-nostr`; replacing that with `lib.getExe pkgs.buzz-git-credential-nostr` removes the guard.
The package should wrap `git` onto PATH, since the helper shells out to `git config --get` at runtime and mulatta's package does not do this.

The cost is small in code and non-trivial in build.
The workspace lockfile carries 1034 packages, so even the 1.3 MB credential helper drags the whole vendor fetch, and the `cargoHash` can only be obtained from a deliberately-failing build; amortize with one shared hash across all buzz packages, as mulatta does.
The refutation adds that the hash must be obtained per system, and that adding any by-name package silently adds a `nix flake check` entry on every system (`modules/checks/packages.nix:36-39`), including aarch64-darwin where a linux-only relay will never run, so platform scoping or a blacklist entry must be decided up front.

The CLI is a bigger step and should not be bundled with the above.
Its native build dependencies are not determinable by reading: the lock contains both `aws-lc-sys` (cmake, bindgen) and `openssl-sys`, and reqwest 0.13's `rustls` feature resolution decides which is reached, so only a build answers it.
A nix-built CLI also raises a question the current cask does not, since buzz-cli inherits the frozen workspace version 0.1.0 with no compatibility information, and the darwin cask (`modules/darwin/homebrew.nix:22`) would then ship a second `buzz` binary at a different version — and the cask's copy is the one that mints the NIP-OA auth tag the CLI and helper consume.
The refutation adds that the `block-buzz` cask auto-updates, so pinning a self-hosted relay while the cask advances produces client-server protocol drift with no version negotiation to catch it, arriving on Block's schedule rather than yours.

## If it is built anyway: module and network shape

The refutation could not refute this section of the analysis and calls the module itself small, at 250 to 400 lines of mostly transcription, with the proposed option split correct.

Use the plain deferred-module pattern `flake.modules.nixos.buzz-relay` rather than a clan service.
Every service on magnetite uses that pattern, including the Gitea being replaced, and the clan inventory layer is statically evaluated with no `config.*` visibility, a cost this repository already pays and documents at `modules/clan/inventory/services/hermes-agent.nix:14-20`.
Buzz needs the Postgres socket, the ZeroTier address from `flake.lib.hosts`, and the nginx vhost name, all of which live in `config.*`.

Model roughly 15 load-bearing options as typed options and route the remaining 90 or so environment variables through a free-form `settings` attrs rendered last into the unit environment, which is the escape hatch `modules/nixos/cognee.nix:144-156` already uses.
Use `Type=exec`, a `TimeoutStopSec` above 35 seconds (the relay's shutdown is a 5 second grace plus a 30 second drain then `exit(1)`), and `unitConfig.StartLimitIntervalSec = 0` with `RestartSec = "30s"`, replicating the gitea fix from the 2026-05-22 ENOSPC incident, because Postgres being unavailable at start is fatal with no retry.

Secrets are four clan-vars generators, all near-verbatim reuse of existing patterns.
`BUZZ_RELAY_PRIVATE_KEY` and `BUZZ_GIT_HOOK_HMAC_SECRET` follow niks3's `openssl rand -hex` pattern, the R2 credentials follow niks3-s3's exit-1-then-`clan vars set` pattern, and the Postgres password follows cognee-db-password's dual password-plus-env-file shape with `restartUnits`.
There are no `*_FILE` variants anywhere in the relay's config, so every secret arrives via `EnvironmentFile=` in `KEY=value` shape.
Generator names are effectively immutable once minted, since renaming orphans sops material under `vars/per-machine/`.

Networking is one grey-cloud CNAME copied from the `git` record in `modules/terranix/cloudflare.nix:72-79` plus one nginx vhost.
Three nixpkgs defaults will break it silently: `client_max_body_size` is 10 MB globally against the relay's 500 MB git pack limit; `proxyTimeout` is 60s against upstream's own recommended 3600s for long-lived WebSockets; and `recommendedProxySettings` emits `proxy_set_header "Connection" ""`, which defeats the upgrade unless `proxyWebsockets = true`, the idiom `kanidm.nix:276-278` already uses.
Orange-cloud is wrong here because Cloudflare's proxied request body cap is 100 MB on Free and Pro, which 413s large pushes.
The refutation calls this the most accurate estimate in the spike and confirms the grey-cloud reasoning, with the caveat that the two failure modes that matter, 413 and 504, do not appear at deploy time.

Two settings must be right before first boot and are durable afterward.
`RELAY_URL` must be `wss://<fqdn>`, because its scheme drives NIP-42 and NIP-98 expected-URL reconstruction and the default is `ws://localhost:3000`.
And the Host header is the tenant key: it is stored as `communities.host` and embedded in every signed auth event, so choosing `buzz.scientistexperience.net` now and moving to `git.` after Gitea retires is not a free rename.
Health on 8080 and metrics on 9102 bind `0.0.0.0` unconditionally and are not configurable, so containment is a firewall matter.

## Sequencing, with stopping points

Each phase is a stopping point, and the estimates are the synthesis's own.

Phase 0, hours, no commitment.
Ask Block about a data export and run the R2 check — the refutation's twenty parallel conditional PUTs first, since that costs ten minutes, and the built-relay probe (`BUZZ_GIT_S3_PROBE=1 cargo test -p buzz-relay --lib`, or booting a relay with the probe enabled) only if that passes.
Gate: the probe passes, or MinIO and Garage are accepted.
Stopping here costs half a day.

Phase 1, one to two days, valuable standalone.
Vendor `buzz-source` and `buzz-git-credential-nostr` and delete the Darwin guard on the git config block.
Verification is `nix build` on both platforms, then `printf '' | ./result/bin/git-credential-nostr get` printing nothing and exiting 0 (mulatta's own installCheck, so it is free), then `nix build .#checks.<system>.home-manager-crs58` on aarch64-darwin and x86_64-linux.
Stopping here removes impure `/Applications` paths from the git config on every machine.

Phase 2, one day, prerequisite.
`services.postgresqlBackup` plus an off-host target plus `clan.core.state.folders`, following clan-infra's web01.

Phase 3, one to two days.
Vendor `buzz-cli` and `buzz-relay`, with the gate being whether they build; the aws-lc-sys versus openssl question resolves here.
Stopping here leaves a nix-built CLI that can be pointed at the hosted relay via `BUZZ_RELAY_URL`.

Phase 4, three to five days.
The NixOS module, Redis, Postgres provisioning, secrets, nginx, and DNS, deployed to magnetite at `buzz.scientistexperience.net` alongside Gitea.
Gate: the relay boots, the probe passes against the real bucket, and four humans can connect from the desktop app.

Phase 5, two to three days.
Forge validation before anything migrates: mirror one repository, push, open an issue and a patch, exercise channel-based ACL.
These must be severe tests rather than smoke tests — push a pack above 10 MB and again above 100 MB, and clone a repository whose hydration exceeds 60 seconds — because both nginx failure modes are invisible at deploy time.

Phase 6, open-ended and a separate decision.
Whether to pursue CI integration at all; if the answer is that the buildbot UI is where results are read anyway, most of the Gitea gap collapses and this phase never starts.

The refutation's judgment on these estimates should be carried alongside them.
Every one is optimistic in the same direction, and the systematic omission is that nobody costed the ongoing burden: not one estimate contains an hours-per-month figure or an upgrade-testing cost.
The refutation's own read is to budget several hours a month steady-state and a full day per relay upgrade for a service with a 1576-line config module, a 26-migration forward-only schema, three stateful dependencies, and a tenancy model rewritten between two consecutive relay versions.
Reliability was explicitly declared a non-driver for this project, which means those hours are pure cost against no stated benefit.

## When the answer is no

Five conditions would each independently make the answer no, and on the evidence assembled at least three are already met.

The answer is no if the claim that Buzz replaces Gitea is load-bearing, since it does not replace it, the gap is upstream product surface outside your control, closing it is months with nix-community/buildbot-nix in the critical path, and a goal of reducing services on magnetite is served by adding none.
It is no if backups will not be built first, since zero backup configuration plus 26 forward-only migrations plus no export path plus startup-time migration is a combination where the first bad upgrade is unrecoverable, which is data loss rather than a discounted reliability concern.
It is no if the relay's independent release cadence is unacceptable, since there is no compatibility contract between relay and clients, no version negotiation in buzz-cli, and mulatta's pin cannot even see the relay's tag namespace.
It is no if Redis as a new daemon class on the fleet is a line you do not want to cross; Redis is not startup-fatal, and readiness returns 503 without it and it owns rate limiting, presence, and NIP-98 replay protection, so it is a genuine scope addition that was absent from the original framing.
R2 failing the conformance probe was framed as a reason to reconsider hard, and per the refutation that condition is already met on published documentation rather than pending an experiment.

The refutation goes further and attacks the premise, and this is the part the synthesis never considered.
Sovereignty is already mostly yours: identity keys are user-held today (`modules/home/users/crs58/default.nix:76`).
Self-hosting the relay gets you control of the event store and the git objects, and it does not get you control of the protocol, the desktop client, the schema, the config surface, or the release cadence, all of which remain Block's and are moving fast.
That combination is operational sovereignty over a system in which you hold no architectural sovereignty, so you own the outages while Block owns the design.

Two options dominate on nearly every axis.

Option A is to self-host the forge and stay a chat tenant.
Gitea is already deployed at `modules/nixos/gitea.nix`, already has a first-class buildbot-nix backend with commit status and webhooks (`modules/nixos/buildbot.nix:141-148`), already has SSH transport and LFS, and already has a path to kanidm OIDC that the identity ADR anticipates.
It has no R2 CAS dependency, no Redis, no 1576-line config, no forward-only-migration upgrade risk, and no relay version treadmill.
This gets sovereignty over the artifact that matters at essentially zero marginal cost, since it is already running.

Option B is to mirror everything and decide later.
Push read-only mirrors of every Buzz-hosted repository to your own forge on a timer, at a cost of one cron job and a credential helper, so that leaving Block at any moment leaves the only irreplaceable asset intact.
This should happen regardless of what else is decided, and it converts the self-hosting decision from urgent to reversible.

One further option went entirely unexamined in the synthesis.
`modules/machines/nixos/cinnabar/radicle.nix` exists in this repository with an ed25519 keypair generator, so if the goal is a sovereign, cryptographically-identified git forge, one is already running on the fleet.

The case for self-hosting the relay would have to rest on Buzz-the-forge being better than Gitea for this workflow.
On the evidence assembled it has no CI status primitive, no webhooks, no SSH, no LFS, no server-rendered code browsing, no OIDC, branch protection narrower than its own documentation claims, and a push-notification path that is warn-only on failure (`transport.rs:1886-1902`).
It is a different and less mature thing with an interesting object-storage design.

That object-storage design is worth naming separately, because the refutation explicitly declines to attack it.
The manifest-pointer protocol, the create-only content-addressed discipline, the explicit axiom statement, and the shipped conformance probe are better engineering than most self-hosted forges carry.
The critique is that R2 does not satisfy the axioms, not that the axioms are wrong.

## Open questions

Which hostname, decided before first deploy: `buzz.` accepting a possible later identity migration, `buzz.` permanently with `git.` retired to a redirect, or coordinating Gitea's retirement first and claiming `git.` directly.
The Host header is durable identity stored in Postgres and signed into every auth event.

Is forge-visible CI status actually required, or is buildbot.scientistexperience.net where results are read?
This one answer separates days from months.

Are the two Gitea Actions runners in use, and by which repositories?
If migration phases 3 and 4 of the CI/CD architecture note were never completed, the CD gap is theoretical.

Is SSH git transport in use against git.scientistexperience.net?
It is on by default and port 22 is open, so it may be in use without a decision having been made, and Buzz is HTTP-only structurally.

Is git-LFS actually holding objects in any Gitea repository?

Is total loss of chat history, DMs, reactions, and thread structure at cutover accepted?

Is Redis accepted as a new daemon class on the fleet, and is Buzz permanently outside the kanidm SSO being built?

Should the conformance probe stay enabled in steady state?
On is upstream's default and the honest posture, and it couples relay startup to object-store reachability and spends roughly 96 conditional writes per boot.

Which machine?
If Buzz coexists with Gitea rather than replacing it, magnetite's budget needs a dedicated ZFS dataset with its own quota, or Buzz wants its own instance.

Can non-technical family members point the desktop app at a custom relay?
The spike flagged this and never answered it, and a negative answer ends the family-adoption case for self-hosting.

What does sqlx's `Migrator` do when the database is ahead of the binary (`buzz-db/src/lib.rs:1012`, `migration.rs:11`)?
This determines whether a nix generation rollback fails loudly or corrupts quietly.

## Source material caveats

Several things in the spike output are internally inconsistent or could not be verified, and they are recorded here rather than smoothed over.

The two passes cite different line ranges for the same conformance-probe construct: `main.rs:496-527` in the synthesis and `main.rs:496-521` in the refutation.

The two passes disagree on the result of the backup search, with the synthesis reporting zero hits and the refutation reporting two unrelated home-package entries.
Re-running both the escaped and unescaped forms in this repository on 2026-08-04 returns zero matches in both cases; the conclusion that no backup configuration exists is unaffected.

The refutation cites one claim through a scratch copy at `/tmp/adv_store.rs` while anchoring it to `651f637:crates/buzz-relay/src/api/git/store.rs:678`; only the repository-anchored form is durable.

The `transport.rs:1806` catch-all line number is given as approximate in the source and should be re-located before it is relied on.

The "1576-line config module" figure appears in both passes with no file:line anchor for the file's total length; only `config.rs:799-804` is separately anchored.

The mulatta relay package labels version `0.2.0` from `relayVersion` while building from the `v0.5.2` tree (`packages/buzz-relay/package.nix:24`), so the version label and the source are decoupled and either could be misreporting.

Above all, every relay claim was read at `desktop-v0.5.4`, which is not the relay's release axis, while `crates/buzz-relay` ships at 0.2.0 on `relay-v*`.
The spike labeled this caveat throughout and then reasoned as though it did not apply; it applies, and it applies to every citation in this document.

## Addendum, 2026-08-19: the R2 gate is settled, and the relay has landed disabled

This section is appended; nothing above it has been altered, and its record stands as written on 2026-08-04.

The R2 conformance gate above has now been settled at the source, against upstream `relay-v0.2.1` (`6e5c462`) and against Cloudflare documentation fetched live on 2026-08-19.
The verdict of this note is upheld — R2 fails, and it fails both the startup probe and the steady-state push path — but three of the arguments above are wrong and are corrected here.
First, this note missed the documented off-switch: `BUZZ_GIT_CONFORMANCE_PROBE=false` exists at `main.rs:496-499` and is used by upstream's own tests, so the judgement that disabling hides rather than fixes the problem was right while the mechanism went unnamed.
Second, this note asserted the 429 mechanism without checking the S3 client layer: the client is `rust-s3` v0.37.2 with `fail-on-err`, and it does retry blindly — once, after one second, retrying 412 as well — which is insufficient against 32 writers on a 1-write/sec key but was never verified before the conclusion was drawn.
Third, this note overstated R2's consistency weakness: R2 documents strong read-after-write and strong list consistency, and would likely pass the probe's phases 1, 3 and 4, so the real gap is Cloudflare's silence on conditional-PUT CAS atomicity rather than documented weakness, and the disqualifying mechanism is throttling.
Two further corrections of detail: the probe issues 192 conditional writes per boot rather than roughly 96, and the probe's `DeleteObject` calls are error-ignored, so a 403 leaks scratch keys rather than failing the probe as the token-scope guidance above implies.
The recommendation carried forward is Garage single-node on magnetite, with MinIO as the known-good fallback because upstream verifies empirically against MinIO; Garage's conditional-PUT CAS was not documentation-verified in that pass, so the probe itself is the intended adjudicator.

Packaging and a NixOS module now exist on branch `fm/vx-buzz-relay-magnetite`.
The relay is pinned separately from the desktop train at `pkgs/by-name/buzz/relay-source` and built at `pkgs/by-name/buzz/relay`, so a server upgrade is not coupled to a client upgrade.
The module is `modules/nixos/buzz-relay.nix`, imported by magnetite and NOT enabled.
The full change is recorded under `openspec/changes/buzz-relay-module/`, whose `design.md` carries the object-storage finding with its citations.

The "if it is built anyway" section above, and its Phase 4 instruction to deploy to magnetite with the relay running, are superseded by the binding deploy-scope decision of 2026-08-19.
That decision lands the packaging, the module and the change reviewed and buildable with `services.buzz-relay.enable` defaulting to false and no host setting it, and keeps the operational go/no-go as a separate later change.
Three prerequisites remain unmet and gate that later change: an object store that passes the conformance probe, a decision on Redis as a new daemon class on this fleet, and a backup story that does not exist fleet-wide.
The hostname question in the open questions above is deliberately still unanswered, because the Host is a durable tenant key and the choice belongs to the change that actually turns the relay on.
