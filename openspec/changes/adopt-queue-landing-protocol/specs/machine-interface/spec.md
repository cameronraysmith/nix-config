## ADDED Requirements

### Requirement: Stack-land exposes assertions without a landing effect

The packaged `stack-land` command SHALL retain an explicit `--dry-run` assertion mode and SHALL reject operational invocations that omit `--dry-run` before invoking git or GitHub operations; `--help` SHALL remain available without that flag.
Its usage and package description SHALL identify it as an assertion-only diagnostic, not a landing mechanism or fallback.
The command SHALL contain no real push path, forge merge call, API mutation, or post-push merged-state polling loop.
The assertion mode SHALL retain target ancestry, exactly one valid `Change-Id` trailer per selected commit, and nonempty reported-check sets containing only `SUCCESS`, `NEUTRAL`, or `SKIPPED` conclusions.
Pending, failing, empty, or other reported-check sets SHALL fail the corresponding diagnostic assertion.
The documentation SHALL distinguish these optional all-member diagnostics from the queue's selected-head gate and SHALL NOT require them for authorization.
The package and existing installation wiring SHALL remain available.

Trust boundary: isolated command traces and remote-ref comparisons establish the observed absence of remote landing effects for tested invocations.
Assertions inspect supplied refs and forge responses; they do not prove PR-set completeness, review approval, queue eligibility, or successful future landing.
Target fetching can still update local fetch state.

#### Scenario: Legacy real invocation is attempted

- **WHEN** `stack-land --tip REV PR...` is invoked without `--dry-run`
- **THEN** it exits nonzero with an assertion-only diagnostic before any git or GitHub operation
- **AND** no remote update or forge mutation is attempted

#### Scenario: Explicit diagnostics pass

- **WHEN** `stack-land --dry-run --tip REV PR...` is invoked against a fixture satisfying the retained assertions
- **THEN** it exits successfully without a push, merge, API mutation, or merged-state wait
- **AND** the fixture's remote target remains unchanged

#### Scenario: Diagnostic assertions fail

- **WHEN** an explicit dry run encounters a missing, duplicate, or malformed Change-Id, non-ancestor target, or unacceptable reported-check set
- **THEN** it exits nonzero with the corresponding diagnostic
- **AND** its command trace still contains no remote write

### Requirement: Queue retirement records the pre-install and cutover boundaries

The migration instructions SHALL require the instruction and skill edits to land and their generated and delivered text to be verified before the GitHub App is installed on the repository.
The pre-install instructions SHALL preserve `.github/mergify.yml` queue behavior and include an authorization hold until queue installation readiness is confirmed.
The migration instructions SHALL reserve removal of `.github/mergify.yml` queue actions and both queue definitions for the same operator-coordinated window as App installation.
The resulting YAML SHALL contain no queue actions, `queue_rules`, or `merge_queue` block and SHALL retain unrelated `self-assign PRs` and `auto-approve owner-authored PRs with label` rules.
Queue-only anchors SHALL be removed when no surviving rule refers to them.
The cutover record SHALL identify the pre-install delivery evidence, the queue-removal revision, and the operator's installation-readiness evidence before declaring the new authorization path available.

Trust boundary: parsed YAML and recorded evidence can show configuration content and an explicit sequencing contract.
They cannot enforce operator timing, prove the external App's installation, or guarantee live queue readiness without separate observations.

#### Scenario: Guidance is ready before installation

- **WHEN** the pre-install instruction and skill group is reviewed for release
- **THEN** its evidence includes rebuilt skill and generated-context checks
- **AND** `.github/mergify.yml` still contains the two working queue definitions and queue actions

#### Scenario: Operator coordinates the installation window

- **WHEN** the cutover group is accepted with pre-install delivery and installation-readiness evidence
- **THEN** its parsed Mergify YAML has no queue actions or definitions and preserves the unrelated rules
- **AND** its record associates the removal with the installation window instead of claiming that an earlier removal was safe

#### Scenario: Installation is postponed

- **WHEN** the installation-readiness evidence is absent
- **THEN** the documented migration holds queue removal and author authorization rather than offering real `stack-land` or direct-push fallback

### Requirement: ADR cross-impact audit records conflicting landing commitments

The landing-protocol verification record SHALL inventory the formal ADR files under `packages/docs/src/content/docs/development/architecture/adrs/`, report the number of numbered ADRs separately from index files, and record every commitment to Mergify's server queue or buildbot as the landing gate.
Any such hit SHALL be accompanied by an explicit proposed supersession and operator decision before the protocol is accepted as consistent with the formal ADR corpus.
A zero-hit audit SHALL record its search scope and matching criteria without claiming that all historic CI choices have been reconciled.

Trust boundary: the record establishes an auditable corpus review; search coverage and human interpretation can miss implicit commitments.

#### Scenario: Audit has no matching commitments

- **WHEN** the audited corpus has no commitment matching the two retired landing gates
- **THEN** the record reports zero hits, the numbered-ADR and index counts, and the search and inspection scope

#### Scenario: Audit finds a conflicting decision

- **WHEN** an ADR decision commits to either retired landing gate
- **THEN** the record names that ADR and decision, proposes explicit supersession, and leaves consistency acceptance pending the operator's decision
- **AND** the accepted ADR is not silently contradicted or rewritten
