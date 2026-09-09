## ADDED Requirements

### Requirement: A9 — A forge application's installation selection bounds what a build service can see, and its delivery secret authenticates what it is told

It is true of the forge this fleet uses, independent of what this fleet builds, that a build service acting through a forge application sees only the repositories that application's installation selection covers, that a delivery announcing a repository event is authenticated by a secret shared between the forge and the recipient, and that a published check run is namespaced by the name the publishing service supplies rather than by any identity the forge assigns it.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: A forge stops bounding visibility by installation selection, stops authenticating deliveries, or stops honoring supplied verdict names

- **WHEN** the forge grants a build service visibility of a repository outside its forge application's installation selection, accepts or forwards a delivery that carries no valid shared secret, or publishes a check run under a name the publishing service did not supply
- **THEN** this assumption is void, and the `nixbot-build-service` requirements `Repositories are built only once opted in`, `Deliveries a build service acts on are authenticated`, and `A second build service's verdicts do not gate merges` lose the discharge argument that rests on installation selection, on a shared delivery secret, and on service-supplied verdict names respectively

### Requirement: A10 — A hostname that resolves to a host and is reachable can obtain a certificate, and issuance is rate-limited

It is true of the public naming system and of the certificate authority this fleet uses, independent of what this fleet builds, that a hostname resolving to a reachable host can obtain a certificate for that name without a person intervening, that a name whose traffic is intercepted by an intermediary before reaching the host cannot complete that issuance, and that the number of certificates obtainable in a period is finite.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: Issuance for a resolvable, reachable hostname stops being automatic or stops being available

- **WHEN** a hostname that resolves to the host and is reachable from the public network cannot obtain a certificate without a person intervening, or issuance is refused because the period's limit is exhausted
- **THEN** this assumption is void, and the `nixbot-build-service` requirement `A second build service is reachable at its own hostname` loses the discharge argument that a declared, unintercepted hostname yields a served certificate at activation

### Requirement: A11 — One host's build capacity is finite and shared by everything on it

It is true of a host in this fleet, independent of what this fleet builds, that its memory, its processor time, and the disk its store occupies are finite, that every service on that host draws from those same quantities, and that a second service evaluating and building draws from the pool the first one already uses.
Capacity is therefore a property of the host rather than of any one service's configuration, and sizing one service in isolation establishes nothing about the pair.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: A second build service's draw stops coming from the same pool

- **WHEN** a build service on the host performs its evaluation and its builds somewhere other than that host, so that its draw no longer comes from the same memory, processor, and store as the incumbent's
- **THEN** this assumption no longer governs the pair, and the `nixbot-build-service` requirement `A second build service is sized against the capacity the incumbent uses` loses the reason its sizing argument exists, becoming a statement about a quantity the two services no longer share

### Requirement: A12 — Which service's verdict gates a merge is the forge's configuration, not the host's

It is true of the forge this fleet uses, independent of what this fleet builds, that a repository's own configuration names which check runs must pass before a change may merge, so a verdict published under a name that configuration does not name is advisory no matter how authoritative the service publishing it believes itself to be.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: A repository's configuration comes to name a second build service's verdicts

- **WHEN** a repository's forge-side configuration is edited to require a check run published under a second build service's namespace, or the forge begins gating merges on verdicts its configuration does not name
- **THEN** this assumption no longer holds for that repository, and the `nixbot-build-service` requirement `A second build service's verdicts do not gate merges` loses its discharge for that repository, because the distinctness of the namespace no longer implies the verdict is advisory

---

## MODIFIED Requirements

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
