# Rust Development

## Architectural patterns alignment

See @~/.claude/commands/preferences/architectural-patterns.md for overarching principles.

Rust excels at type-safety and zero-cost abstractions, making it ideal for implementing the base IO/Result layer in multi-language monad transformer stacks.

### Recommended libraries for functional programming
- **Error handling**: Use built-in `Option<T>` and `Result<T, E>` types for composable error handling
- **Monadic error composition**: `anyhow` for application errors, `thiserror` for library errors
- **Effect composition**: `tokio` for async effects, `rayon` for parallel computation
- **Functional utilities**: `itertools` for extended iterator combinators, `either` crate for Either type
- **Type-level programming**: Use traits and generics to encode invariants at compile time

### Role in multi-language architectures
- Often serves as the base `IO`/`Result` layer in multi-language monad transformer stacks
- Provides memory-safe, high-performance foundation for effect composition
- Use `Result<T, E>` consistently to maintain composability with higher-level language layers

## Type Safety and Ownership
- Leverage Rust's type system to encode invariants at compile time
- Use `Option<T>` and `Result<T, E>` instead of null values or exceptions
- Prefer newtype patterns for domain-specific types to prevent mixing incompatible values
- Use `#[must_use]` on functions that return important values like `Result`
- Avoid `unwrap()` and `expect()` in production code; use proper error handling

## Functional Programming Patterns
- Prefer iterator chains over explicit loops when possible
- Use combinators like `map`, `filter`, `fold`, `and_then`, `or_else` for data transformations
- Leverage pattern matching exhaustively with `match` expressions
- Use algebraic data types (enums) to model state machines and domain logic
- Apply the principle of "parse, don't validate" - use types to make invalid states unrepresentable
- Consider using the `Either` pattern (via crates like `either`) for operations with two possible outcomes

## Error Handling
- Use `Result<T, E>` for recoverable errors and propagate with `?` operator
- Create custom error types using `thiserror` crate for libraries
- Use `anyhow` for application-level error handling with context
- Provide meaningful error messages with context using `.context()` or `.with_context()`

## Code Quality and Linting
- Address all `clippy` warnings before committing - run `cargo clippy --all-targets --all-features`
- Use `cargo fmt` to format code according to Rust style guidelines
- Enable additional clippy lint groups: `#![warn(clippy::all, clippy::pedantic)]`
- Consider stricter lints for critical code: `clippy::unwrap_used`, `clippy::expect_used`
- Run `cargo check` frequently during development for fast feedback

## Testing
- Write unit tests in the same file using `#[cfg(test)]` modules
- Create integration tests in the `tests/` directory
- Use property-based testing with `proptest` or `quickcheck` for complex logic
- Aim for high test coverage, especially for public APIs
- Use `cargo test` to run all tests before committing
- Consider using `cargo nextest` for faster test execution
- Write doc tests to ensure documentation examples stay current

## Performance and Optimization
- Profile before optimizing - use `cargo flamegraph` or `perf`
- Prefer zero-cost abstractions and avoid unnecessary allocations
- Use `&str` over `String` when ownership isn't needed
- Consider using `Cow<str>` for conditional ownership
- Use `Vec::with_capacity()` when the final size is known
- Leverage const generics and const evaluation where applicable

## Dependency Management
- Minimize dependencies and audit them regularly with `cargo audit`
- Prefer well-maintained crates with strong type safety
- Use `cargo tree` to understand dependency graphs
- Pin versions appropriately in Cargo.toml
- Keep dependencies updated but test thoroughly after updates

## Documentation
- Write comprehensive doc comments using `///` for public items
- Include examples in doc comments that are tested as doc tests
- Use `cargo doc --open` to review generated documentation
- Document safety invariants for `unsafe` code blocks
- Add module-level documentation with `//!`

## Project Structure
- Use workspace for multi-crate projects
- Separate library (`lib.rs`) and binary (`main.rs`) when appropriate
- Organize code into modules using `mod` and expose public API carefully with `pub`
- Use `src/bin/` for multiple binary targets in one project
