## ADDED Requirements

### Requirement: A distinct hostname is served over TLS to a loopback listener

The machine SHALL serve the merge queue at one hostname of its own, distinct from the build services', with a certificate obtained for that hostname, and SHALL forward requests to the queue's listener bound to the loopback address on a port no other service on the host binds.

#### Scenario: A request arrives for the queue's hostname

- **WHEN** a request arrives for the merge queue's hostname on the host's public interface
- **THEN** it is answered over a connection secured by a certificate issued for that hostname and forwarded to the queue's loopback listener

#### Scenario: The listener's port is read

- **WHEN** the host's listening ports are enumerated after activation
- **THEN** the queue holds exactly one, bound to the loopback address, and in particular its upstream default port, which another service on this host already binds on every interface, is not the one it holds

### Requirement: The four landing settings are evaluated values guarded by an assertion

The machine's evaluated configuration SHALL carry the queue's batch maximum as `0`, its up-to-date shortcut as enabled, its fallback required checks as exactly `nixbot/nix-eval` and `nixbot/nix-build`, and no override of the merge label on the queue's unit, and SHALL refuse to evaluate when the merged configuration differs from those values.

#### Scenario: The evaluated options are read

- **WHEN** the queue's options are read from the host's evaluated configuration
- **THEN** the batch maximum is `0`, the up-to-date shortcut is enabled, the fallback required checks are exactly the two build-service contexts, and the unit's environment carries no merge-label attribute

#### Scenario: Another module forces a different value

- **WHEN** any module forces one of the three options to another value, or sets a merge-label attribute on the unit's environment
- **THEN** evaluation of the host's configuration fails with a message naming the setting

#### Scenario: The unit's environment is read on the host

- **WHEN** the queue's unit environment is read on the host after activation
- **THEN** it carries the batch maximum `0`, the up-to-date shortcut `true`, the two contexts as the required-checks list, and no merge-label variable, so the queue's own default of `merge-queue` is in force

### Requirement: A database and role exist for the unit's dynamic user

The machine SHALL provision, on the host's existing database instance, a database and an owning role both named for the queue's unit, so that the unit's transient user, which takes its name from the unit, authenticates over the local socket by peer identity with no password and no static user.

#### Scenario: The queue starts for the first time

- **WHEN** the queue's unit starts against an empty database
- **THEN** it connects over the local socket as the role named for the unit, applies its schema, and records no authentication error

#### Scenario: The unit's name and the role's name diverge

- **WHEN** the unit is renamed or given a static user whose name differs from the role's
- **THEN** peer authentication fails and the queue does not start, which is why the coupling is recorded in the design rather than left to be rediscovered

### Requirement: Credentials exist only as activation-resolved systemd credentials

Each forge credential the merge queue uses SHALL reach it as a systemd credential loaded from a path resolved when the host's configuration is activated, owned by root and readable by no other static user, and the unit SHALL be restarted when the value behind such a path is replaced.

#### Scenario: The unit starts

- **WHEN** the queue's unit starts
- **THEN** its private key and delivery secret are present under the unit's credentials directory, loaded from root-owned files that exist on the host, and no credential value exists in the configuration that produced them

#### Scenario: A credential's value is replaced

- **WHEN** the value behind one of those paths is replaced
- **THEN** the unit is restarted, because the values it holds were taken when it started

### Requirement: The forge application holds exactly the queue's permission and event set

The forge application the merge queue acts through SHALL hold repository permissions Contents read and write, Administration read and write, Checks read and write, Pull requests read and write, Commit statuses read, and Metadata read, SHALL configure subscriptions to `check_run`, `pull_request`, and `status`, and SHALL be a registration distinct from the build service's. GitHub automatically delivers `installation` and `installation_repositories` to every App; these cannot be subscribed to and SHALL NOT be required in the API `events` array.
The application SHALL be installed on `cameronraysmith/vanixiets` alone, and the machine SHALL retain `github.repos = [ "cameronraysmith/vanixiets" ]` as additive explicit registration, not an exclusion filter.
Installation scope supplies confinement and is externally maintained forge state, not a restriction enforced by this NixOS configuration.
Before deployment authorization, verification SHALL establish the one-repository installation scope through complete enumeration of all App installations and the repositories available to each, with pagination where applicable, or equivalent complete operator-page evidence.
The target-repository installation endpoint alone cannot establish exclusivity; missing or incomplete evidence SHALL prevent deployment authorization.

#### Scenario: The application is read on the forge

- **WHEN** the forge application's registration is read through the forge's API
- **THEN** its permissions are exactly the set above, its `events` array contains all three required subscribable events (extra reported entries SHALL be recorded without blocking; any missing required event SHALL block), automatic installation deliveries are recorded separately, and its numeric id differs from the build service's application id

