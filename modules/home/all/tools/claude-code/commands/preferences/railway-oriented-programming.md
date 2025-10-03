# Railway-oriented programming

## Overview

Railway-oriented programming (ROP) is a functional pattern for composing operations that can fail.
The mental model is a two-track railway: success track and failure track.
Once on the failure track, operations are skipped and errors propagate to the end.

This approach makes error handling explicit, composable, and type-safe.

## The Result type

The foundation of ROP is a discriminated union representing success or failure.

### Pattern: Result<T, E> in Python

```python
from typing import Generic, TypeVar, Union
from dataclasses import dataclass

T = TypeVar('T')
E = TypeVar('E')
U = TypeVar('U')

@dataclass
class Success(Generic[T]):
    value: T

@dataclass
class Failure(Generic[E]):
    error: E

Result = Union[Success[T], Failure[E]]

# Functions that can fail return Result
def parseInput(raw: dict) -> Result[Input, ParseError]:
    """Parse untrusted input - can fail"""
    try:
        return Success(Input(**raw))
    except Exception as e:
        return Failure(ParseError(str(e)))

def validate(input: Input) -> Result[ValidInput, ValidationError]:
    """Validate business rules - can fail"""
    errors = []
    if not input.email or '@' not in input.email:
        errors.append("email must contain @")
    if not input.name:
        errors.append("name is required")

    if errors:
        return Failure(ValidationError(errors))
    return Success(ValidInput(email=input.email, name=input.name))

# Pattern match on Result
match parseInput(data):
    case Success(input):
        print(f"Parsed: {input}")
    case Failure(error):
        print(f"Parse error: {error}")
```

### Pattern: Result in TypeScript

```typescript
// Result as discriminated union
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Constructor functions
function success<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

function failure<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}

// Functions that can fail return Result
function parseInput(raw: unknown): Result<Input, ParseError> {
  try {
    const input = Input.parse(raw);  // Zod/similar
    return success(input);
  } catch (e) {
    return failure(new ParseError(e.message));
  }
}

function validate(input: Input): Result<ValidInput, ValidationError> {
  const errors: string[] = [];

  if (!input.email || !input.email.includes('@')) {
    errors.push('email must contain @');
  }
  if (!input.name) {
    errors.push('name is required');
  }

  if (errors.length > 0) {
    return failure(new ValidationError(errors));
  }

  return success({ email: input.email, name: input.name });
}

// Pattern match with type narrowing
const result = parseInput(data);
if (result.ok) {
  console.log(`Parsed: ${result.value}`);
} else {
  console.log(`Error: ${result.error}`);
}
```

### Pattern: Result in Go

```go
// Result as struct with generics
type Result[T any] struct {
    Value T
    Error error
}

func Success[T any](value T) Result[T] {
    return Result[T]{Value: value, Error: nil}
}

func Failure[T any](err error) Result[T] {
    var zero T
    return Result[T]{Value: zero, Error: err}
}

func (r Result[T]) IsOk() bool {
    return r.Error == nil
}

func (r Result[T]) IsErr() bool {
    return r.Error != nil
}

// Functions that can fail return Result
func ParseInput(raw map[string]any) Result[Input] {
    input, err := parseInputInternal(raw)
    if err != nil {
        return Failure[Input](err)
    }
    return Success(input)
}

func Validate(input Input) Result[ValidInput] {
    if input.Email == "" || !strings.Contains(input.Email, "@") {
        return Failure[ValidInput](errors.New("email must contain @"))
    }
    if input.Name == "" {
        return Failure[ValidInput](errors.New("name is required"))
    }
    return Success(ValidInput{Email: input.Email, Name: input.Name})
}

// Check result
result := ParseInput(data)
if result.IsOk() {
    fmt.Printf("Parsed: %v\n", result.Value)
} else {
    fmt.Printf("Error: %v\n", result.Error)
}
```

## bind: Monadic composition

Chain operations that can fail - short-circuit on first error.

### Pattern: Sequential pipeline in Python

