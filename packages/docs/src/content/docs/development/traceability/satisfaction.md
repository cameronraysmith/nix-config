---
title: Satisfaction argument
description: Discharge status for every requirement in the OpenSpec corpus
generated: 2026-09-09
---

This file is a projection over `openspec/specs/`, regenerated wholesale at archive time and never patched.
A discharge cell names a concrete check, scenario execution, proof obligation, or dated inspection.
A capability description is not discharge evidence.

The projection records the `W ∧ S ⇒ R` obligation separately from implementation refinement.
An implementation can match its specification while that specification still fails to satisfy the intended requirement.
Nothing in this projection is an end-to-end guarantee.

## Status

The post-sync corpus contains 102 requirements across 15 capabilities: 92 requirement-side rows and 10 world-assumption rows.
Three of the 92 requirement-side rows are discharged at their stated interface boundaries.
Eighty-nine remain undischarged: 82 have neither specification-side evidence nor a named world assumption, and 7 name world assumptions but no specification-side evidence.

The three discharged rows establish only Nix-boundary source alignment and offline composition, composed skill identity, and rendered guidance.
They do not establish repository-local frozen delivery, harness selection, human compliance, authorization, forge correctness, activation, or a successful landing.
Unless a row names a more specific follow-up, `evidence annotation follow-up` refers to OpenSpec change `annotate-discharge-evidence`, whether active or later archived.

The strata of capabilities that predate the stratum discipline remain inferred and have not been re-audited.
CAM-41 declared its three added requirements as `interface`.
CAM-62 declared `graphical-desktop-session` as `behavioral` and `world-assumptions` as `world`, and its added behavioral requirement is recorded below as undischarged with an explicit follow-up rather than omitted or silently accepted.

## agentic-workflow-routing

Predates the stratum discipline; the interface classification is inferred from its skill and board interfaces.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| Unified seven-state Linear-canonical board | interface | — | — | undischarged — evidence annotation follow-up |
| In Review decomposes into two ordered human-steered sub-gates | interface | — | — | undischarged — evidence annotation follow-up |
| Shared re-queue with bounded-retries termination guarantee | interface | — | — | undischarged — evidence annotation follow-up |
| AFK, HIL, and Manual execution-mode fork at the Todo to In Progress boundary | interface | — | — | undischarged — evidence annotation follow-up |
| Compose by delegation, never re-implement | interface | — | — | undischarged — evidence annotation follow-up |
| HIL apply-phase jj and worktree isolation guidance | interface | — | — | undischarged — evidence annotation follow-up |

## apple-laptop-hardware-support

Predates the stratum discipline; the behavioral classification is inferred and has not been re-audited.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| The pyrite host module imports the upstream model profile with its unwanted firmware pulls disabled | behavioral | — | — | undischarged — evidence annotation follow-up |
| The machine module states its firmware affirmations rather than inheriting them | behavioral | — | — | undischarged — evidence annotation follow-up |
| The stage-1 initrd force-loads the four SPI/SMC modules that make the unlock prompt answerable | behavioral | — | — | undischarged — evidence annotation follow-up |
| boot.initrd.kernelModules is never overridden with mkForce | behavioral | — | — | undischarged — evidence annotation follow-up |
| A USB-C keyboard and the clan-vars passphrase are prerequisites of the first boot, not recoveries improvised afterward | behavioral | — | — | undischarged — evidence annotation follow-up |
| The machine's configuration is never seeded from nixos-generate-config | behavioral | — | — | undischarged — evidence annotation follow-up |
| The sleep path is gated by three units the machine module defines itself | behavioral | — | — | undischarged — evidence annotation follow-up |
| Suspend is entered through the systemd-sleep path and resumes with the pool intact | behavioral | — | — | undischarged — evidence annotation follow-up; contradicted in part by CAM-59, see CAM-62 qualification V5 |
| A panic that outlives the disk is recorded through EFI pstore, because every other channel is unavailable on this machine | behavioral | — | — | undischarged — evidence annotation follow-up |

## bare-metal-install-path

