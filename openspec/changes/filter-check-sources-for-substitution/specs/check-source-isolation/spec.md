## ADDED Requirements

### Requirement: A flake check's derivation references only the source it reads

Every derivation exposed as `checks.<system>.<name>` outside the whole-tree allow-list SHALL have a transitive input closure that does not contain the flake source store path, the path `self.outPath` names for the evaluated revision.
A check that inspects files of the repository SHALL receive them as a `lib.fileset.toSource` over the subtree it inspects, or as a path literal to the file it reads, and MUST NOT receive them as `self`, `${self}/...`, or `inputs.self + "/..."`.
A system or home toplevel exposed as a check SHALL satisfy the same property, so a module that names a repository file for such a toplevel MUST name it as a path literal relative to the module file.

This interface establishes which store paths a check derivation references, observable in the derivation graph at evaluation and in the local store after instantiation.
It does not establish that the filtered source contains every file the check reads, that a substituter holds the derivation's output, or that any build service classifies the derivation as cached.

#### Scenario: An unrelated tracked file changes

- **WHEN** a tracked file that no check outside the allow-list reads is modified and the check set is evaluated again
- **THEN** every `checks.<system>.<name>` outside the allow-list evaluates to the same `drvPath` as before the modification

#### Scenario: A file a check reads changes

- **WHEN** a file inside a check's fileset or named by its path literal is modified and the check set is evaluated again
- **THEN** that check evaluates to a different `drvPath` and checks that do not read the file evaluate to the same `drvPath`

#### Scenario: A toplevel's secrets file is referenced

- **WHEN** a home or system configuration's sops-nix manifest is instantiated
- **THEN** each `sopsFile` entry is a store path whose name is the referenced file's own basename, and the flake source store path is absent from the manifest derivation's references

### Requirement: The whole-tree allow-list is declared once with a reason per entry

The repository SHALL declare the set of checks permitted to reference the flake source as one list value exposed at `lib.checkSourceAllowList` of the flake, each entry accompanied by the reason the check reads the whole tree.
The list SHALL contain `gitleaks`, whose reason is that a credential scan must cover every tracked file.
The evaluation-time assertion and the store-side probe MUST read the allow-list from that single value.

#### Scenario: The allow-list is read by both mechanisms

- **WHEN** the structural check and the probe compute their expected offender set
- **THEN** both obtain it from `lib.checkSourceAllowList` and neither carries a second copy

#### Scenario: A check is added to the allow-list without a reason

- **WHEN** an entry is appended to `lib.checkSourceAllowList` with no accompanying reason
- **THEN** review rejects the entry; the list's shape carries the reason beside the name

### Requirement: Direct whole-tree references are asserted at evaluation time

The check `checks.<system>.structure-check-source-isolation` SHALL compute, for every other `checks.<system>.*` derivation, the set of store paths in the string context of that derivation's own attributes, SHALL collect the sorted names of those whose set contains the flake source store path, and SHALL fail its build when that collection differs from the sorted allow-list, naming the differing checks in a unified diff.
The check `checks.<system>.structure-check-source-isolation-neg` SHALL apply the same classifier to a fixture derivation with `src = self` and a fixture derivation with a filtered `lib.fileset.toSource` source and SHALL fail its build unless exactly the first fixture is classified as referencing the flake source.
The classifier MUST use only operations permitted in pure evaluation.

This interface establishes absence of direct whole-tree references among check derivations at the evaluation boundary.
It does not observe references reached only through input derivations, so a toplevel that carries the source through a module coercion is outside what it can fail on.

#### Scenario: A check author writes `src = self`

- **WHEN** a derivation outside the allow-list is added to `checks.<system>` with `self`, `${self}/...`, or `inputs.self + "/..."` among its attributes
- **THEN** `structure-check-source-isolation` fails and its diff names the new check

#### Scenario: A check is filtered

- **WHEN** a check previously classified as referencing the flake source is changed to a `lib.fileset.toSource` or path-literal source and the allow-list is unchanged
- **THEN** `structure-check-source-isolation` fails until the allow-list shrinks to match, and passes once it does

#### Scenario: The classifier stops discriminating

- **WHEN** the classifier is changed so that a `src = self` fixture and a filtered fixture are classified alike
- **THEN** `structure-check-source-isolation-neg` fails

#### Scenario: Evaluation is pure

- **WHEN** `checks.<system>.structure-check-source-isolation` is evaluated without `--impure`
- **THEN** evaluation completes without reading any `.drv` file or calling `builtins.storePath`

### Requirement: Transitive whole-tree references are asserted by a store-side probe

The repository SHALL provide `just check-source-audit [system]`, backed by `scripts/check-source-audit.sh`, which SHALL evaluate the `drvPath` of every `checks.<system>.*` attribute, SHALL query the local store for each derivation's transitive requisites, SHALL print one row per check stating whether the flake source store path is among them, and SHALL exit nonzero when the set of checks referencing the source differs from `lib.checkSourceAllowList`.
The probe SHALL default `system` to the evaluating machine's system as `check-fast` does.

This interface establishes absence of the flake source in the transitive closure of each check derivation as recorded in one local store for one revision.
It does not run inside evaluation or a build and therefore is not part of `nix flake check`; where it runs recurrently is outside this capability.

#### Scenario: The probe finds only the allow-list

- **WHEN** `just check-source-audit` runs on aarch64-darwin or x86_64-linux at a revision where only `gitleaks` references the source
- **THEN** the table marks `gitleaks` alone and the recipe exits 0

#### Scenario: A module coercion regresses a toplevel

- **WHEN** a home or system module reintroduces `inputs.self + "/..."` and the probe runs
- **THEN** every toplevel check carrying that module is marked as referencing the source and the recipe exits nonzero
