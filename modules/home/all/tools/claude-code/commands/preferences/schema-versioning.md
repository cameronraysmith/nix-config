# Schema versioning

## Philosophy

Database schemas are code and should be treated as such.
The migration files are the single source of truth for schema definitions.
Type-safe code generation enforces contracts between application and database.
Cross-database compatibility is achieved through dialect-aware transpilation.
Schema evolution must be explicit, versioned, and reversible.

See `data-modeling.md` for broader principles on type safety, immutability, and functional patterns.
This document focuses on the practical toolchain for schema versioning and code generation.

## Toolchain roles

### Atlas

Declarative migration management and schema versioning.
Validates migrations for safety (prevents destructive changes).
Applies migrations to PostgreSQL databases.
Generates migration diffs from schema changes.
Does NOT support DuckDB directly but provides PostgreSQL-compliant DDL.

### sqlc

Type-safe code generation from SQL schemas and queries.
Reads PostgreSQL DDL from migration files.
Generates language-specific types and query functions.
Supports Python (Pydantic models), TypeScript, Go, Kotlin.
Validates queries at compile time against schema.

### SQLMesh

Semantic layer and data transformation framework.
Reads the same migration files as Atlas.
Transpiles PostgreSQL DDL to DuckDB using sqlglot.
Manages incremental models and versioned environments.
Orchestrates data pipelines across multiple databases.

## Directory structure

Canonical layout for schema versioning with Atlas, sqlc, and SQLMesh:

```
project/
├── migrations/              # Single source of truth
│   ├── 001_initial_schema.sql
│   ├── 002_add_users.sql
│   └── 003_add_indexes.sql
├── queries/                 # sqlc query definitions
│   ├── users.sql
│   └── reservations.sql
├── atlas.hcl               # Atlas configuration
├── sqlc.yaml               # sqlc configuration
└── config.yaml             # SQLMesh configuration
```

## The happy path workflow

Write PostgreSQL-compliant DDL in migration files.
Atlas validates and applies migrations to PostgreSQL.
SQLMesh reads the same files and transpiles to DuckDB via sqlglot.
sqlc generates type-safe code (Pydantic, TypeScript, Go) from migrations.
All tools read from the same source of truth with no duplication.

```
migrations/001_schema.sql (PostgreSQL DDL)
         │
         ├─────────────────┬──────────────────┐
         ▼                 ▼                  ▼
    Atlas             SQLMesh             sqlc
      │                  │                  │
      ▼                  ▼                  ▼
  PostgreSQL         DuckDB          Type-safe code
   database          database       (Pydantic/TS/Go)
```

## Atlas configuration

Define environments for different deployment targets.
Enable safety checks to prevent destructive operations.
Configure concurrent index creation to avoid locking.

```hcl
# atlas.hcl

# Prevent production accidents
lint {
  destructive {
    error = true
  }
  latest = 1
}

# Avoid downtime and lock conflicts
diff {
  skip {
    drop_schema = true
    drop_table  = true
    drop_column = true
  }
  concurrent_index {
    create = true
    drop   = true
  }
}

env "dev" {
  src = "file://migrations"
  dev = "docker://postgres/17/dev?search_path=public"
  url = env("DATABASE_URL")
  migration {
    dir = "file://migrations"
  }
  format {
    migrate {
      diff = "{{ sql . \"  \" }}"
    }
  }
}

env "local" {
  src = "file://migrations"
  dev = "docker://postgres/17/dev?search_path=public"
  url = "postgres://app:app@db:5432/app?sslmode=disable"
  migration {
    dir = "file://migrations"
  }
}
```

## sqlc configuration

Configure code generation for multiple languages from the same schema.
Use plugins for Python (Pydantic), TypeScript, or Go.
Enable type overrides for custom types (UUID, JSON, etc.).

### Python with Pydantic

```yaml
# sqlc.yaml
version: "2"
plugins:
  - name: "py"
    wasm:
      url: "https://downloads.sqlc.dev/plugin/sqlc-gen-python_1.0.0.wasm"
      sha256: "aca83e1f59f8ffdc604774c2f6f9eb321a2b23e07dc83fc12289d25305fa065b"

sql:
  - engine: "postgresql"
    queries: "queries"
    schema: "migrations"  # Read from same migrations directory
    codegen:
      - plugin: "py"
        out: "src/generated"
        options:
          package: "db"
          emit_pydantic_models: true
          emit_sync_querier: true
          emit_async_querier: true
```

### TypeScript

```yaml
sql:
  - engine: "postgresql"
    queries: "queries"
    schema: "migrations"
    codegen:
      - plugin: "ts"
        out: "src/generated"
        options:
          runtime: "node-postgres"
```

### Go

```yaml
sql:
  - engine: "postgresql"
    queries: "queries"
    schema: "migrations"
    gen:
      go:
        package: "db"
        out: "internal/db"
        sql_package: "pgx/v5"
        emit_json_tags: true
        emit_prepared_queries: false
        emit_exact_table_names: true
        overrides:
          - db_type: "uuid"
            nullable: false
            go_type:
              import: "github.com/google/uuid"
              type: "UUID"
```