```python
from typing import Callable

def bind(result: Result[T, E], f: Callable[[T], Result[U, E]]) -> Result[U, E]:
    """
    Monadic bind: compose world-crossing functions.

    If result is Success, apply f to the value.
    If result is Failure, skip f and propagate error.
    """
    match result:
        case Success(value):
            return f(value)
        case Failure(error):
            return Failure(error)

# Infix operator for chaining
def bindAsync(
    result: Result[T, E],
    f: Callable[[T], Awaitable[Result[U, E]]]
) -> Awaitable[Result[U, E]]:
    """Bind for async operations"""
    async def inner():
        match result:
            case Success(value):
                return await f(value)
            case Failure(error):
                return Failure(error)
    return inner()

# Usage: Chain operations with short-circuit on error
def processOrder(raw: dict) -> Result[Order, Error]:
    """
    Process order through pipeline:
    1. Parse input (can fail)
    2. Validate (can fail)
    3. Save to DB (can fail)

    Stop at first error - don't waste work.
    """
    return (
        bind(parseInput(raw), lambda input:
        bind(validate(input), lambda valid:
        bind(saveToDb(valid), lambda order:
        Success(order))))
    )

# More readable with helper
class ResultMonad:
    def __init__(self, result: Result[T, E]):
        self._result = result

    def bind(self, f: Callable[[T], Result[U, E]]) -> 'ResultMonad[U, E]':
        return ResultMonad(bind(self._result, f))

    def unwrap(self) -> Result[T, E]:
        return self._result

# Fluent API
result = (
    ResultMonad(parseInput(raw))
    .bind(validate)
    .bind(saveToDb)
    .unwrap()
)
```

### Pattern: Async pipeline in Python

```python
async def processOrderAsync(raw: dict) -> Result[Order, Error]:
    """
    Async pipeline with Result:
    - Parse (sync)
    - Validate (sync)
    - Fetch from DB (async, can fail)
    - Update DB (async, can fail)
    """
    # Sync steps
    inputResult = parseInput(raw)
    validResult = bind(inputResult, validate)

    # Async steps
    match validResult:
        case Success(valid):
            userResult = await fetchUser(valid.userId)
            return await bindAsync(userResult, lambda user:
                   await updateUser(user, valid))
        case Failure(error):
            return Failure(error)

# Or with async helper
async def bindAsync(
    result: Result[T, E],
    f: Callable[[T], Awaitable[Result[U, E]]]
) -> Result[U, E]:
    match result:
        case Success(value):
            return await f(value)
        case Failure(error):
            return Failure(error)
```

### When to use bind (monadic style)

Use bind when:
- **Steps depend on previous results**: Next operation needs output of previous
- **Want to short-circuit**: Stop on first error, don't waste work
- **Database operations**: Skip writes if validation fails
- **External API calls**: Don't call next API if previous failed
- **Expensive operations**: Avoid unnecessary computation

Example scenarios:
- User registration: validate → check email not taken → create user → send email
- Order processing: validate → reserve inventory → charge card → create shipment
- Data pipeline: parse → validate → transform → load

## apply: Applicative composition

Combine independent validations and collect all errors.

### Pattern: Parallel validation in Python

```python
def apply(
    fResult: Result[Callable[[T], U], list[E]],
    xResult: Result[T, list[E]]
) -> Result[U, list[E]]:
    """
    Applicative apply: combine independent computations.

    If both Success: apply function to value.
    If either Failure: collect errors from both.
    """
    match (fResult, xResult):
        case (Success(f), Success(x)):
            return Success(f(x))
        case (Failure(e1), Success(_)):
            return Failure(e1)
        case (Success(_), Failure(e2)):
            return Failure(e2)
        case (Failure(e1), Failure(e2)):
            return Failure(e1 + e2)  # Combine error lists!

def map(f: Callable[[T], U], result: Result[T, E]) -> Result[U, E]:
    """Lift normal function to Result world"""
    match result:
        case Success(value):
            return Success(f(value))
        case Failure(error):
            return Failure(error)

# Usage: Validate all fields, collect all errors
def validateUser(raw: dict) -> Result[User, list[ValidationError]]:
    """
    Validate all fields independently.
    Returns all validation errors, not just first.
    Better UX than stopping at first error.
    """
    emailResult = validateEmail(raw.get('email'))
    nameResult = validateName(raw.get('name'))
    ageResult = validateAge(raw.get('age'))

    # Applicative style: combine all results
    # Using curried function to apply results one by one
    def makeUser(email: EmailAddress):
        def withName(name: str):
            def withAge(age: int):
                return User(email=email, name=name, age=age)
            return withAge
        return withName

    return apply(
        apply(
            map(makeUser, emailResult),
            nameResult),
        ageResult)

# Test with invalid data
result = validateUser({
    'email': 'invalid',      # Missing @
    'name': '',              # Empty
    'age': '-5'              # Negative
})

# Result is Failure with ALL three errors:
# ["email must contain @", "name is required", "age must be positive"]
```

