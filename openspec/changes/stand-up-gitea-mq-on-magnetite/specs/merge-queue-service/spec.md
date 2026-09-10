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

### Requirement: Landing advances the default branch to a tested commit

The merge queue SHALL test queued changes together, up to twenty queue entries at a time, and SHALL advance the default branch only to a commit whose content the build service has already reported on, by an ancestry-checked update that creates no commit the build service has not seen.
A single queued change whose head already contains the default branch's tip MAY land that head without a further build.

**Discharged by**: `merge-queue-interface` requirement `The four landing settings are evaluated values guarded by an assertion`, resting on world assumptions `A22 — gitea-mq resolves stacks only through GitHub's Stacks API`, `A23 — GitHub marks a fast-forwarded stack member merged`, and `A26 — the batch engine advances the target to the exact tested commit`.

#### Scenario: Several ready changes are tested together

- **WHEN** between two and twenty ready queue entries targeting the same branch are selected together for a batch
- **THEN** the queue tests them as one unit and, on a pass, advances the default branch to the commit that was tested, so that what lands is what was tested even when the unit contains merge commits

#### Scenario: An authorized publisher labels the intended top of a stack

- **WHEN** an authorized person or agent labels the topmost intended PR of a verified registered stack, its head contains every intended lower member, and no member has auto-merge enabled
- **THEN** the selected stack prefix contributes one queue entry regardless of its depth, and after the default branch advances, every landed member reads as merged on the forge under A23

#### Scenario: The default branch moves during a landing

- **WHEN** another update moves the default branch incompatibly with the queue's tested SHA while the queue is landing
- **THEN** the forge refuses the non-force update, the queue rebuilds twice, and on the third consecutive rejection removes the affected entries with a comment naming the cause

### Requirement: The queue gates on the build service's verdicts and nothing else

The merge queue SHALL consider a change ready to land only when the build service's three verdicts, its evaluation verdict, build verdict, and effects verdict, are all passed on the commit it tests, and SHALL NOT require any other check run beyond its own, whether or not those verdicts were published before the change was queued.

**Discharged by**: `merge-queue-interface` requirements `The four landing settings are evaluated values guarded by an assertion` and `The default branch is governed by two rulesets`, resting on world assumption `A25 — gitea-mq takes required checks from the forge's protection before its own list`.

#### Scenario: Verdicts were published before the change was queued

- **WHEN** a single up-to-date entry's head already carries all three successful build-service verdicts before authorization and the queue takes the head shortcut without a later rebuild
- **THEN** the queue accepts the existing head verdicts for enqueue and landing without requiring a new check run or an arrive-after-enqueue timestamp

#### Scenario: One verdict is failed

- **WHEN** a tested batch fails any required build-service verdict
- **THEN** the queue withholds that batch's landing and bisects a multi-entry batch, or ejects a failing singleton with a comment naming the failed verdict; any surviving subset must pass on its tested SHA before landing

#### Scenario: The forge's own protection names one verdict only

- **WHEN** the repository's forge-side protection on the default branch comes to name one of the build service's three verdicts and neither of the others
- **THEN** the queue gates on that single verdict, because it prefers the forge's list whenever that list is non-empty, which is why all three verdicts are required in our own ruleset rather than left to the queue's configured fallback

### Requirement: The queue acts under its own identity

The merge queue SHALL act on the forge under a forge application of its own, separate from the build service's, holding the permissions a queue needs and that a build service must never hold, and the build service's own registration SHALL remain unedited.

**Discharged by**: `merge-queue-interface` requirement `The forge application holds exactly the queue's permission and event set`, resting on world assumption `A9 — A forge application's installation selection bounds what a build service can see, and its delivery secret authenticates what it is told`.

#### Scenario: The queue advances the default branch

- **WHEN** the queue advances the default branch or edits the repository's protection
- **THEN** the forge records the act under the queue's forge application and not under the build service's

#### Scenario: The build service's registration is read after the queue is stood up

- **WHEN** a person reads the build service's forge application after the queue exists
- **THEN** its permissions, events, and installation selection are what they were before

### Requirement: The enqueue signal is exposed as merge authorization

The fleet SHALL document the merge label and native auto-merge as merge-authorization signals accepted by a review-blind queue, and SHALL NOT claim that this deployment enforces review or restricts authorization to an orchestrator.
The earlier orchestrator-only requirement is retired with the rollup: risk class governs when review is needed, while PR shape governs which signal targets the intended branch (ADR R15/R16, implemented by sibling work).

**Discharged by**: `merge-queue-interface` requirement `This capability states its own trust boundary`, resting on world assumptions `A24 — gitea-mq enqueues auto-merge-enabled pull requests and its setup enables allow_auto_merge`, `A27 — the queue is review-blind and the enqueue signal is the merge authorization`, and `A28 — native stack members are based on one another`.

#### Scenario: The authorization boundary is read

- **WHEN** a person or agent reads this deployment's authorization interface
- **THEN** it identifies review-before-signal under E1 as a sibling convention, ordinary trunk PR auto-merge and registered-stack top label as distinct signals, and the prohibition on auto-merge on every stack member

#### Scenario: An approving-review rule is proposed as a queue gate

- **WHEN** someone treats an approving-review rule as enforcement of review before this queue lands
- **THEN** the documented boundary identifies that claim as unsupported because the queue reads no approval state and its App bypasses the rule when updating the ref

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

The settings that decide how the merge queue lands — how many entries it tests together, that an up-to-date change skips a further build, which verdicts it names as its configured fallback, and that the merge label is `merge-queue` — SHALL be fixed such that a change to any of them is refused before the host can be activated.

**Discharged by**: `merge-queue-interface` requirement `The four landing settings are evaluated values guarded by an assertion`.

#### Scenario: A setting is edited

- **WHEN** any of the four landing settings is edited in the repository, by the aspect that sets it or by any other module
- **THEN** the host's configuration fails to evaluate with a message naming the setting, and no activation can proceed from it

#### Scenario: The settings are unchanged

- **WHEN** the host's configuration is evaluated with the four settings at their fixed values
- **THEN** it evaluates; after activation, the runtime environment is checked separately to confirm those values
