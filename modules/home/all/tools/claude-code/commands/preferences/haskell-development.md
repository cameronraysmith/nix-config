# Haskell Development

## Architectural patterns alignment

See @~/.claude/commands/preferences/architectural-patterns.md for overarching principles.

Haskell embodies the theoretical ideal of functional programming with native support for monad transformers, lawful abstractions, and referential transparency.
It serves as the reference model that other languages approximate with their respective libraries (Effect-TS, ZIO, etc.).

### Core patterns and libraries
- **Effect composition**: Use monad transformers from `transformers` and `mtl` for composing effects
- **Error handling**: `Either` and `Maybe` for composable error handling, no exceptions
- **State management**: `StateT` for explicit state threading through computations
- **Reader pattern**: `ReaderT` for dependency injection and configuration
- **IO isolation**: Isolate IO effects to boundaries, keep pure functions pure
- **Type-level programming**: Leverage type classes, GADTs, and type families for compile-time guarantees

### Monad transformer stacks
- Structure applications as monad transformer stacks (e.g., `ReaderT Config (StateT AppState (ExceptT Error IO))`)
- Ensure all monad instances are lawful (identity, associativity for bind)
- Use `lift` and `liftIO` to traverse effect transformer stacks
- Apply newtype wrappers for domain-specific effect stacks

### Type safety and purity
- Leverage Haskell's type system to make illegal states unrepresentable
- Use `newtype` for domain-specific types to prevent mixing incompatible values
- Encode effects explicitly in type signatures (IO, State, Reader, etc.)
- Prefer total functions; use `Maybe`/`Either` instead of partial functions
- Use smart constructors to enforce invariants at construction time

### Recommended libraries
- **Monad transformers**: `transformers`, `mtl`
- **Effect systems**: `polysemy`, `eff`, `freer-simple` for more flexible effect composition
- **Parsing**: `megaparsec`, `attoparsec` for parser combinators
- **Error handling**: `either`, `validation`, `errors` for enhanced error composition
- **Testing**: `QuickCheck` for property-based testing, `hspec` for BDD-style tests
- **Lenses**: `lens` or `optics` for functional record updates

## Code quality and tooling
- Use `hlint` for linting and style suggestions
- Use `ormolu`, `fourmolu`, or `stylish-haskell` for consistent formatting
- Enable `-Wall` and `-Wcompat` for comprehensive warnings
- Use `ghcid` for fast feedback during development
- Run `stack test` or `cabal test` before committing

## Project structure
- Use Stack or Cabal for package management
- Organize code into modules with clear public APIs
- Separate pure business logic from IO-heavy code
- Use `src/` for library code, `app/` for executables, `test/` for tests
- Document public functions with Haddock comments

## Best practices
- Write point-free style judiciously (when it improves clarity)
- Use pattern matching exhaustively
- Leverage lazy evaluation but be aware of space leaks
- Profile with `-prof` and `+RTS` flags before optimizing
- Use strict fields in data types when appropriate (`!` bang patterns)
- Consider strictness annotations for performance-critical code