### Pattern: Applicative in TypeScript

```typescript
function apply<T, U, E>(
  fResult: Result<(t: T) => U, E[]>,
  xResult: Result<T, E[]>
): Result<U, E[]> {
  if (fResult.ok && xResult.ok) {
    return success(fResult.value(xResult.value));
  }
  if (!fResult.ok && !xResult.ok) {
    return failure([...fResult.error, ...xResult.error]);
  }
  if (!fResult.ok) {
    return failure(fResult.error);
  }
  return failure(xResult.error);
}

function map<T, U, E>(
  f: (t: T) => U,
  result: Result<T, E>
): Result<U, E> {
  if (result.ok) {
    return success(f(result.value));
  }
  return failure(result.error);
}

// Validate all fields
function validateUser(raw: unknown): Result<User, ValidationError[]> {
  const emailResult = validateEmail(raw.email);
  const nameResult = validateName(raw.name);
  const ageResult = validateAge(raw.age);

  // Applicative composition
  const makeUser = (email: EmailAddress) =>
    (name: string) =>
    (age: number) =>
    ({ email, name, age });

  return apply(
    apply(
      map(makeUser, emailResult),
      nameResult),
    ageResult);
}
```

### When to use apply (applicative style)

Use apply when:
- **Validations are independent**: Each check doesn't need results of others
- **Want to collect all errors**: Better UX to show all problems at once
- **Can run in parallel**: No dependencies means potential parallelism
- **Form validation**: Show all field errors to user

Example scenarios:
- User input validation: email, name, age all validated independently
- Configuration validation: check all required fields before proceeding
- Multi-field business rules: credit score AND income AND debt ratio

## Effect signatures

Make side effects explicit in function type signatures.

### Pattern: Async operations that can fail

```python
from typing import Awaitable

# Type alias for common pattern
AsyncResult = Awaitable[Result[T, E]]

# Database operations have explicit effect signature
async def fetchUser(userId: UserId) -> AsyncResult[User, DatabaseError]:
    """
    Effect signature says:
    - This is async (Awaitable)
    - Can fail (Result)
    - Failure type is DatabaseError
    """
    try:
        row = await db.fetchrow(
            "SELECT id, email, name FROM users WHERE id = $1",
            userId.value
        )
        if row is None:
            return Failure(DatabaseError("user not found"))
        return Success(User(
            id=UserId(value=row['id']),
            email=EmailAddress(value=row['email']),
            name=row['name']
        ))
    except Exception as e:
        return Failure(DatabaseError(str(e)))

async def updateUser(user: User) -> AsyncResult[User, DatabaseError]:
    """Effect: async write that can fail"""
    try:
        await db.execute(
            "UPDATE users SET email = $1, name = $2 WHERE id = $3",
            user.email.value,
            user.name,
            user.id.value
        )
        return Success(user)
    except Exception as e:
        return Failure(DatabaseError(str(e)))

# Compose async effects
async def updateUserEmail(
    userId: UserId,
    newEmail: EmailAddress
) -> AsyncResult[User, Error]:
    """
    Railway-oriented pipeline:
    1. Fetch user (async, can fail: not found, db error)
    2. Update email field (pure, cannot fail)
    3. Save user (async, can fail: db error)
    """
    userResult = await fetchUser(userId)

    match userResult:
        case Success(user):
            updatedUser = User(
                id=user.id,
                email=newEmail,
                name=user.name
            )
            return await updateUser(updatedUser)
        case Failure(error):
            return Failure(error)
```

