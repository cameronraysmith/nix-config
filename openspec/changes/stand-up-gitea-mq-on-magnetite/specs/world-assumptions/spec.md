## ADDED Requirements

### Requirement: A22 — gitea-mq resolves stacks only through GitHub's Stacks API

It is true of gitea-mq at the pinned revision that label enqueue on GitHub resolves native membership through the Stacks API (`internal/github/forge.go::ResolveStack`) and targets the returned stack base (`internal/poller/poller.go::labeledTargetBranch`).
The labelled PR contributes one entry whose head ancestry lands with it, so inclusion of all intended members requires verifying that ancestry.
The queue reads no `Depends-On:` header or PR body; branch-chain hints from `internal/poller/poller.go::hintStackedPRs` do not establish native membership or supply stack-base resolution.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: gitea-mq comes to resolve stacks by another means, or stops resolving them

- **WHEN** a pinned revision of gitea-mq resolves a stack from pull-request bodies, branch chaining, or any source other than the Stacks API, or stops resolving stacks on GitHub at all
- **THEN** this assumption is void, and the `merge-queue-service` requirement `Landing advances the default branch to a tested commit` loses the discharge argument that labelling the top pull request of a natively registered stack lands exactly its members

### Requirement: A23 — GitHub marks a fast-forwarded stack member merged

The ADR's V1 records GitHub marking landed PRs merged with timestamps and unchanged head SHAs after a non-force update makes those SHAs reachable on the default branch.
The non-stack case is discharged empirically by Mic92/dotfiles #5887–#5890; the stacked case rests on operator confirmation that GitHub retargets remaining members to the trunk and marks them merged when it detects their SHAs there (ADR §Compliance, V1).
The stacked mechanism is unverified against a documentation or source citation here; V1 is nevertheless discharged on that attributed basis and is to be re-confirmed at the first live stacked landing, not treated as a promotion blocker.
It is carried here because the landing protocol's client-side bookkeeping treats a commit as merged only when its pull request carries a merge timestamp and a head equal to the local commit, so a landing that leaves members open or closed-unmerged is not an acceptable degradation.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: A fast-forwarded member reads as open or closed rather than merged

- **WHEN** the default branch is advanced by non-force ref update to a stack's tip and any member whose head became reachable reads as open, or as closed without a merge timestamp, on the forge
- **THEN** this assumption is void, the `merge-queue-service` requirement `Landing advances the default branch to a tested commit` loses the discharge argument that every member reads as merged, and native stack registration together with fast-forward landing of stacks is reopened as a decision rather than patched by the queue's close-with-comment fallback

### Requirement: A24 — gitea-mq enqueues auto-merge-enabled pull requests and its setup enables allow_auto_merge

It is true of gitea-mq at the pinned revision that native auto-merge and labels both lead to `internal/poller/poller.go::enqueuePR` after required head checks pass, but their target selection differs.
`enqueueAutoMergePRs` uses `pr.BaseBranch` without stack resolution; `labeledTargetBranch` calls `ResolveStack` and uses `stack.BaseBranch` for a registered member.
`PollOnce` runs auto-merge enqueue first and `enqueueLabeledPRs` skips existing entries, so successful auto-merge enqueue wins over a correct label.
The queue's startup setup enables repository `allow_auto_merge` when it has Administration permission (`internal/github/setup.go::EnsureRepoSetup`); turning it off is undone at the next start.
The previous statement that auto-merge enqueues exactly as labels do is reversed because it omitted this target-selection difference.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: The auto-merge path changes shape

- **WHEN** a pinned revision of gitea-mq stops enqueuing auto-merge-enabled pull requests, stops enabling `allow_auto_merge` at startup, or gains a setting that disables either
- **THEN** this assumption no longer governs the queue, and `The enqueue signal is exposed as merge authorization` must be re-examined against the changed interface

### Requirement: A25 — gitea-mq takes required checks from the forge's protection before its own list

