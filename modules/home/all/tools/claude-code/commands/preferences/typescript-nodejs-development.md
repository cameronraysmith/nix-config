# TypeScript / Node.js Development

## Architectural patterns alignment

See @~/.claude/commands/preferences/architectural-patterns.md for overarching principles.

TypeScript with Effect-TS provides excellent support for functional programming and effect management in the JavaScript ecosystem.

### Recommended libraries for functional programming
- **Effect system**: Effect-TS for composable, type-safe effects and monad transformers
- **Error handling**: Use Effect-TS's `Either`, `Option`, and `Effect` types instead of try/catch
- **Immutability**: Effect-TS's built-in immutable data structures or `immer` for updates
- **Validation**: `@effect/schema` for runtime validation and type derivation
- **Functional utilities**: Effect-TS provides comprehensive functional programming primitives

### Functional programming patterns
- Encode all effects explicitly in type signatures using Effect types
- Use `Effect<Success, Error, Requirements>` for effectful computations
- Compose effects with `flatMap`/`map`/`zip` instead of async/await when using Effect-TS
- Thread dependencies through `Context` (Reader pattern) instead of global variables
- Use `Either<E, A>` and `Option<A>` for error handling instead of null/undefined/exceptions
- Layer your application as effect transformers (similar to monad transformer stacks)

### TypeScript-specific practices
- Enable strict mode in tsconfig.json (`strict: true`)
- Leverage discriminated unions for state machines and domain modeling
- Use `const` assertions and `as const` for literal type inference
- Avoid `any` type; use `unknown` when type is truly unknown

## Development practices

- Use TypeScript over JavaScript
- Use ES modules (import/export) syntax, not CommonJS (require)
- Run type checking with `tsc --noEmit` before committing
- Use ESLint with TypeScript rules for additional safety
- Consider using Biome or Prettier for consistent formatting