Predates the stratum discipline; the behavioral classification is inferred and has not been re-audited.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| The install path is recorded in the repository, and is written to be re-runnable without being shown to be | behavioral | — | — | undischarged — evidence annotation follow-up |
| An install is accepted as evidence only if it exercised the create path | behavioral | — | — | undischarged — evidence annotation follow-up |
| The hardware report is committed as static data and never regenerated on the target | behavioral | — | — | undischarged — evidence annotation follow-up |
| The machine is registered across every hand-maintained list a new machine touches | behavioral | — | — | undischarged — evidence annotation follow-up |
| Network association is declarative, and the credentials are sops-encrypted clan vars | behavioral | — | — | undischarged — evidence annotation follow-up |
| ZeroTier admission requires redeploying the controller | behavioral | — | — | undischarged — evidence annotation follow-up |
| A FIDO2 token is verified present before each enrollment, and disko's own guard is never that verification | behavioral | — | — | undischarged — evidence annotation follow-up |

## encrypted-zfs-root

Predates the stratum discipline; the behavioral classification is inferred and has not been re-audited.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| The root is a ZFS pool created with an explicit ashift matching the disk's 4096-byte sectors | behavioral | — | — | undischarged — evidence annotation follow-up |
| The ESP is typed EF00 and sized 1G | behavioral | — | — | undischarged — evidence annotation follow-up |
| A sibling partition carries the ZFS content that becomes the pool's vdev | behavioral | — | — | undischarged — evidence annotation follow-up |
| The pool device is named by a namespace-explicit by-id path | behavioral | — | — | undischarged — evidence annotation follow-up |
| The pool sits inside a LUKS2 container holding the clan-vars passphrase in slot 0 and a FIDO2 token in each of slots 1 and 2 | behavioral | — | — | undischarged — evidence annotation follow-up |
| The costs and the gains of the LUKS layer are both recorded rather than discovered later | behavioral | — | — | undischarged — evidence annotation follow-up |
| The LUKS header and the keyslot inventory are maintained artifacts, not install-time byproducts | behavioral | — | — | undischarged — evidence annotation follow-up |

## first-party-skill-distribution

Predates the stratum discipline except for CAM-41's declared interface requirement.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| Build-time apm composition of first-party skills | interface | — | — | undischarged — archived CAM-41 `verify.md` W1 and W2 |
| Immutable delivery and always-succeeds activation | interface | — | — | undischarged — evidence annotation follow-up |
| Flat skill name preservation | interface | — | — | undischarged — archived CAM-41 `verify.md` W3 |
| Distinct first-party policy and upstream mechanism skills | interface | `.#apm-skills-compose`; byte comparison with the pinned source; `git-stacked-pr-integration` sections `Stacked PR integration policy`, `Role contracts`, and `VCS routing` | — | discharged at the two-target Nix composition interface |

## graphical-desktop-session

The incumbent requirement predates the stratum discipline; its behavioral classification is inferred and has not been re-audited.
CAM-62 declared its added requirement `behavioral`.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| The pyrite host provides a local GNOME desktop under GDM | behavioral | — | — | undischarged — evidence annotation follow-up |
| The laptop does not suspend itself when nobody is using it | behavioral | — | `world-assumptions` A13 | undischarged — no interface property named; archived CAM-62 `verify.md` §8b, qualification V3 |

## openspec-linear-sync

Predates the stratum discipline; the interface classification is inferred from its CLI and artifact interfaces.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| Drive Linear exclusively through linear-cli | interface | — | — | undischarged — evidence annotation follow-up |
| Bind four forward transitions plus re-queue with invariants | interface | — | — | undischarged — evidence annotation follow-up |
| Local sync ledger as authoritative current-phase signal | interface | — | — | undischarged — evidence annotation follow-up |
| Single-location frontmatter binding that resolves against the registry | interface | — | — | undischarged — evidence annotation follow-up |
| Mirror the Linear issue description from proposal.md business content | interface | — | — | undischarged — evidence annotation follow-up |
| Archive-time document UPSERT with mirroring | interface | — | — | undischarged — evidence annotation follow-up |
| One-question setup, never-auto-select, best-effort non-blocking | interface | — | — | undischarged — evidence annotation follow-up |

## pi-agent-environment

