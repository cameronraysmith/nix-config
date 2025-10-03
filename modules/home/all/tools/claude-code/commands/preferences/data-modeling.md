# Data modeling

## Foundational principles

### Type safety

Data schemas are contracts.
Treat them as type signatures that make implicit assumptions explicit.

- Use Pydantic schemas for data validation at ingestion boundaries
- Define explicit column types in all model definitions (avoid `SELECT *`)
- Document grain (primary keys) as part of the model contract
- Implement audit checks (uniqueness, not-null constraints) as executable type constraints
- Leverage schema evolution capabilities for non-breaking changes only
- Test schema changes in isolated environments before applying to production

### Functional patterns

Data transformations should behave as pure functions where practical.

- Treat SQL views and models as lazily-evaluated pure functions
- Use immutable data files (Parquet via DuckLake or similar formats)
- Make state changes explicit through snapshots and time travel capabilities
- Isolate side effects at pipeline boundaries (ingestion, egress)
- Prefer composition over inheritance in metric and model definitions
- Document data lineage as function composition chains

### Immutability and append-only patterns

Once written, data files should never be modified in place.

- Use append-only data files for all raw and processed data
- Implement updates through delete-insert patterns at partition boundaries
- Maintain historical snapshots for reproducibility and debugging
- Version all schema and model definitions in source control
- Treat data deletions as tombstone markers rather than physical removal where compliance allows

## Schema management

### Evolution principles

Schema changes should be transactional and backward-compatible when possible.

- Use transactional DDL for all schema modifications
- Document breaking vs non-breaking changes explicitly
- Employ column-level lineage tracking for impact analysis
- Test schema changes in virtual or development environments first
- Plan migration paths for breaking changes
- Maintain schema documentation alongside code

### Validation at boundaries

Validate data shape and constraints at system boundaries.

- Implement validation at ingestion points (before data enters the lake)
- Use Pydantic or similar libraries for runtime type checking in Python
- Define data quality checks as executable contracts
- Fail fast on validation errors rather than propagating bad data
- Log validation failures for debugging and monitoring
- Consider partial validation for streaming scenarios (LLM outputs, etc.)

## Incremental processing patterns

### Time-partitioned models

When processing event data, partition by time to enable efficient incremental updates.

- Use `INCREMENTAL_BY_TIME_RANGE` or equivalent patterns for time-series data
- Configure lookback windows to handle late-arriving data gracefully
- Document time columns and partition granularity explicitly
- Implement idempotent transformations (delete + insert within partition)
- Track processing state explicitly (watermarks, snapshots)
- Test backfill and reprocessing scenarios

### State tracking

Make data pipeline state explicit and queryable.

- Maintain processing metadata (last processed timestamp, record counts)
- Use snapshots for point-in-time recovery
- Implement time travel for debugging and rollback
- Track data lineage and transformation history
- Version control pipeline definitions and state schemas

## Semantic layer patterns

### Logical vs physical separation

Separate business logic (metrics, dimensions) from physical storage schema.

- Define metrics once in version-controlled configuration (YAML, SQL)
- Abstract physical table structure behind logical views
- Enable ad-hoc query composition without pre-aggregation
- Use semantic definitions as documentation and contracts
- Maintain metric lineage and dependencies explicitly
- Test metrics in isolation from physical implementation

### Metric composition

Build complex metrics from simpler, reusable components.

- Define base metrics as atomic units
- Compose derived metrics from base metrics with explicit dependencies
- Document metric calculation logic alongside definitions
- Version metrics and track breaking changes
- Validate metric consistency across different tools and interfaces

## DuckDB and DuckLake patterns

### Metadata management

Store catalog metadata in SQL databases, not file-based catalogs.

- Use DuckLake or similar for lakehouse patterns with full ACID support
- Store all table metadata (schemas, snapshots, statistics) in relational catalogs
- Leverage transactional guarantees for atomic updates
- Query metadata tables directly for lineage and governance
- Avoid complex file-based metadata (JSON, Avro manifests) where possible

### Query optimization

Leverage DuckDB's strengths for analytical workloads.

- Use Parquet for columnar storage with compression
- Push down predicates and projections to file scans
- Leverage partition pruning through statistics
- Query data where it lives to reduce data movement
- Use inline data storage for small, frequently-changing tables
- Profile queries to identify bottlenecks

### Local development to production

Bridge local DuckDB development with production deployments.

- Develop and test locally with DuckDB files or in-memory databases
- Use consistent SQL dialect between local and production environments
- Deploy to cloud environments (Fabric, MotherDuck) with minimal code changes
- Maintain parity between local and production data samples
- Test incremental logic locally before scheduling in production

## SQLMesh integration

### Model kinds and patterns

Choose appropriate model kinds for different use cases.

- `SEED` - for static reference data loaded from files
- `INCREMENTAL_BY_TIME_RANGE` - for time-partitioned event data
- `VIEW` - for logical transformations without materialization
- `FULL` - for complete refresh of derived tables
- Document rationale for model kind selection

### Virtual environments and testing

Test changes safely before affecting production.

- Use virtual environments to preview changes
- Run audits and tests before applying plans
- Validate data quality in isolated environments
- Enable column-level lineage for impact analysis
- Roll back changes atomically if issues arise

### Audit and governance

Build data quality checks into model definitions.

- Define audits as executable contracts (unique, not-null, ranges)
- Document grain (primary keys) explicitly in model metadata
- Track model dependencies and lineage
- Version models and track breaking changes
- Implement continuous testing for data quality

## Composability and modularity

### Reusable transformations

Build libraries of reusable data transformations.

- Extract common logic into views or utility models
- Parameterize transformations where appropriate
- Document inputs, outputs, and assumptions
- Test transformations in isolation
- Version transformation logic separately from business rules

### Cross-tool consistency

Ensure metrics and logic remain consistent across tools.

- Define metrics in a central semantic layer
- Use the same SQL dialect across tools where possible
- Share schema definitions between validation and transformation code
- Test metric calculations across different interfaces
- Document expected behavior and edge cases

## Best practices summary

When modeling data, prioritize:

1. **Explicit contracts** - schemas, types, and constraints as documentation
2. **Immutability** - append-only patterns and versioning
3. **Composability** - building complex models from simple, reusable components
4. **Testability** - validating transformations in isolation
5. **Lineage** - tracking data flow from source to consumption
6. **Type safety** - leveraging type systems to catch errors early
7. **Transactionality** - ACID guarantees for consistency
8. **Separation of concerns** - logical models separate from physical storage

Remember that in the ideal case, data pipelines should behave as a monad transformer stack where side effects are explicit in signatures and isolated at boundaries to preserve compositionality.