It is true of gitea-mq at the revision this fleet pins, independent of what this fleet builds, that the set of checks it requires on a target branch is the forge's own required-status-check list from rulesets and classic protection with the queue's own contexts removed, and that its configured list is consulted only when that forge list is empty (`monitor.go::ResolveRequiredChecks`, `forge.go::GetRequiredChecks`).
A forge-side requirement for any single build-service context therefore replaces the configured three-context set rather than adding to it, and a forge-side requirement for all three makes the forge the operative source with the matching configured fallback never consulted.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: The resolution order changes

- **WHEN** a pinned revision of gitea-mq merges the forge's list with its configured list, prefers its configured list, or drops the forge list entirely
- **THEN** this assumption is void, and the `merge-queue-service` requirement `The queue gates on the build service's verdicts and nothing else` and the `merge-queue-interface` requirement `The default branch is governed by two rulesets` lose the argument that keeping all three build-service contexts in the operator's ruleset makes exactly that set the queue's required set

### Requirement: A26 — the batch engine advances the target to the exact tested commit

It is true of gitea-mq at the revision this fleet pins, independent of what this fleet builds, that its batch engine constructs a batch commit, has CI test that commit, and on a pass advances the target branch to that exact commit by an ancestry-checked non-force ref update (`internal/batch/batch.go::Engine.HandlePass` calling `internal/github/forge.go::FastForward`), so what lands is the tree CI saw even when the batch contains merge commits.
A batch holds up to `batchMax` queue entries, and a single up-to-date entry with skipping enabled can land its own head without a batch ref (`internal/batch/batch.go::Engine.headIfUpToDate`, `Engine.Build`).
This is the fact that retires the orchestrator rollup: no separately assembled linear candidate is needed to keep the landed tree identical to the tested tree.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: The engine lands something other than what it tested

- **WHEN** a pinned revision of gitea-mq merges, squashes, rebases, or force-updates the target on a pass, rather than advancing it to the commit CI tested
- **THEN** this assumption is void, and the `merge-queue-service` requirement `Landing advances the default branch to a tested commit` loses its discharge, together with the batching decision that rests on it

### Requirement: A27 — the queue is review-blind and the enqueue signal is the merge authorization

It is true of gitea-mq at the revision this fleet pins, independent of what this fleet builds, that it reads no review or approval state: a case-insensitive search of `internal/` for review-related identifiers returns no match, and `internal/poller/poller.go::enqueuePR` gates on check results alone.
It is further true that the queue's forge application performs a direct ref update as a ruleset bypass actor (`internal/github/setup.go::EnsureRepoSetup`, `ensureBypass`; `internal/github/forge.go::FastForward`), so a forge-side approving-review rule does not constrain landing.
Applying the merge label or enabling auto-merge is therefore the merge authorization itself, and ordering review before that signal is a convention, matching the three reference GitHub deployments, rather than a property the queue or the forge enforces.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: The queue gains review awareness

- **WHEN** a pinned revision of gitea-mq reads approval state, or the forge comes to enforce an approving-review rule against the queue's application
- **THEN** this assumption is void and the `merge-queue-service` requirement `The enqueue signal is exposed as merge authorization` must be re-examined because its description of review enforcement has changed

#### Scenario: An unreviewed change is authorized

- **WHEN** an identity applies the merge label or enables auto-merge on a review-required change before that change has been reviewed
- **THEN** the queue can land it once required CI and landing conditions pass, because it supplies no review gate; this is the residual risk E1 records rather than a queue-enforced policy

### Requirement: A28 — native stack members are based on one another

For GitHub-native registered stacks, upper members are based on the member below and the bottom member is based on the trunk (operator assertion, consistent with `internal/github/forge.go::ResolveStack`, `internal/forge/forge.go::Stack.MembersUpTo`, and `internal/poller/poller.go::hintStackedPRs`).
`internal/poller/poller.go::enqueueAutoMergePRs` uses `pr.BaseBranch` without stack resolution, while `labeledTargetBranch` resolves `stack.BaseBranch`.
Because `PollOnce` runs auto-merge enqueue first and `enqueueLabeledPRs` skips already-queued PRs, an upper member can silently target its parent branch even when the intended top PR is correctly labelled.
The sibling shape policy forbids auto-merge on every stack member, including the bottom member; the bottom member is not itself an example of wrong-parent target selection.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: Stack members stop being based on one another, or the enqueue order changes