## SQLMesh integration

SQLMesh reads PostgreSQL migrations and transpiles to DuckDB.
No explicit configuration needed for transpilation (handled by sqlglot).
Define models in PostgreSQL dialect for cross-database compatibility.

```yaml
# config.yaml
gateways:
  postgres:
    connection:
      type: postgres
      host: localhost
      port: 5432
      database: app

  duckdb:
    connection:
      type: duckdb
      database: data/analytics.duckdb

default_gateway: duckdb
```

SQLMesh models can reference the same schema:

```sql
-- models/analytics/user_stats.sql
MODEL (
  name analytics.user_stats,
  kind INCREMENTAL_BY_TIME_RANGE (
    time_column created_at
  ),
  dialect postgres  -- Write in PostgreSQL, runs on DuckDB
);

SELECT
  user_id,
  COUNT(*) as event_count,
  MAX(created_at) as last_event
FROM events
GROUP BY user_id;
```

SQLMesh automatically transpiles PostgreSQL to DuckDB via sqlglot.

## Migration patterns

Write PostgreSQL-compliant DDL that works on both PostgreSQL and DuckDB.
Avoid database-specific extensions and types.
Test migrations on both databases before committing.

### Safe patterns

```sql
-- migrations/001_users.sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR NOT NULL,
  password_hash VARCHAR NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);

-- Constraints work on both databases
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
```

### Patterns to avoid

```sql
-- AVOID: PostgreSQL-specific types
email CITEXT NOT NULL  -- DuckDB doesn't support CITEXT

-- AVOID: Range types
slot TSTZRANGE NOT NULL  -- DuckDB doesn't support range types

-- AVOID: Exclusion constraints
EXCLUDE USING gist (slot WITH &&)  -- DuckDB doesn't support EXCLUDE

-- INSTEAD: Use compatible types
email VARCHAR NOT NULL  -- Works on both
slot_start TIMESTAMPTZ NOT NULL
slot_end TIMESTAMPTZ NOT NULL
```

### Compatible data types

Use these types for cross-database compatibility:
- UUID (works identically)
- VARCHAR, TEXT (works identically)
- INTEGER, BIGINT, SMALLINT (works identically)
- DECIMAL, NUMERIC (works identically)
- BOOLEAN (works identically)
- TIMESTAMPTZ, TIMESTAMP (works identically)
- DATE, TIME (works identically)
- JSONB (works identically in modern DuckDB)
- ARRAY types (works with slight syntax differences)

### Type-driven schema design

For patterns on modeling domain types in schemas and generated code:

- **~/.claude/commands/preferences/algebraic-data-types.md** - ENUMs (sum types), DOMAIN types (newtypes), making illegal states unrepresentable, cross-language ADT patterns
- **~/.claude/commands/preferences/railway-oriented-programming.md** - Result types in generated code, effect signatures for database operations

Apply these patterns to:
- Model order status as ENUM instead of VARCHAR
- Use DOMAIN types for validated fields (email_address, positive_int)
- Generate discriminated unions from ENUMs (Python Union, TypeScript discriminated union, Go sealed interface)
- Generate Result-returning query functions instead of exception-throwing
- Enforce schema constraints so invalid states cannot exist

## Cross-database compatibility

DuckDB's SQL dialect closely follows PostgreSQL conventions.
Most PostgreSQL DDL works directly in DuckDB via transpilation.
Key differences are documented and avoidable.

### Compatibility matrix

| Feature | PostgreSQL | DuckDB | Compatible |
|---------|-----------|--------|------------|
| UUID | ✓ | ✓ | ✓ |
| TIMESTAMPTZ | ✓ | ✓ | ✓ |
| JSONB | ✓ | ✓ | ✓ |
| Arrays | ✓ | ✓ | ✓ |
| Primary keys | ✓ | ✓ | ✓ |
| Foreign keys | ✓ | ✓ | ✓ |
| Indexes | ✓ | ✓ | ✓ (syntax varies) |
| CITEXT | ✓ | ✗ | Use VARCHAR |
| tstzrange | ✓ | ✗ | Model as start/end |
| EXCLUDE constraints | ✓ | ✗ | Handle in application |
| Extensions (PostGIS) | ✓ | ✓ (Spatial) | Different APIs |

### Testing strategy

Validate migrations work on both databases before deployment:

```bash
# 1. Test on PostgreSQL via Atlas
atlas migrate apply --env dev

# 2. Test on DuckDB via SQLMesh
sqlmesh plan dev

# 3. Run integration tests
pytest tests/integration/  # Tests against both databases
```

Write integration tests that validate schema in both databases:

```python
import duckdb
import psycopg2
from sqlglot import parse_one, transpile

def test_migration_compatibility():
    """Ensure migration works on both PostgreSQL and DuckDB."""
    with open("migrations/001_users.sql") as f:
        pg_sql = f.read()

    # Test PostgreSQL
    pg_conn = psycopg2.connect(...)
    pg_conn.execute(pg_sql)

    # Transpile to DuckDB
    duckdb_sql = transpile(pg_sql, read="postgres", write="duckdb")[0]

    # Test DuckDB
    duck_conn = duckdb.connect(":memory:")
    duck_conn.execute(duckdb_sql)

    # Validate schema matches
    assert_schemas_equivalent(pg_conn, duck_conn, "users")
```

