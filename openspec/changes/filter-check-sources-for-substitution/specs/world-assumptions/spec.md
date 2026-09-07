## ADDED Requirements

### Requirement: A22 — A nix derivation's identity is its transitive input closure, and a whole-tree source path changes with any tracked file

It is true of nix, independent of what this fleet builds, that a derivation's store path is computed from its inputs, that those inputs include every store path reachable through its input derivations, and that a store path produced by copying a flake's source is hashed over every tracked file in that tree, so it changes whenever any tracked file changes.
A derivation whose closure contains that path therefore takes a new identity on every commit, and a substituter holding its previous output cannot serve the new one.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: Derivation identity stops following the input closure

- **WHEN** nix computes a derivation's store path from something other than its transitive inputs, or a flake's source store path stops changing when a tracked file changes
- **THEN** this assumption is void, and the `check-source-isolation` requirements `A flake check's derivation references only the source it reads` and `Transitive whole-tree references are asserted by a store-side probe` lose the discharge argument that excluding the source path from a closure is what keeps the derivation substitutable across commits

### Requirement: A23 — A path literal or fileset inside a flake yields a store path hashed from the selected content alone

It is true of nix and of nixpkgs' `lib.fileset`, independent of what this fleet builds, that coercing a path literal inside a flake's source to a string copies that file or directory to its own store path whose hash covers only its content, and that `lib.fileset.toSource` produces a store path whose hash covers only the files the fileset selects, so neither path changes when a file outside the selection changes.
Any requirement whose discharge depends on this fact SHALL name it explicitly, and SHALL be treated as losing its discharge once this assumption's violation condition below is observed.

#### Scenario: A filtered source stops being content-addressed over its selection

- **WHEN** a path literal or `lib.fileset.toSource` inside a flake produces a store path whose hash changes when a file outside the selection changes
- **THEN** this assumption is void, and the `check-source-isolation` requirement `A flake check's derivation references only the source it reads` loses its discharge, because filtering no longer isolates the check from unrelated changes even though the whole-tree path is absent from its closure