### Pattern: Effect signatures in TypeScript

```typescript
// Type alias
type AsyncResult<T, E> = Promise<Result<T, E>>;

// Explicit effect signatures
async function fetchUser(
  userId: UserId
): AsyncResult<User, DatabaseError> {
  try {
    const row = await db.query(
      "SELECT id, email, name FROM users WHERE id = $1",
      [userId]
    );
    if (row.rows.length === 0) {
      return failure(new DatabaseError("not found"));
    }
    return success(parseUser(row.rows[0]));
  } catch (e) {
    return failure(new DatabaseError(e.message));
  }
}

async function updateUser(
  user: User
): AsyncResult<User, DatabaseError> {
  try {
    await db.query(
      "UPDATE users SET email = $1, name = $2 WHERE id = $3",
      [user.email, user.name, user.id]
    );
    return success(user);
  } catch (e) {
    return failure(new DatabaseError(e.message));
  }
}
```

## The two-track model

Transform all functions to uniform two-track shape for composition.

### Transformation functions

```python
# map: Lift one-track function to two-track
def map(f: Callable[[T], U], result: Result[T, E]) -> Result[U, E]:
    """
    Lift normal function to Result world.
    One-track in, two-track out.
    """
    match result:
        case Success(value):
            return Success(f(value))
        case Failure(error):
            return Failure(error)

# tee: Convert dead-end function to pass-through
def tee(f: Callable[[T], None]) -> Callable[[T], T]:
    """
    Convert side-effect function to pass-through.
    Useful for logging, metrics, etc.
    """
    def wrapper(x: T) -> T:
        f(x)  # Execute side effect
        return x  # Pass through original value
    return wrapper

# tryCatch: Lift function that might throw
def tryCatch(
    f: Callable[[T], U],
    errorHandler: Callable[[Exception], E]
) -> Callable[[T], Result[U, E]]:
    """
    Convert exception-throwing function to Result-returning.
    Catches exceptions and converts to Failure.
    """
    def wrapper(x: T) -> Result[U, E]:
        try:
            return Success(f(x))
        except Exception as e:
            return Failure(errorHandler(e))
    return wrapper
```

### Uniform pipeline composition

```python
# Example: User update workflow with mixed function types

# One-track function (pure)
def canonicalizeEmail(email: str) -> str:
    return email.strip().lower()

# Dead-end function (side effect, no return)
def logUser(user: User) -> None:
    logger.info(f"Processing user {user.id}")

# Exception-throwing function
def encryptPassword(password: str) -> str:
    if len(password) < 8:
        raise ValueError("password too short")
    return bcrypt.hash(password)

# Build uniform two-track pipeline
def updateUserPipeline(raw: dict) -> Result[User, Error]:
    """
    All functions transformed to two-track for uniform composition:
    - parseInput: already two-track (returns Result)
    - validate: already two-track (returns Result)
    - canonicalizeEmail: lifted via map
    - logUser: converted via tee + map
    - encryptPassword: lifted via tryCatch
    - saveToDb: already two-track
    """
    return (
        bind(parseInput(raw), lambda input:
        bind(validate(input), lambda valid:
        bind(
            # Transform one-track canonicalize to two-track
            map(lambda v: canonicalizeEmail(v.email), Success(valid)),
            lambda canonicalized:
            # Transform dead-end log to pass-through two-track
            bind(map(tee(logUser), Success(canonicalized)), lambda logged:
            # Transform exception-thrower to two-track
            bind(
                tryCatch(encryptPassword, lambda e: Error(str(e)))(valid.password),
                lambda encrypted:
                saveToDb(logged, encrypted)
            )))))
    )

# All functions now uniform - easy to compose and rearrange
```

### Railway diagrams