## Cross-language type safety

The same PostgreSQL schema generates type-safe code across languages.
Each language uses its native type system and validation libraries.

For detailed patterns on sum types, newtypes, and Result types in generated code, see ~/.claude/commands/preferences/algebraic-data-types.md and ~/.claude/commands/preferences/railway-oriented-programming.md.

### Python (Pydantic)

sqlc generates Pydantic models with runtime validation:

```python
# Generated from migrations/001_users.sql
from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime

class User(BaseModel):
    id: UUID
    email: str
    password_hash: str
    created_at: datetime
    updated_at: datetime

class CreateUserParams(BaseModel):
    email: str
    password_hash: str

# Generated query function
async def create_user(
    conn: AsyncConnection,
    params: CreateUserParams
) -> UUID:
    # Type-safe implementation
    ...
```

### TypeScript

sqlc generates TypeScript interfaces with compile-time checking:

```typescript
// Generated from migrations/001_users.sql
interface User {
  id: string;  // UUID
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateUserParams {
  email: string;
  passwordHash: string;
}

// Generated query function
export async function createUser(
  client: Client,
  params: CreateUserParams
): Promise<string> {
  // Type-safe implementation
  ...
}
```

### Go

sqlc generates Go structs with strong typing:

```go
// Generated from migrations/001_users.sql
type User struct {
    ID           uuid.UUID
    Email        string
    PasswordHash string
    CreatedAt    time.Time
    UpdatedAt    time.Time
}

type CreateUserParams struct {
    Email        string
    PasswordHash string
}

// Generated query function
func (q *Queries) CreateUser(
    ctx context.Context,
    db DBTX,
    arg CreateUserParams,
) (uuid.UUID, error) {
    // Type-safe implementation
    ...
}
```

## Common patterns

### Schema evolution

When evolving schemas, maintain compatibility:

```sql
-- migrations/004_add_user_role.sql

-- Add new column with default (non-breaking)
ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'viewer';

-- Add constraint in separate migration after data migration
-- migrations/005_enforce_user_role.sql
ALTER TABLE users ALTER COLUMN role SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT check_user_role
  CHECK (role IN ('viewer', 'operator', 'admin'));
```

### Incremental models

Use SQLMesh for incremental processing of versioned data:

```sql
-- models/analytics/daily_user_activity.sql
MODEL (
  name analytics.daily_user_activity,
  kind INCREMENTAL_BY_TIME_RANGE (
    time_column event_date,
    lookback 2
  ),
  grain (user_id, event_date),
  audits (
    UNIQUE_VALUES(columns=(user_id, event_date)),
    NOT_NULL(columns=(user_id, event_date))
  )
);

SELECT
  user_id,
  DATE(created_at) as event_date,
  COUNT(*) as event_count
FROM events
WHERE created_at BETWEEN @start_dt AND @end_dt
GROUP BY user_id, DATE(created_at);
```

### Type overrides

Configure custom type mappings for domain-specific types:

```yaml
# sqlc.yaml - Python
overrides:
  - db_type: "uuid"
    nullable: false
    python_type:
      import: "uuid.UUID"
      type: "UUID"

  - db_type: "jsonb"
    nullable: false
    python_type:
      import: "typing.Any"
      type: "Any"
```

## Workflow summary

Development workflow integrating all tools:

```bash
# 1. Write migration (PostgreSQL DDL)
vim migrations/006_add_feature.sql

# 2. Validate and apply to PostgreSQL
atlas migrate diff --env dev
atlas migrate apply --env dev

# 3. Test on DuckDB via SQLMesh
sqlmesh plan dev

# 4. Regenerate type-safe code
sqlc generate

# 5. Write queries using generated types
vim queries/new_feature.sql

# 6. Run tests
pytest tests/

# 7. Commit
git add migrations/ queries/ sqlc.yaml
git commit -m "feat(schema): add new feature table"
```

## Integration with existing preferences

This workflow aligns with principles from other preference files:

**From data-modeling.md:**
- Type safety through code generation
- Schema evolution as transactional changes
- Immutability of migration files

**From algebraic-data-types.md:**
- ENUMs for sum types (order_status, user_role)
- DOMAIN types for newtypes (email_address, positive_int)
- Making illegal states unrepresentable
- Cross-language discriminated unions

**From railway-oriented-programming.md:**
- Result types in generated query functions
- Effect signatures for async database operations
- bind/apply for composing database operations
- Two-track model for error propagation

**From git-version-control.md:**
- Migrations are versioned in git
- Atomic commits of schema changes
- Test before committing

**From architectural-patterns.md:**
- Single source of truth (migrations)
- Separation of concerns (schema vs queries vs application)
- Composability through generated interfaces

**From python-development.md:**
- Pydantic for runtime validation
- Type hints from generated code
- Async query functions
