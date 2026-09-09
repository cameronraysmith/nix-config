# world-assumptions Specification

## Purpose
TBD - created by archiving change extract-world-assumptions. Update Purpose after archive.

## Requirements

### Requirement: A1 — No native permission system

It is true of Pi's execution environment, independent of what this fleet builds, that Pi ships no built-in mechanism to gate, approve, or defer a tool call pending human interactive confirmation.
Any requirement whose discharge depends on this fact SHALL name it explicitly rather than restating it as unattributed justification prose, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: Pi gains a native permission system

- **WHEN** a Pi release ships a built-in mechanism to gate, approve, or defer a tool call pending human interactive confirmation
- **THEN** this assumption is void, and the `pi-agent-environment` requirements `Permission-gate reuse`, `Non-Bash edit and write policy`, and `Fail-open policy` lose the discharge argument that currently rests on enforcing policy entirely through first-party and third-party extensions rather than a native mechanism

### Requirement: A2 — Unanswerable dialog stalls a session with UI but no human present

It is true of a Pi session that has a UI channel, independent of what this fleet builds, that a dialog left unanswered because no human is present to answer it stalls that session indefinitely, unless some other responder on the event bus answers in the human's place.
A session with no UI channel at all is not covered by this claim: no dialog is ever shown to a session without a UI, so the stall this assumption describes cannot arise there.
The reachable condition is therefore the inverse of headlessness — a UI channel present, a human absent — not the mere absence of a UI.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: An unanswerable dialog stops stalling a session with UI but no human present

- **WHEN** Pi or its host harness gains a way to hold an unresolved interactive prompt open on a session that has a UI channel but no human present, without blocking that session's progress, such as a default-on-timeout or a standing event-bus responder that answers in the human's place
- **THEN** this assumption is void, and the `pi-agent-environment` requirements `Additional shell policy`'s prompted decision class, `Non-Bash edit and write policy`'s notify-and-allow class, and `Fail-open policy`'s prohibition on requiring an interactive answer lose the discharge argument that currently rests on prompting being unsafe for a session with UI but no human present

### Requirement: A3 — Policy failure carries no safety evidence

It is true of the first-party and third-party policy machinery, independent of what this fleet builds, that a parser error, a core or adapter exception, an ambiguous repository state, or a missing or throwing capability establishes nothing about whether the mutation it was evaluating is actually unsafe.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge, for the specific failure mode found to carry evidence, once this assumption's violation condition below is observed.

#### Scenario: A failure mode is shown to correlate with an unsafe mutation

- **WHEN** a specific parser, decision, adapter, repository, or capability failure mode is shown, by incident or audit, to correlate with an actually unsafe mutation rather than with an indeterminate but harmless state
- **THEN** this assumption is void for that specific failure mode, and the `pi-agent-environment` requirements `Non-Bash edit and write policy`, `Git default-branch boundary`, `Jj diamond boundary`, and `Fail-open policy` lose the discharge argument for treating that failure as announce-and-allow rather than refuse

### Requirement: A4 — Refusing on ambiguity has a real cost and prevents nothing

It is true of this fleet's operating history, independent of what is built, that refusing an edit or write on an ambiguous or indeterminate policy state has cost every edit and write in the affected repository while having prevented no unsafe mutation.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: A refusal on ambiguity is found to have prevented an unsafe mutation

- **WHEN** an audit of previously refused ambiguous cases finds at least one instance where the refusal actually prevented an unsafe mutation, rather than merely costing productivity
- **THEN** this assumption is void, and the `pi-agent-environment` requirements `Non-Bash edit and write policy` and `Fail-open policy` lose the discharge argument for preferring announce-and-allow over refuse on ambiguity

### Requirement: A5 — A tracked target is recoverable from repository history

It is true of a version-controlled repository, independent of what this fleet builds, that a target tracked by that repository's version control can be recovered from its history after an unwanted mutation.
This assumption does not extend to a target that is inside a repository's working tree but is both untracked and matched by an ignore rule, because no commit, stash, or reflog entry of that repository covers such a target; the sharp edge is recorded here rather than left implicit.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge, for the targets it does not cover, whether or not this assumption's general form is ever violated.

#### Scenario: A mutation targets an untracked, gitignored file inside a repository

- **WHEN** a proposed mutation's target is inside a repository's working tree, is not tracked by that repository's version control, and is matched by an ignore rule, so no commit, stash, or reflog entry of that repository covers it
- **THEN** this assumption does not hold for that target, and the `pi-agent-environment` requirements `Non-Bash edit and write policy`, `Git default-branch boundary`, and `Jj diamond boundary` announce-and-allow a mutation their own governing text describes as refusable, because the target is in fact unrecoverable by the repository's history despite being inside the repository

### Requirement: A6 — Atomic inherits Pi's configuration root unconditionally

It is true of the atomic harness as currently released, independent of what this fleet builds, that atomic inherits Pi's configuration root and loads every extension in Pi's extension directory unconditionally, with no per-extension opt-out atomic itself exposes.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: Atomic gains conditional extension-directory loading

- **WHEN** a future atomic release adds its own configuration root, or makes loading Pi's extension directory conditional or opt-in rather than unconditional
- **THEN** this assumption is void, and the `pi-agent-environment` requirement `Non-Bash edit and write policy`'s obligation to declare Pi-only extensions as force-excludes to atomic loses the discharge argument for why that declaration is necessary at all

### Requirement: A7 — Pi's enumerated path forms are exhaustive