#### Scenario: The application is installed more broadly than intended

- **WHEN** the forge application is installed on any repository beyond `cameronraysmith/vanixiets`
- **THEN** the one-repository boundary is violated and deployment authorization is withheld, because installation discovery adds those repositories independently of `github.repos`; the explicit list does not filter them out

### Requirement: The default branch is governed by the queue's ruleset

The managed repository's default branch SHALL be governed by a ruleset that requires linear history and the queue's own status, names the queue's forge application and the orchestrator identity as bypass actors, requires no build-service check at the pull-request level, and involves no Actions workflow, and the repository's `allow_auto_merge` setting SHALL be left as the queue sets it.

#### Scenario: The ruleset is read on the forge

- **WHEN** the default branch's rulesets are read through the forge's API after the queue has started
- **THEN** exactly one ruleset governs it, its required status checks name only the queue's status pinned to the queue's application, its bypass actors are the queue's application and the orchestrator identity, and no build-service context is required

#### Scenario: The queue's startup setup runs

- **WHEN** the queue starts and performs its repository setup
- **THEN** it finds the ruleset already present, adds nothing, and leaves `allow_auto_merge` enabled

#### Scenario: A build-service context is added to the ruleset

- **WHEN** a build-service context is added as a required status check on the default branch
- **THEN** the queue gates on the forge's list and stops consulting its configured pair, which is the drift the behavioral requirement `The queue gates on the build service's verdicts and nothing else` names

### Requirement: The service registers its own webhook endpoint

The machine SHALL present the queue's delivery endpoint at `<externalUrl>/webhook/github` and the queue SHALL, at each start, patch the forge application's webhook URL and delivery secret to that endpoint and the host's current secret, so that no delivery setting is maintained by hand on the forge.

#### Scenario: The queue starts

- **WHEN** the queue's unit starts with a delivery secret on the host
- **THEN** the forge application's webhook URL reads the queue's endpoint and deliveries signed with the host's secret are accepted

#### Scenario: A delivery is presented without the host's secret

- **WHEN** a delivery is presented at the queue's endpoint without a signature from the host's secret
- **THEN** it is rejected, and no queue action results from it

### Requirement: The service is a consequence of the host's declared configuration

What the merge queue runs SHALL be determined by the host's declared configuration at the moment it was activated, and SHALL NOT be fetched or updated independently of that activation.

#### Scenario: The host's declaration is instantiated without deploying it

- **WHEN** the host's declared configuration is instantiated as a check, before any deployment
- **THEN** the instantiation either succeeds, establishing that the declaration and its assertions are coherent, or fails, and no state on the host has changed either way

#### Scenario: The declaration is unchanged but time passes

- **WHEN** time passes with no change to the host's declared configuration
- **THEN** the version of the queue that runs does not change, because nothing outside activation selects it

### Requirement: This capability states its own trust boundary

This capability SHALL state what its properties guarantee and what they do not, and SHALL NOT be described, by itself or in any downstream report, as an end-to-end guarantee that only orchestrator-assembled stacks land or that the build services are unaffected.

#### Scenario: The properties above are read as a set

- **WHEN** the properties of this capability are read as a set
- **THEN** what they establish is that the queue is reached at its own hostname over its own certificate through a loopback listener, that its four landing settings are fixed at evaluation and visible at runtime, that its database and role are its own, that its credentials exist only as activation-resolved systemd credentials, that its forge application holds exactly the stated set, that the default branch's ruleset names only the queue's status, that the queue maintains its own delivery endpoint, and that what runs is a consequence of the host's declared configuration

#### Scenario: A guarantee about who can enqueue is sought from this capability

- **WHEN** someone asks whether these properties guarantee that only the orchestrator can put a change into the queue
- **THEN** the answer is no: the merge label and auto-merge can be applied by any identity with write access to the repository, and that set is the forge's collaborator list, which this machine cannot observe

#### Scenario: A guarantee about the landed state is sought from this capability

- **WHEN** someone asks whether these properties guarantee that members of a fast-forwarded stack read as merged on the forge
- **THEN** the answer is no: whether the forge marks a member merged when its head becomes reachable from the default branch is the forge's behavior, carried as a world assumption and tested by the landing protocol change rather than asserted here

#### Scenario: A guarantee about the running process is sought from this capability

- **WHEN** someone asks whether the evaluation-time assertion guarantees the running queue's settings
- **THEN** the answer is no: the assertion guards the evaluated configuration, and a process started outside the unit or an edit to the unit's environment on the host is invisible to it, which is why the runtime scenario reads the environment on the host