Predates the stratum discipline for its specification-side evidence.
Six requirements name world assumptions, but none of the 24 requirements has a per-requirement specification-side discharge annotation.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| Nix-owned Pi resources | behavioral | — | — | undischarged — evidence annotation follow-up |
| Mutable settings seed | behavioral | — | — | undischarged — evidence annotation follow-up |
| Runtime state boundary | behavioral | — | — | undischarged — evidence annotation follow-up |
| Source-only extension package | behavioral | — | — | undischarged — evidence annotation follow-up |
| Selected extensions | behavioral | — | — | undischarged — evidence annotation follow-up |
| Nix-owned runtime executables | behavioral | — | — | undischarged — evidence annotation follow-up |
| Excluded extension resources | behavioral | — | — | undischarged — evidence annotation follow-up |
| Retained compaction extension | behavioral | — | — | undischarged — evidence annotation follow-up |
| Canonical skill sink | behavioral | — | — | undischarged — evidence annotation follow-up |
| Catppuccin source provenance | behavioral | — | — | undischarged — evidence annotation follow-up |
| Catppuccin theme delivery | behavioral | — | — | undischarged — evidence annotation follow-up |
| Permission-gate reuse | behavioral | — | `world-assumptions` A1 | undischarged — specification evidence pending |
| Additional shell policy | behavioral | — | `world-assumptions` A2 | undischarged — specification evidence pending |
| Non-Bash edit and write policy | behavioral | — | `world-assumptions` A1, A2, A3, A4, A5, A6, A7 | undischarged — specification evidence pending |
| Git default-branch boundary | behavioral | — | `world-assumptions` A3, A5, A7, A8 | undischarged — specification evidence pending |
| Jj diamond boundary | behavioral | — | `world-assumptions` A3, A5, A7, A8 | undischarged — specification evidence pending |
| Fail-open policy | behavioral | — | `world-assumptions` A1, A2, A3, A4 | undischarged — specification evidence pending |
| Secret-safe direnv | behavioral | — | — | undischarged — evidence annotation follow-up |
| Opt-in slow mode | behavioral | — | — | undischarged — evidence annotation follow-up |
| Consolidated custom regulators | behavioral | — | — | undischarged — evidence annotation follow-up |
| Offline aggregate smoke | behavioral | — | — | undischarged — evidence annotation follow-up |
| Rollback preservation | behavioral | — | — | undischarged — evidence annotation follow-up |
| Activation requires explicit permission | behavioral | — | — | undischarged — evidence annotation follow-up |
| Post-activation confirmation gate | behavioral | — | — | undischarged — evidence annotation follow-up |

## project-management-hub

Predates the stratum discipline; the interface classification is inferred from its delivered guidance and CLI boundary.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| Linear Method ontology spine | interface | — | — | undischarged — evidence annotation follow-up |
| Four flat one-level reference areas | interface | — | — | undischarged — evidence annotation follow-up |
| Linear workspace safety gate keyed on confirmed credentials | interface | — | — | undischarged — evidence annotation follow-up |

## requirements-stratification

Behavioral stratum.
No automated check guards this capability, and no per-requirement evidence is recorded.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| Stratum assignment for any requirement-like statement | behavioral | — | — | undischarged — evidence annotation follow-up |
| Grounding of terms used in requirements | behavioral | — | — | undischarged — evidence annotation follow-up; three unresolved nouns recorded at CAM-62 qualification V4 |
| Separation of what is assumed from what is wanted | behavioral | — | — | undischarged — evidence annotation follow-up |
| Discharge of a requirement is stated, not implied | behavioral | — | — | undischarged — evidence annotation follow-up |
| Obstacle analysis produces the boundary and open questions | behavioral | — | — | undischarged — evidence annotation follow-up |

## satisfaction-argument-audit

Behavioral stratum.
No automated check guards this capability, and no per-requirement evidence is recorded.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| Specification is checked against intent independently | behavioral | — | — | undischarged — evidence annotation follow-up |
| Everything the argument depends on unverified is enumerated | behavioral | — | — | undischarged — evidence annotation follow-up |
| Agreement between two artifacts is not treated as confirmation | behavioral | — | — | undischarged — evidence annotation follow-up |
| External claims are bounded by what was actually established | behavioral | — | — | undischarged — evidence annotation follow-up |
| The audit runs at a boundary, not continuously | behavioral | — | — | undischarged — evidence annotation follow-up |

## skill-corpus-interface

Interface stratum.
The CAM-41 row is discharged only for authored, composed, and rendered guidance.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| A named skill is resolvable in the delivered corpus | interface | — | — | undischarged — evidence annotation follow-up |
| A skill's trigger surface admits the situations it must fire on | interface | — | — | undischarged — evidence annotation follow-up |
| Stated ownership boundaries hold across the corpus | interface | — | — | undischarged — evidence annotation follow-up |
| Stacked landing guidance is conditioned by role and repository mode | interface | `git-stacked-pr-integration` sections `Role contracts`, `Requirement-to-mechanism map`, `Checked landing boundary`, and `VCS routing`; evaluated `programs.agents-md.settings.text`; integrated-main `stack-land` predicate and tests | — | discharged at the composed and rendered guidance interface |