It is true of Pi's own path resolution, independent of what this fleet builds, that the forms this fleet's policy enumerates — the `@` prefix, a leading `~`, a `file://` URL, and Unicode space variants — are the complete set of forms Pi itself accepts when opening a tool-call target.
This is a measurement-fidelity assumption in Parnas' sense: the normalized path the policy computes is an input register standing in for the path Pi actually opens, and the two coincide only while this assumption holds.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: Pi accepts a path form outside the enumerated set

- **WHEN** Pi's own path resolution accepts a path form not among the `@` prefix, a leading `~`, a `file://` URL, or a Unicode space variant
- **THEN** the normalized register this assumption backs no longer matches the monitored quantity it stands in for, and the `pi-agent-environment` requirements `Non-Bash edit and write policy`, `Git default-branch boundary`, and `Jj diamond boundary` lose the discharge argument that the path the policy judges is the path the tool opens

### Requirement: A8 — Jj's outside-repository diagnostic is stable

It is true of the pinned jj release, independent of what this fleet builds, that jj's outside-repository diagnostic has a stable textual form followed by trailing `Hint:` advisory lines, and that this shape is what this fleet's Git-branch fallback and repository-health probes parse.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: Jj changes its outside-repository diagnostic shape

- **WHEN** a jj release changes the wording, exit code, or trailing `Hint:` line shape of its outside-repository diagnostic
- **THEN** this assumption is void, and the `pi-agent-environment` requirements `Git default-branch boundary` and `Jj diamond boundary` lose the discharge argument for falling through to the Git branch check or classifying repository health from that probe's output

### Requirement: Grounded vocabulary for behavioral requirements

The corpus SHALL provide one designation record per content term this repository's `behavioral`-stratum requirements use, recording the term, the sense in which it is used when a term carries more than one, the world phenomenon it denotes, and whether that phenomenon is world-only, shared with the machine, or machine-only.
A term found to denote two distinct phenomena within this repository's vocabulary SHALL be recorded as two rows rather than collapsed into one.
Twelve terms carry two senses in this repository today and are disambiguated below rather than left to context: `session`, `package`, `policy`, `@`, `mutation`, `activation`, `probe`, `machine`, `host`, `interface`, `repository`, and `build service`.

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
| repository | forge-hosted | a version-controlled tree kept on a forge, whose declared outputs a build service can be asked to build | shared |
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
| forge application | — | a registered identity on a forge through which a build service acts, whose installation selection bounds the repositories that identity can see | shared |
| delivery | — | a message a forge sends a build service announcing that something happened in a repository | shared |
| check run | — | a named pass-or-fail outcome a build service publishes on a forge against a repository's commit | shared |
| required check | — | the repository's own forge-side configuration naming which check runs must pass before a change may merge | world-only |
| hostname | — | the public name at which a person reaches a service over the network | shared |
| certificate | — | the credential that lets a hostname be served over a connection a browser accepts without warning | shared |
| forge credential | — | a secret value that authenticates a build service to a forge, or authenticates a forge's delivery to that service | shared |
| build capacity | — | the finite memory, processor time, and store disk available on one host at one time, shared by everything running on it | world-only |
| operator | — | the person who maintains this fleet's hosts and holds the credentials its services use | world-only |
| suspended state | — | a low-power state in which a host stops running entirely and does nothing further until a wake source rouses it | world-only |
| inactivity | — | an elapsed interval during which no person operates a host's own keyboard, pointer, or panel | world-only |
| wake source | — | a physical or electrical event a suspended host will resume for, such as a control pressed on the machine itself | shared |
| panel | — | the display built into a laptop, which is the surface a person standing at that machine looks at | shared |
| login screen | — | the state in which a host displays a credential prompt at its panel and no person is logged in | shared |
| desktop session | — | the state in which a person is logged in at a host's panel and interacting with a graphical desktop | shared |
| settings panel | — | the interface a desktop offers a person for changing that desktop's own settings, at the machine | shared |
| power source | — | whether a laptop is drawing from mains power or from its own battery | shared |

#### Scenario: A term resolves to two phenomena

- **WHEN** a content term used in a behavioral requirement denotes two distinct phenomena within this repository's vocabulary
- **THEN** this designation table records both senses as separate rows rather than collapsing them into one

#### Scenario: A behavioral requirement uses an unlisted term

- **WHEN** the designation lint finds a content noun in a behavioral requirement that resolves to no row in this table
- **THEN** the noun is either added here as a world or shared phenomenon, or the requirement using it is redirected toward the interface stratum, and neither disposition is applied silently

### Requirement: A13 — Resuming this laptop from a suspended state is unreliable, and recovering a failed resume requires a person at the machine

It is true of this fleet's bare-metal Apple laptop, independent of what this fleet configures on it, that a host which enters a suspended state sometimes never runs again — measured at 7 failures against 30 successes across 14 boots, with no distinguishing record left behind and no identified mechanism — and that the duration of the suspended interval does not predict which outcome occurs.
It is further true of this host that its only remaining wake source is a physical control on the machine itself, so a host that fails to resume, and a host that resumes without anyone present to press that control, are indistinguishable from anywhere but the machine.
An automatic suspend is therefore a cost taken on behalf of a person who is by definition absent, and a deliberate suspend is a cost taken by someone standing there.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: Resume becomes reliable, or a wake source reachable from elsewhere appears

- **WHEN** this host is observed to resume from a suspended state across a run of attempts long enough to distinguish it from the recorded failure rate, or a wake source becomes available that a person not at the machine can trigger
- **THEN** this assumption is void, and the `graphical-desktop-session` requirement `The laptop does not suspend itself when nobody is using it` loses the reason it exists, becoming a preference about power use rather than an avoidance of a known harm
