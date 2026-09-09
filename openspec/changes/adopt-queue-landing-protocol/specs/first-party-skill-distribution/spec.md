## MODIFIED Requirements

### Requirement: Distinct first-party policy and upstream mechanism skills

The composed corpus SHALL expose `git-stacked-pr-integration` and `mergify-stack` as distinct flat skill names.
The first-party skill SHALL retain fleet policy, worker and orchestrator contracts, VCS routing, and base landing evidence, and SHALL own the queue-authorization procedure while referring to the upstream skill for Mergify mechanism detail.
The upstream skill MUST NOT retire, rename, replace, or overwrite the first-party skill.
The base statement recording the landing of PRs 2738, 2739, and 2740 SHALL remain verbatim, with adjacent prose limiting it to the observed fast-forward landing and GitHub reachability rather than Mergify publication or queue batching.
Source edits SHALL be made under `modules/home/ai/plugins/`, composed through `pkgs/by-name/apm-skills-compose/`, and delivered through `modules/home/ai/skills/` without editing the delivered `~/.claude/skills/<skill>/SKILL.md` Nix store symlink.
Verification of a changed skill SHALL inspect both authored source and the corresponding freshly rebuilt composed output; an existing delivered path alone SHALL NOT count as evidence of the new text.

Trust boundary: this interface establishes separately addressable document bytes at the source and composition boundaries.
It does not establish harness selection, correct author use, activation of those bytes on every machine, or repository-local `.agents/` freshness.

#### Scenario: Both stacked-landing skills are composed

- **WHEN** the version-control-and-forge package and pinned Mergify dependency are composed for `agent-skills` and `claude`
- **THEN** both targets contain separately resolvable `git-stacked-pr-integration` and `mergify-stack` entry points
- **AND** the first-party output contains the queue-authorization owner and upstream override pointers

#### Scenario: Source changes while the installed profile remains old

- **WHEN** a first-party skill source is revised and the delivered symlink still resolves to an older store output
- **THEN** verification records the installed profile as stale and builds and inspects the new composed output
- **AND** no repair edits the delivered symlink target

#### Scenario: Evidence and routing text retain distinct provenance

- **WHEN** the first-party owner is revised for queue authorization
- **THEN** its PR 2738, 2739, and 2740 evidence sentence remains byte-identical
- **AND** adjacent text does not use it to claim native registration, queue batching, or asynchronous queue completion

#### Scenario: Upstream skill is added

- **WHEN** `mergify-stack` is available in the composed corpus
- **THEN** `git-stacked-pr-integration` remains available under its existing flat name
- **AND** its fleet policy and overrides remain separately owned rather than aliased to the upstream skill
