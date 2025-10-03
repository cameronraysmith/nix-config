# Architectural patterns

- Emphasize type-safety and functional programming patterns as feasible within each programming language or framework's ecosystem.
- Use relevant libraries to achieve functional programming and type-safety where languages don't natively support it (e.g., basedpyright, beartype, and dbrattli/Expression in Python, Effect-TS in TypeScript, ZIO in Scala).
- Balance practical implementation constraints against the theoretical ideal of composable, lawful abstractions.
- Design cross-language integrations to preserve functional composition, monadic structure, and explicit effect handling at API/FFI boundaries.
- Encode all effects explicitly in type signatures at language boundaries to avoid hidden side effects or runtime surprises.
- Ensure `bind`/`flatMap` operations satisfy monad laws across language boundaries when composing multi-language systems.
- Implement lift operations to allow values to traverse effect transformer stacks between language layers (`liftIO`, `liftState`, etc.).
- Structure multi-language systems as monad transformer stacks where each language implements a specific effect transformer over the layers below it (e.g., Rust base `IO`/`Result`, TypeScript middle `StateT s (EitherT e IO)`, Python top `ReaderT config (StateT s (EitherT e IO))`).
- Use `Result`/`Either`/`Option` types for error handling that composes vertically through all layers rather than runtime exceptions.
- Thread state explicitly through function parameters or state monads rather than hiding it in global mutable variables.
- Isolate IO and unsafe effects to specific layers or boundaries rather than scattering them throughout the codebase.
- Compose async/concurrency via effect systems or monad transformers rather than ad-hoc callbacks or unstructured promises.
- Maintain the ideal that multi-language system integration should behave as a coherent monad transformer stack in the category of functional effects, preserving referential transparency end-to-end.