- **WHEN** GitHub-native stack members come to be based on the trunk rather than on the member below, or a pinned revision of gitea-mq resolves stacks on the auto-merge path or runs label enqueue first
- **THEN** this assumption is void, and the shape rule that auto-merge is never enabled on any stack member loses the reason recorded for it

---

## MODIFIED Requirements

### Requirement: Grounded vocabulary for behavioral requirements

The corpus SHALL provide one designation record per content term this repository's `behavioral`-stratum requirements use, recording the term, the sense in which it is used when a term carries more than one, the world phenomenon it denotes, and whether that phenomenon is world-only, shared with the machine, or machine-only.
A term found to denote two distinct phenomena within this repository's vocabulary SHALL be recorded as two rows rather than collapsed into one.
Thirteen terms carry two senses in this repository today and are disambiguated below rather than left to context: `session`, `package`, `policy`, `@`, `mutation`, `activation`, `probe`, `machine`, `host`, `interface`, `repository`, `build service`, and `merge`.

| Term | Sense | World phenomenon it denotes | Status |
|---|---|---|---|
| session | autonomous | a bounded episode during which an agent acts without a human present to answer a prompt | world-only |
| session | Pi-persisted | Pi's own stored record of a run (a session file, or the absence of one under `--no-session`) | machine-only |
| package | fleet | a named unit of externally sourced code with recorded provenance (commit, hash, license) this fleet vets before use | world-only |
| package | nix | a Nix derivation output with a store path | machine-only |
| policy | fleet | the organization's decision about which mutations are acceptable, independent of what enforces it | world-only |
| policy | machine | the running decision core (permission-gate, or the first-party pure core) that classifies a tool call | machine-only |
| `@` | Pi | Pi's own path-prefix sigil in its path-resolution grammar | machine-only |
| `@` | jj | jj's revset symbol for the current working-copy commit | machine-only |
| mutation | world | an irreversible-to-a-person change made to a file or a repository someone maintains | world-only |
| mutation | machine | the specific tool-call class the policy core classifies (`edit`, `write`, a semantic HTTP verb) | machine-only |
| activation | world | the human act of authorizing a new configuration to take effect on a real machine | world-only |
| activation | machine | the nix-darwin system-profile-link switch a `just activate` run performs | machine-only |
| probe | measurement | the act of interrogating actual repository state to learn something true about it | shared |
| probe | machine | a specific subprocess invocation (for example `jj --ignore-working-copy log ...`) with a literal argv and exit code | machine-only |
| machine | WRSPM | M, whatever executes the program, in this framework's own vocabulary | machine-only |
| machine | fleet | a nix-darwin laptop or cloud server this fleet manages | world-only |
| host | fleet | a physical or virtual machine in the fleet that runs a configuration | world-only |
| host | nix | the build or target platform designation nixpkgs cross-compilation vocabulary uses (`buildHost`/`hostPlatform`) | machine-only |
| interface | WRSPM | the alphabet of phenomena shared between world and machine, at which the specification is stated | shared |
| interface | nix/code | a module option interface, or a TypeScript interface type in extension source | machine-only |
| permission system | — | a native mechanism that gates a tool call pending human interactive approval | world-only |
| dialog | — | an interactive prompt awaiting a human's answer | world-only |
| UI channel | — | the means by which a Pi session can present a dialog to a human at all, independent of whether one is actually present to answer it | world-only |
| repository | recoverability | a version-controlled tree whose history can potentially recover a prior state of a file within it | shared |
| repository | forge-hosted | a version-controlled tree kept on a forge, whose declared outputs a build service can be asked to build and whose default branch a merge queue can be asked to advance | shared |
| history | — | the sequence of recorded prior states a repository's version-control system retains | shared |
| target | — | the file or path a proposed mutation would act on | shared |
| path | — | the string identifying a target's location, in whatever form the tool that opens it accepts | shared |
| untracked file | — | a file present in a repository's working tree that its version-control system has never recorded | shared |
| gitignored file | — | a file a repository's ignore rules exclude from being tracked even if added | shared |
| diagnostic | — | the textual output a probe emits describing the state it found | shared |
| `Hint:` line | — | a trailing advisory line jj appends after certain diagnostics | machine-only |
| configuration root | — | the directory atomic inherits from Pi and treats as the source of its own settings | machine-only |
| extension directory | — | the directory Pi loads extensions from unconditionally once a harness inherits its configuration root | machine-only |
| build service | fleet | a service that evaluates a forge-hosted repository's declared outputs, builds them, and publishes the outcome back to that forge | world-only |
| build service | machine | one running service unit and the state it owns, distinguished by its own user, database, and state directory | machine-only |
| forge | — | the hosted service where a forge-hosted repository lives, which announces its events and displays the outcomes published about it | world-only |
| forge application | — | a registered identity on a forge through which a build service or a merge queue acts, whose installation selection bounds the repositories that identity can see | shared |
| delivery | — | a message a forge sends a build service or a merge queue announcing that something happened in a repository | shared |
| check run | — | a named pass-or-fail outcome a build service publishes on a forge against a repository's commit | shared |
| required check | — | the repository's own forge-side configuration naming which check runs must pass before a change may merge | world-only |
| hostname | — | the public name at which a person reaches a service over the network | shared |
| certificate | — | the credential that lets a hostname be served over a connection a browser accepts without warning | shared |
| forge credential | — | a secret value that authenticates a build service or a merge queue to a forge, or authenticates a forge's delivery to that service | shared |
| build capacity | — | the finite memory, processor time, and store disk available on one host at one time, shared by everything running on it | world-only |
| operator | — | the person who maintains this fleet's hosts and holds the credentials its services use | world-only |
| merge queue | — | a service that takes changes a person or agent has marked ready, confirms the verdicts required of them, and advances a repository's default branch to include them | world-only |
| stack | — | an ordered chain of pull requests, one commit each, published together so that each builds on the one below it | shared |
| pull request | — | a forge's proposal to include a set of commits in a branch, carrying a state of open, closed, or merged | shared |
| default branch | — | the branch of a forge-hosted repository that a landing advances and that the forge treats as the repository's trunk | shared |
| landing | — | the act by which a change becomes part of the default branch, however it is performed | world-only |
| fast-forward | — | advancing a branch to a commit that already contains the branch's tip, so no new commit is created | shared |
| merge | world | a change becoming part of the default branch, however achieved | world-only |
| merge | machine | a commit object with more than one parent | machine-only |
| merge label | — | the label whose presence on a pull request tells a merge queue to take it | shared |
| verdict | — | a build service's published pass-or-fail outcome on a commit, one per named check run | shared |
| orchestrator | — | an agent coordinating work; the retired rollup assigned it stack assembly and sole authorization, neither of which this queue deployment requires | world-only |
| auto-merge | — | a forge's own setting on a pull request asking the forge to merge it once its required checks pass | shared |
| collaborator set | — | the identities a forge lists as able to write to a repository | world-only |
| bypass actor | — | an identity a repository's forge-side protection exempts from its rules | shared |
| landing settings | — | the values that decide how a merge queue lands: how many changes it tests together, whether an up-to-date change skips a further build, which verdicts it requires, and which label it watches | shared |
| queue entry | — | one change a merge queue holds as a single unit of work, whether that change is one pull request or a stack taken from its top | shared |
| batch | — | the set of queue entries a merge queue tests together as one unit, and the commit that set produces | shared |

#### Scenario: A term resolves to two phenomena

- **WHEN** a content term used in a behavioral requirement denotes two distinct phenomena within this repository's vocabulary
- **THEN** this designation table records both senses as separate rows rather than collapsing them into one

#### Scenario: A behavioral requirement uses an unlisted term

- **WHEN** the designation lint finds a content noun in a behavioral requirement that resolves to no row in this table
- **THEN** the noun is either added here as a world or shared phenomenon, or the requirement using it is redirected toward the interface stratum, and neither disposition is applied silently
