## ADDED Requirements

### Requirement: A merge queue is reachable at its own hostname

The fleet SHALL provide a merge queue on the host that runs its build service, reachable at a hostname distinct from the build service's and served with a certificate for that hostname, so that a person can reach the queue's dashboard and the forge can deliver to it.

**Discharged by**: `merge-queue-interface` requirement `A distinct hostname is served over TLS to a loopback listener`, resting on world assumption `A10 — A hostname that resolves to a host and is reachable can obtain a certificate, and issuance is rate-limited`.

#### Scenario: A person opens the queue's hostname

- **WHEN** a person opens `mq.scientistexperience.net` after the host's configuration has been activated
- **THEN** the merge queue answers at that hostname over a connection accepted without a certificate warning, and `nixbot.scientistexperience.net` continues to answer independently

#### Scenario: The queue's hostname does not resolve

- **WHEN** the hostname for the merge queue does not resolve to the host at the time of activation
- **THEN** no certificate can be obtained for it and the requirement is unmet, which is why declaring the hostname precedes activating the host

### Requirement: One up-to-date stack lands by fast-forward

The merge queue SHALL land a single queued stack whose tip already contains the default branch's tip by advancing the default branch to that tip, with no merge commit and no further build, and SHALL land nothing while a landing is in flight for that default branch.

**Discharged by**: `merge-queue-interface` requirement `The four landing settings are evaluated values guarded by an assertion`, resting on world assumptions `A22 — gitea-mq resolves stacks only through GitHub's Stacks API` and `A23 — GitHub marks a fast-forwarded stack member merged`.

#### Scenario: The orchestrator labels the top of an up-to-date stack

- **WHEN** the orchestrator applies the merge label to the top pull request of a stack whose tip contains the default branch's tip and whose tip carries the build service's two verdicts as passed
- **THEN** the default branch advances to that tip without a merge commit, and every member of the stack reads as merged on the forge

#### Scenario: The default branch moves during a landing

- **WHEN** the default branch advances by another path while the queue is landing a stack
- **THEN** the landing is refused by the forge rather than forced, the queue retries a bounded number of times, and after the bound the stack is removed from the queue with a comment naming the cause

### Requirement: The queue gates on the build service's verdicts and nothing else

The merge queue SHALL consider a stack ready to land only when the build service's two verdicts, its evaluation verdict and its build verdict, are both passed on the stack's tip, and SHALL NOT require any other check run, whether or not those verdicts were published before the stack was queued.

**Discharged by**: `merge-queue-interface` requirements `The four landing settings are evaluated values guarded by an assertion` and `The default branch is governed by the queue's ruleset`, resting on world assumption `A25 — gitea-mq takes required checks from the forge's protection before its own list`.

#### Scenario: Verdicts were published before the label

- **WHEN** both of the build service's verdicts were published as passed on the stack's tip before the orchestrator applied the merge label
- **THEN** the queue reads them as satisfied at the moment it enqueues the stack and proceeds without waiting for a further verdict

#### Scenario: One verdict is failed

- **WHEN** either of the build service's two verdicts on the stack's tip is failed
- **THEN** the queue removes the stack from the queue with a comment naming the failed verdict, and the default branch does not move

#### Scenario: The forge's own protection names a verdict

- **WHEN** the repository's forge-side protection comes to name a build-service verdict as required on the default branch
- **THEN** the queue gates on the forge's list instead of its own, which is why the protection names only the queue's own status and no build-service verdict

### Requirement: The queue acts under its own identity

The merge queue SHALL act on the forge under a forge application of its own, separate from the build service's, holding the permissions a queue needs and that a build service must never hold, and the build service's own registration SHALL remain unedited.

**Discharged by**: `merge-queue-interface` requirement `The forge application holds exactly the queue's permission and event set`, resting on world assumption `A9 — A forge application's installation selection bounds what a build service can see, and its delivery secret authenticates what it is told`.

#### Scenario: The queue advances the default branch

- **WHEN** the queue advances the default branch or edits the repository's protection
- **THEN** the forge records the act under the queue's forge application and not under the build service's

#### Scenario: The build service's registration is read after the queue is stood up

- **WHEN** a person reads the build service's forge application after the queue exists
- **THEN** its permissions, events, and installation selection are what they were before

### Requirement: Only the orchestrator puts a change into the queue

The fleet SHALL arrange that the orchestrator identity is the only identity that applies the merge label or enables auto-merge on a pull request in a managed repository, so that what the queue lands is what the orchestrator assembled.

**Discharged by**: world assumption `A24 — gitea-mq enqueues auto-merge-enabled pull requests and its setup enables allow_auto_merge`, together with the collaborator set recorded in this change's verification; no interface property can discharge this one, because who may label or enable auto-merge is the repository's collaborator set, which the machine cannot observe.

#### Scenario: The collaborator set is read

- **WHEN** the set of identities able to write to a managed repository is read on the forge
- **THEN** it contains the orchestrator identity and the fleet's forge applications and no other identity

#### Scenario: A second collaborator is added

- **WHEN** a second identity gains write access to a managed repository
- **THEN** this requirement is no longer discharged for that repository until the orchestrator's sole-enabler role is re-established by another means

### Requirement: Queue credentials are operator-supplied and never legible in the repository

Every forge credential the merge queue uses SHALL be supplied by the operator or generated at deployment, SHALL be unreadable in the repository that declares it, and rotating one SHALL take effect on the running queue rather than leaving it holding the superseded value.

**Discharged by**: `merge-queue-interface` requirement `Credentials exist only as activation-resolved systemd credentials`.

#### Scenario: The repository is read by anyone with access to it

- **WHEN** a person reads the repository that declares the merge queue
- **THEN** they find the names of its forge credentials and where each is consumed, and no credential value

#### Scenario: A credential is rotated

- **WHEN** the operator replaces the value behind one of the queue's forge credentials
- **THEN** the running queue comes to use the new value, and for the delivery secret the forge application is told the new value by the queue itself

### Requirement: One activation establishes the queue

The merge queue SHALL be established on the host by the fleet's ordinary activation act, with no step performed by hand on the host itself, so that what runs there remains a consequence of the declared configuration.

**Discharged by**: `merge-queue-interface` requirement `The service is a consequence of the host's declared configuration`.

#### Scenario: The host is activated

- **WHEN** the operator activates the host's declared configuration once, after the forge application exists, its private key has been supplied, and the hostname resolves
- **THEN** the merge queue is running, reachable at its hostname, holding its own database, with nothing further done by hand on the host

#### Scenario: The host is activated again from the same declaration

- **WHEN** the operator activates the same declared configuration a second time
- **THEN** the merge queue is in the same condition as after the first activation, because no by-hand step exists for a repeat activation to lose

### Requirement: Landing settings cannot drift unnoticed

The settings that decide how the merge queue lands — that batching is enabled, that an up-to-date stack skips a further build, that the build service's two verdicts are the required ones, and that the merge label is `merge-queue` — SHALL be fixed such that a change to any of them is refused before the host can be activated.

**Discharged by**: `merge-queue-interface` requirement `The four landing settings are evaluated values guarded by an assertion`.

#### Scenario: A setting is edited

- **WHEN** any of the four landing settings is edited in the repository, by the aspect that sets it or by any other module
- **THEN** the host's configuration fails to evaluate with a message naming the setting, and no activation can proceed from it

#### Scenario: The settings are unchanged

- **WHEN** the host's configuration is evaluated with the four settings at their fixed values
- **THEN** it evaluates, and the running queue's environment carries those values
