## ADDED Requirements

### Requirement: A22 — gitea-mq resolves stacks only through GitHub's Stacks API

It is true of gitea-mq at the revision this fleet pins, independent of what this fleet builds, that on the GitHub backend it learns which pull requests form a stack only by asking GitHub's Stacks API for the labeled pull request (`forge.go::ResolveStack`), that it lands the members up to and including the labeled one against the stack's base branch, and that it reads no `Depends-On:` header or pull-request body, so a stack published without native registration is a set of unrelated pull requests to it.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: gitea-mq comes to resolve stacks by another means, or stops resolving them

- **WHEN** a pinned revision of gitea-mq resolves a stack from pull-request bodies, branch chaining, or any source other than the Stacks API, or stops resolving stacks on GitHub at all
- **THEN** this assumption is void, and the `merge-queue-service` requirement `One up-to-date stack lands by fast-forward` loses the discharge argument that labeling the top pull request of a natively registered stack lands exactly its members

### Requirement: A23 — GitHub marks a fast-forwarded stack member merged

It is true of the forge this fleet uses, independent of what this fleet builds, and not yet observed, that when the default branch is advanced by a non-force ref update to a commit from which a pull request's head is reachable, the forge marks that pull request merged with a merge timestamp and leaves its head unchanged, for every member of a natively registered stack whose head the update makes reachable.
This assumption is the ADR's verification item V1; it is carried here because the landing protocol's client-side bookkeeping treats a commit as merged only when its pull request carries a merge timestamp and a head equal to the local commit, so a landing that leaves members open or closed-unmerged is not an acceptable degradation.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: A fast-forwarded member reads as open or closed rather than merged

- **WHEN** the default branch is advanced by non-force ref update to a stack's tip and any member whose head became reachable reads as open, or as closed without a merge timestamp, on the forge
- **THEN** this assumption is void, the `merge-queue-service` requirement `One up-to-date stack lands by fast-forward` loses the discharge argument that every member reads as merged, and native stack registration together with fast-forward landing of stacks is reopened as a decision rather than patched by the queue's close-with-comment fallback

### Requirement: A24 — gitea-mq enqueues auto-merge-enabled pull requests and its setup enables allow_auto_merge

It is true of gitea-mq at the revision this fleet pins, independent of what this fleet builds, that a pull request with the forge's auto-merge enabled is enqueued exactly as a labeled one is (`poller.go::enqueueAutoMergePRs`), that the queue's startup setup turns the repository's `allow_auto_merge` setting on whenever the forge application holds the Administration permission (`setup.go::EnsureRepoSetup`), and that any identity with write access to the repository can enable auto-merge on a pull request.
The merge label is therefore not the only path into the queue, and turning the repository setting off is undone at the next start.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: The auto-merge path changes shape

- **WHEN** a pinned revision of gitea-mq stops enqueuing auto-merge-enabled pull requests, stops enabling `allow_auto_merge` at startup, or gains a setting that disables either
- **THEN** this assumption no longer governs the queue, and the `merge-queue-service` requirement `Only the orchestrator puts a change into the queue` is re-examined, because its discharge by the collaborator set may then be replaceable by a machine-asserted setting

#### Scenario: A second identity gains write access

- **WHEN** an identity other than the orchestrator and the fleet's forge applications gains write access to a managed repository
- **THEN** the collaborator-set argument that discharges `Only the orchestrator puts a change into the queue` is void for that repository until re-established

### Requirement: A25 — gitea-mq takes required checks from the forge's protection before its own list

It is true of gitea-mq at the revision this fleet pins, independent of what this fleet builds, that the set of checks it requires on a target branch is the forge's own required-status-check list from rulesets and classic protection with the queue's own contexts removed, and that its configured list is consulted only when that forge list is empty (`monitor.go::ResolveRequiredChecks`, `forge.go::GetRequiredChecks`).
A forge-side requirement for any single build-service context therefore replaces the configured pair rather than adding to it.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: The resolution order changes

- **WHEN** a pinned revision of gitea-mq merges the forge's list with its configured list, prefers its configured list, or drops the forge list entirely
- **THEN** this assumption is void, and the `merge-queue-service` requirement `The queue gates on the build service's verdicts and nothing else` and the `merge-queue-interface` requirement `The default branch is governed by the queue's ruleset` lose the argument that a ruleset naming only the queue's status makes the configured pair operative

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
| orchestrator | — | the single identity, person or agent, that assembles stacks, publishes them, and marks them ready for the queue | world-only |
| auto-merge | — | a forge's own setting on a pull request asking the forge to merge it once its required checks pass | shared |
| collaborator set | — | the identities a forge lists as able to write to a repository | world-only |
| bypass actor | — | an identity a repository's forge-side protection exempts from its rules | shared |
| landing settings | — | the values that decide how a merge queue lands: whether it batches, whether an up-to-date stack skips a further build, which verdicts it requires, and which label it watches | shared |

#### Scenario: A term resolves to two phenomena

- **WHEN** a content term used in a behavioral requirement denotes two distinct phenomena within this repository's vocabulary
- **THEN** this designation table records both senses as separate rows rather than collapsing them into one

#### Scenario: A behavioral requirement uses an unlisted term

- **WHEN** the designation lint finds a content noun in a behavioral requirement that resolves to no row in this table
- **THEN** the noun is either added here as a world or shared phenomenon, or the requirement using it is redirected toward the interface stratum, and neither disposition is applied silently