## stratified-change-authoring

Interface stratum.
No automated check guards this capability, and no per-requirement evidence is recorded.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| Proposal artifact records a stratum tag per capability | interface | — | — | undischarged — evidence annotation follow-up |
| Specs artifact applies stratum-conditional vocabulary rules | interface | — | — | undischarged — evidence annotation follow-up |
| Verify artifact runs non-blocking stratum checks | interface | — | — | undischarged — evidence annotation follow-up |
| Archive step regenerates the satisfaction projection | interface | — | — | undischarged — evidence annotation follow-up |
| Tasks artifact records per-task verification | interface | — | — | undischarged — evidence annotation follow-up |
| The stratum layer states its own trust boundary | interface | — | — | undischarged — evidence annotation follow-up |

## third-party-plugin-dependency

Predates the stratum discipline except for CAM-41's declared interface requirement.

| Requirement | Stratum | Discharged by (S) | Under (W) | Status |
|---|---|---|---|---|
| First-party packages declare nix-pinned apm dependencies on upstream plugins | interface | — | — | undischarged — evidence annotation follow-up |
| Upstream plugins consumed without forking and extended additively | interface | — | — | undischarged — evidence annotation follow-up |
| Release-aligned offline Mergify skill dependency | interface | package version evaluations; `structure-mergify-release-alignment`; `structure-mergify-release-alignment-neg`; `.#apm-skills-compose`; generated-lock revision and hashes; byte comparison; unchanged root lock | Mergify tag `2026.8.31.1` resolved to `727ce50b8fb3be8a9a24025807e159d644dbba80` in a 2026-09-02 `gh-axi` inspection | discharged at the Nix build interface; repository-local frozen delivery remains pending W4 |

## world-assumptions

These ten rows are the `W` side of the argument rather than requirement-side goals.
Their truth is asserted in their requirement text but is not independently checked by a scenario execution, proof obligation, or dated inspection.
They are therefore self-attested rather than discharged.

| Requirement | Stratum | Discharges (R) | Status |
|---|---|---|---|
| A1 — No native permission system | world | Permission-gate reuse; Non-Bash edit and write policy; Fail-open policy | self-attested |
| A2 — Unanswerable dialog stalls a session with UI but no human present | world | Additional shell policy; Non-Bash edit and write policy; Fail-open policy | self-attested |
| A3 — Policy failure carries no safety evidence | world | Non-Bash edit and write policy; Git default-branch boundary; Jj diamond boundary; Fail-open policy | self-attested |
| A4 — Refusing on ambiguity has a real cost and prevents nothing | world | Non-Bash edit and write policy; Fail-open policy | self-attested |
| A5 — A tracked target is recoverable from repository history | world | Non-Bash edit and write policy; Git default-branch boundary; Jj diamond boundary | self-attested |
| A6 — Atomic inherits Pi's configuration root unconditionally | world | Non-Bash edit and write policy | self-attested |
| A7 — Pi's enumerated path forms are exhaustive | world | Non-Bash edit and write policy; Git default-branch boundary; Jj diamond boundary | self-attested |
| A8 — Jj's outside-repository diagnostic is stable | world | Git default-branch boundary; Jj diamond boundary | self-attested |
| Grounded vocabulary for behavioral requirements | world | Grounds behavioral content nouns; not requirement-scoped | self-attested |
| A13 — Resuming this laptop from a suspended state is unreliable, and recovering a failed resume requires a person at the machine | world | The laptop does not suspend itself when nobody is using it | self-attested; the recorded rate is 7 failures against 30 successes across 14 boots, and CAM-62's own verification added an eighth failure |

`A9` through `A12` are absent by construction: they belong to the unarchived change `stand-up-nixbot-on-magnetite` and enter this corpus when that change archives, not before.
The numbering gap between `A8` and `A13` is therefore expected and is not a dropped row.

## CAM-41 qualifications

- W1: The canonical four-direct-target scenario conflicts with the two APM targets plus later Nix fan-out.
- W2: The canonical build-only APM statement conflicts with the intentional repository producer installer.
- W3: The canonical census of roughly 70 absolute autoload references conflicts with the current single force-load reference.
- W4: The root `apm.lock.yaml` remains unchanged, so a post-main generated `just agents-relock` follow-up must precede any repository-local frozen-delivery claim.
- W5: Repository artifacts and local logs cannot establish that no external actor activated a configuration or landed a stack.
- W6: The branch has not been pushed, its remote head is absent, and `gh-axi pr list` reports no pull request.
- S1: Ten canonical specs retain placeholder `Purpose` text: `agentic-workflow-routing`, `first-party-skill-distribution`, `openspec-linear-sync`, `project-management-hub`, `requirements-stratification`, `satisfaction-argument-audit`, `skill-corpus-interface`, `stratified-change-authoring`, `third-party-plugin-dependency`, and `world-assumptions`.

