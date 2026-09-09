## ADDED Requirements

### Requirement: Fleet overrides remain separate from the upstream Mergify skill

The apm-installed upstream `mergify-stack` skill and references SHALL remain unchanged from their pinned upstream source.
`git-stacked-pr-integration` SHALL expose a first-party override section that takes precedence over upstream examples for repositories using the queue-authorization protocol.
That section SHALL require `--github-native` on stack publication and verification of native registration, as defined in `Queue authorization has one documented owner`.
It SHALL identify `mergify-cli.stack-branch-prefix` as the configured remote stack namespace and `stack/<author>` as the default, with the PR-opening identity used consistently for stack discovery.
It SHALL distinguish the local work branch from generated remote stack branches and require keeping the published namespace stable across updates.
It SHALL prohibit resyncing or repushing a landed stack as the normal author workflow and direct subsequent work to a fresh stack.
It SHALL explain that closed-unmerged PRs can be recreated by the client and that merged detection requires a merge timestamp and a head matching the local commit.
It SHALL refer to upstream mechanics rather than copying the upstream skill into `modules/home/ai/plugins/`.
The existing pinned source, offline resolution, and executable-release alignment SHALL remain unchanged by these policy edits.

Trust boundary: comparison against the pinned source establishes upstream byte preservation, and inspection establishes visible first-party precedence.
Neither establishes GitHub member bookkeeping, native registration, the user's configured namespace, or correct client execution.

#### Scenario: Upstream examples omit native registration

- **WHEN** the composed upstream skill offers plain stack push as a publication example
- **THEN** the separately delivered first-party override explicitly requires the native-registration form for this protocol
- **AND** the upstream example remains unpatched

#### Scenario: Published stack has a configured branch prefix

- **WHEN** the override section is read for a stack namespace configured through `mergify-cli.stack-branch-prefix`
- **THEN** it directs the author to preserve that namespace and PR-opening identity
- **AND** it states `stack/<author>` only as the fallback when the configuration is absent

#### Scenario: Author begins work after a stack landed

- **WHEN** the override section describes work following a landed stack
- **THEN** it prohibits normal resync or repush of that stack, names the client recreation risk, and directs the author to a fresh stack

#### Scenario: Composition is rebuilt after first-party edits

- **WHEN** the Mergify dependency is composed with the revised policy owner
- **THEN** upstream skill bytes match the pinned source and both skill names remain distinct
- **AND** existing release-alignment and offline dependency checks still pass
