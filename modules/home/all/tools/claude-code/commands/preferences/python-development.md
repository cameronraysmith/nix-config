# Python Development

## Architectural patterns alignment

See @~/.claude/commands/preferences/architectural-patterns.md for overarching principles.

Python can approximate functional programming patterns through careful library selection and disciplined type usage.

### Recommended libraries for functional programming
- **Type checking**: `basedpyright` for static analysis, `beartype` for runtime validation
- **Functional utilities**: `Expression` (dbrattli/Expression) for functional composition and monadic patterns
- **Error handling**: Use `Result`/`Option` types from Expression instead of exceptions for composable error handling
- **Immutability**: `attrs` with `frozen=True` or `dataclasses` with `frozen=True` for immutable data structures
- **Type-level programming**: Leverage Python's type system with `typing` module extensions

### Functional programming patterns
- Prefer pure functions without side effects where possible
- Encode effects explicitly in function signatures and return types
- Use `Result[T, E]` and `Option[T]` for error handling instead of exceptions
- Thread state explicitly through function parameters or state monads
- Isolate IO and side effects to specific layers or boundaries

For detailed patterns on Result types, error composition, and ADT modeling in Python:
- **~/.claude/commands/preferences/railway-oriented-programming.md** - Result type implementation, bind/apply, async effects
- **~/.claude/commands/preferences/algebraic-data-types.md** - Discriminated unions with Pydantic, newtypes, domain modeling

## Development practices

- Add type annotations to all public functions and classes
- Use `basedpyright` for static type checking and beartype for runtime type checking
- Create tests using `pytest` in a src/package/tests/ directory
- Use `ruff` for linting and formatting Python code
- Use src-based layout for python projects
- Add docstrings (Google style) to public functions and classes
- Use `uv run` to execute Python scripts, not `python` or `python3`