W1 through W3 require separate canonical reconciliation.
W4 is a post-main delivery follow-up rather than a pre-publication acceptance step for CAM-41.
W5 and W6 bound external-state claims and do not weaken the three narrow interface discharges above.
S1 is corpus maintenance outside CAM-41.

## CAM-62 qualifications

- V1: `The laptop does not suspend itself when nobody is using it` is observed only on mains power. The battery branch's behaviour was never watched; its configuration is decoded on the machine and its resolution read through the running daemon's own environment, and the remaining step is a source-level argument. Closing it costs one 35-minute unplugged idle window and no redeploy. Archived CAM-62 `verify.md` §7 row 1.
- V2: The panel blank-and-lock clause establishes non-regression, not behaviour: `idle-delay` is intact and no screensaver key was touched, but no one watched a panel. Closing it costs one 30-minute idle window and no redeploy. Archived CAM-62 `verify.md` §7 row 2.
- V3: The added behavioral requirement names **no** discharging interface property. CAM-62 deliberately created no interface capability, on the grounds that it changes the value of an existing machine property rather than introducing a new one, so the properties that in fact discharge it are named only in `design.md` and `tasks.md`, which are not vocabulary-governed. The accepted disposition is to record this rather than accept it silently; the alternative disposition — promoting the greeter and user dconf database content to a `machine-interface`-stratum capability so the requirement has a named `S` — remains open and belongs to its own change. Archived CAM-62 `verify.md` §8b and `retrospective.md` §6.
- V4: Three world-flavoured content nouns used by the added requirement resolve to no row in the designation table: `laptop`, `person`, and `network`. Zero unresolved machine nouns. Recommended dispositions are recorded and deliberately not applied: restate the requirement title using `host`, add a `person` row (distinct from `operator`), and add a shared `network` row. Archived CAM-62 `verify.md` §8a.
- V5: `apple-laptop-hardware-support`'s requirement `Suspend is entered through the systemd-sleep path and resumes with the pool intact` is contradicted in part by the tracked resume defect CAM-59, now at 8 recorded failures against 30 successes across 14 boots. CAM-62 reduces how often the host takes that risk and does not reduce the risk; it is harm reduction, not a repair. The newest failure was the first and only suspend of its boot, which is a counterexample to the previously 7/7 "the first suspend of a boot never fails" regularity. Archived CAM-62 `verify.md` §2 and `retrospective.md` §5.
- V6: CAM-62 authored no `plan.md`, so the schema's `verify` dependency is formally unmet; `tasks.md` carried the manual-check role. Its two commits are not on `origin/main`, which is the ordinary state of an in-flight jj diamond chain. Archived CAM-62 `verify.md` §5 and §7.

V1 and V2 are coverage residuals, each one elapsed idle window and no redeploy.
V3 is the undischarged row this projection is required to carry rather than omit, and it is carried above in the `graphical-desktop-session` table.
V4 is vocabulary maintenance against `world-assumptions`.
V5 bounds what CAM-62 claims and is the reason CAM-59 remains open.
V6 bounds process and publication state and weakens no discharge.

## Known limits

This projection contains no formal proof discharge and no claim that an implementation is verified end to end.
The Mergify source pin, Nix builds, composed trees, generated lock, and rendered context establish machine-visible artifacts at named boundaries only.
They do not establish that the upstream guidance is correct, that a harness selects either skill, that a human follows the role contract, that authorization is valid, that GitHub reports are complete, or that a landing succeeds.

The root lock does not contain `mergify-stack`, and the contents of an existing ignored repository-local `.agents/` tree remain unspecified.
Fresh frozen repository-local delivery cannot be claimed until W4 is complete.
The branch can be offered for authorized review without claiming activation, landing, or repository-local materialization.

For pyrite, evaluating the flake establishes what a generated dconf database contains and establishes nothing about what the consuming daemon reads, because a user database sits ahead of the Nix file database by deliberate design.
The `graphical-desktop-session` power-policy requirement is therefore what the host does absent a change made at the machine's own settings panel, not a guarantee about what it does.