```
Single-track function (one input, one output):
    ─────[ f ]─────

Switch function (one input, two outputs - Success or Failure):
    ───┬─[ f ]─── Success
       └────────── Failure

Two-track function (two inputs, two outputs):
    ───┬─[ f ]─┬─── Success
       │       └─── Failure (from success track)
    ───┴─────────── Failure (passthrough)

Pipeline of switches with bind:
    ───┬─[ f1 ]─┬─[ f2 ]─┬─[ f3 ]─┬─── Success
       └────────┴────────┴────────┴─── Failure

All functions uniform after transformation:
    ───┬─[ switch ]─┬─[ map g ]─┬─[ tee h ]─┬─── Success
       └────────────┴───────────┴───────────┴─── Failure
```

## Integration with data pipelines

### SQLMesh models as pure functions

Treat SQLMesh models as pure, composable functions in the Result world.

```sql
-- Each model is a function: Input → Output
MODEL (
  name analytics.validated_events,
  kind INCREMENTAL_BY_TIME_RANGE(time_column created_at),
  dialect postgres
);

-- Function signature: raw_events → validated_events OR audit_failures
SELECT
  event_id,
  event_type,
  payload,
  created_at
FROM raw_events
WHERE
  -- Validation: only pass through valid events
  event_type IN ('UserCreated', 'UserUpdated', 'UserDeleted')
  AND jsonb_typeof(payload) = 'object'
  AND created_at IS NOT NULL;

-- Invalid events go to audit table (failure track)
MODEL (
  name analytics.event_validation_failures,
  kind FULL
);

SELECT
  event_id,
  event_type,
  'invalid_event_type' as failure_reason
FROM raw_events
WHERE event_type NOT IN ('UserCreated', 'UserUpdated', 'UserDeleted')

UNION ALL

SELECT
  event_id,
  event_type,
  'invalid_payload' as failure_reason
FROM raw_events
WHERE jsonb_typeof(payload) != 'object';
```

### Composing models with Result semantics

```sql
-- Success track: validated events → aggregated metrics
MODEL (
  name analytics.user_stats,
  kind INCREMENTAL_BY_TIME_RANGE(time_column event_date)
);

SELECT
  user_id,
  DATE(created_at) as event_date,
  COUNT(*) as event_count
FROM {{ ref('validated_events') }}  -- Only valid events
WHERE event_type = 'UserCreated'
GROUP BY user_id, DATE(created_at);

-- Failure track: collect all validation failures
MODEL (
  name analytics.data_quality_metrics,
  kind FULL
);

SELECT
  'event_validation' as check_name,
  COUNT(*) as failure_count,
  CURRENT_TIMESTAMP as checked_at
FROM {{ ref('event_validation_failures') }};
```

## Testing railway-oriented code

### Property-based testing for bind/apply

```python
from hypothesis import given, strategies as st

# Test bind law: bind is associative
@given(
    st.integers(),
    st.integers()
)
def test_bind_associativity(x: int, y: int):
    """(m >>= f) >>= g  ===  m >>= (\x -> f x >>= g)"""
    m = Success(x)
    f = lambda a: Success(a + y)
    g = lambda b: Success(b * 2)

    left = bind(bind(m, f), g)
    right = bind(m, lambda a: bind(f(a), g))

    assert left == right

# Test apply collects all errors
@given(st.text(), st.text(), st.text())
def test_apply_collects_errors(email: str, name: str, age: str):
    """Applicative should collect errors from all validations"""
    result = validateUser({'email': email, 'name': name, 'age': age})

    match result:
        case Failure(errors):
            # Count how many fields are actually invalid
            expected_errors = 0
            if '@' not in email:
                expected_errors += 1
            if not name:
                expected_errors += 1
            try:
                if int(age) < 0:
                    expected_errors += 1
            except:
                expected_errors += 1

            assert len(errors) == expected_errors
        case Success(_):
            # All fields must be valid
            assert '@' in email
            assert name
            assert int(age) >= 0
```

## Integration with other preferences

See `~/.claude/commands/preferences/algebraic-data-types.md` for:
- How to model domain types that work with Result
- Sum types for error variants
- Newtypes for validated values

See `~/.claude/commands/preferences/schema-versioning.md` for:
- Configuring sqlc to generate Result-returning queries
- Database operations in railway-oriented style

See `~/.claude/commands/preferences/data-modeling.md` for:
- How ROP fits into data pipeline architecture
- Effect isolation at boundaries
- Monad transformer stack vision
