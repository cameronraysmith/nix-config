# Algebraic data types

## Overview

Algebraic data types (ADTs) are types formed by combining other types using two operations: sum (OR) and product (AND).
This algebraic approach enables precise modeling of domain concepts and makes illegal states unrepresentable.

## Sum types (discriminated unions)

Model "OR" relationships - a value is one of several possible variants.

### Pattern: Enum types for closed value sets

Use PostgreSQL ENUMs when the set of valid values is fixed and known.

```sql
-- PostgreSQL: Enum for order status
CREATE TYPE order_status AS ENUM (
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled'
);

CREATE TABLE orders (
  id UUID PRIMARY KEY,
  status order_status NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Enforce: Different states have different data requirements
ALTER TABLE orders ADD CONSTRAINT shipped_has_tracking CHECK (
  status != 'shipped' OR (metadata ? 'tracking_number')
);

ALTER TABLE orders ADD CONSTRAINT cancelled_has_reason CHECK (
  status != 'cancelled' OR (metadata ? 'cancellation_reason')
);
```

**DuckDB compatibility:**

DuckDB doesn't support ENUM types - use VARCHAR with CHECK constraints:

```sql
-- DuckDB equivalent (SQLMesh transpiles automatically)
CREATE TABLE orders (
  status VARCHAR NOT NULL,
  CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled'))
);
```

**ENUM evolution:**

```sql
-- Safe: Add new value (non-breaking)
ALTER TYPE order_status ADD VALUE 'refunded';

-- Breaking: Cannot remove values
-- Must recreate type or mark as deprecated in application
```

### Pattern: CHECK constraints for inline sum types

When ENUM feels heavyweight or values may evolve:

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  event_type VARCHAR NOT NULL,
  payload JSONB NOT NULL,
  CHECK (event_type IN ('UserCreated', 'UserUpdated', 'UserDeleted'))
);
```

### Pattern: Tagged unions with JSONB

For sum types where each variant has a different shape:

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  event_type VARCHAR NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce shape constraints per event type
ALTER TABLE events ADD CONSTRAINT user_created_shape CHECK (
  event_type != 'UserCreated' OR (
    jsonb_typeof(payload) = 'object' AND
    (payload ? 'user_id') AND
    (payload ? 'email') AND
    (payload ? 'name')
  )
);

ALTER TABLE events ADD CONSTRAINT user_updated_shape CHECK (
  event_type != 'UserUpdated' OR (
    jsonb_typeof(payload) = 'object' AND
    (payload ? 'user_id') AND
    (payload ? 'changes')
  )
);

ALTER TABLE events ADD CONSTRAINT user_deleted_shape CHECK (
  event_type != 'UserDeleted' OR (
    jsonb_typeof(payload) = 'object' AND
    (payload ? 'user_id')
  )
);

-- Enforce: event_type must be one of known types
ALTER TABLE events ADD CONSTRAINT valid_event_type CHECK (
  event_type IN ('UserCreated', 'UserUpdated', 'UserDeleted')
);
```

### Cross-language sum types

**Python: Discriminated unions with Pydantic**

```python
from typing import Union, Literal
from pydantic import BaseModel
from uuid import UUID

# Each variant is a separate class with discriminator field
class Pending(BaseModel):
    type: Literal["pending"]

class Confirmed(BaseModel):
    type: Literal["confirmed"]
    confirmed_at: datetime

class Shipped(BaseModel):
    type: Literal["shipped"]
    tracking_number: str
    shipped_at: datetime

class Delivered(BaseModel):
    type: Literal["delivered"]
    delivered_at: datetime

class Cancelled(BaseModel):
    type: Literal["cancelled"]
    reason: str
    cancelled_at: datetime

# Discriminated union - Pydantic uses 'type' field to discriminate
OrderStatus = Union[Pending, Confirmed, Shipped, Delivered, Cancelled]

class Order(BaseModel):
    id: UUID
    status: OrderStatus  # Must be one of the variants

# Pattern matching
def processOrder(order: Order) -> str:
    match order.status:
        case Pending():
            return "Processing payment..."
        case Confirmed(confirmed_at=dt):
            return f"Confirmed at {dt}"
        case Shipped(tracking_number=num):
            return f"Tracking: {num}"
        case Delivered(delivered_at=dt):
            return f"Delivered at {dt}"
        case Cancelled(reason=r):
            return f"Cancelled: {r}"
```

**TypeScript: Discriminated unions**

```typescript
// Each variant is an object type with discriminator
type OrderStatus =
  | { type: "pending" }
  | { type: "confirmed"; confirmedAt: Date }
  | { type: "shipped"; trackingNumber: string; shippedAt: Date }
  | { type: "delivered"; deliveredAt: Date }
  | { type: "cancelled"; reason: string; cancelledAt: Date };

interface Order {
  id: string;
  status: OrderStatus;
}

// Exhaustive type checking - TypeScript errors if we miss a case
function processOrder(order: Order): string {
  switch (order.status.type) {
    case "pending":
      return "Processing payment...";
    case "confirmed":
      return `Confirmed at ${order.status.confirmedAt}`;
    case "shipped":
      return `Tracking: ${order.status.trackingNumber}`;
    case "delivered":
      return `Delivered at ${order.status.deliveredAt}`;
    case "cancelled":
      return `Cancelled: ${order.status.reason}`;
  }
}
```

**Go: Sealed interfaces**

```go
// Sum type via sealed interface
type OrderStatus interface {
    isOrderStatus()  // Marker method - makes interface "sealed"
}

// Each variant implements the interface
type Pending struct{}

type Confirmed struct {
    ConfirmedAt time.Time
}

type Shipped struct {
    TrackingNumber string
    ShippedAt      time.Time
}

type Delivered struct {
    DeliveredAt time.Time
}

type Cancelled struct {
    Reason      string
    CancelledAt time.Time
}

// Implement marker method
func (Pending) isOrderStatus()   {}
func (Confirmed) isOrderStatus() {}
func (Shipped) isOrderStatus()   {}
func (Delivered) isOrderStatus() {}
func (Cancelled) isOrderStatus() {}

// Pattern matching via type switch
func processOrder(status OrderStatus) string {
    switch s := status.(type) {
    case Pending:
        return "Processing payment..."
    case Confirmed:
        return fmt.Sprintf("Confirmed at %v", s.ConfirmedAt)
    case Shipped:
        return fmt.Sprintf("Tracking: %s", s.TrackingNumber)
    case Delivered:
        return fmt.Sprintf("Delivered at %v", s.DeliveredAt)
    case Cancelled:
        return fmt.Sprintf("Cancelled: %s", s.Reason)
    default:
        return "Unknown status"
    }
}
```

## Product types

Model "AND" relationships - a value contains all fields together.

Product types are already implicit in your schema design: tables and records.

```python
# Product type: User has id AND email AND created_at
class User(BaseModel):
    id: UUID          # Has id
    email: str        # AND email
    created_at: datetime  # AND created_at
```

```sql
-- Table is a product type
CREATE TABLE users (
  id UUID,           -- Has id
  email VARCHAR,     -- AND email
  created_at TIMESTAMPTZ  -- AND created_at
);
```

**Pattern: Composite types for temporary values**

```sql
-- PostgreSQL composite type (product)
CREATE TYPE coordinates AS (
  x INTEGER,
  y INTEGER
);

CREATE TYPE address AS (
  street VARCHAR,
  city VARCHAR,
  state VARCHAR,
  zip VARCHAR
);
```

```python
# Python tuple (product)
Coordinates = tuple[int, int]

# Named tuple (product with names)
from typing import NamedTuple

class Coordinates(NamedTuple):
    x: int
    y: int
```

## Newtype pattern

Wrap primitive types to prevent mixing semantically different values.

### Pattern: DOMAIN types in PostgreSQL

```sql
-- Domain types add semantic meaning to primitives
CREATE DOMAIN email_address AS VARCHAR
  CHECK (VALUE ~ '^[^@]+@[^@]+\.[^@]+$');

CREATE DOMAIN positive_int AS INTEGER
  CHECK (VALUE > 0);

CREATE DOMAIN url AS TEXT
  CHECK (VALUE ~ '^https?://');

CREATE DOMAIN percentage AS NUMERIC(5,2)
  CHECK (VALUE >= 0 AND VALUE <= 100);

-- Use in tables
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email email_address NOT NULL,
  age positive_int,
  website url,
  completion_rate percentage
);
```

**DuckDB compatibility:**

DuckDB doesn't support DOMAIN - use inline CHECK constraints:

```sql
-- DuckDB equivalent
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR NOT NULL CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$'),
  age INTEGER CHECK (age > 0),
  website TEXT CHECK (website ~ '^https?://'),
  completion_rate NUMERIC(5,2) CHECK (completion_rate BETWEEN 0 AND 100)
);
```

### Pattern: Wrapper types in application code

**Python: Single-field Pydantic models**

```python
from pydantic import BaseModel, validator
from uuid import UUID

# Prevent mixing up different ID types
class UserId(BaseModel):
    value: UUID

class OrderId(BaseModel):
    value: UUID

class ProductId(BaseModel):
    value: UUID

# Validated string types
class EmailAddress(BaseModel):
    value: str

    @validator('value')
    def must_be_valid(cls, v):
        if '@' not in v or '.' not in v.split('@')[1]:
            raise ValueError('invalid email format')
        return v.lower().strip()

class PhoneNumber(BaseModel):
    value: str

    @validator('value')
    def must_be_valid(cls, v):
        # Remove formatting
        digits = ''.join(c for c in v if c.isdigit())
        if len(digits) != 10:
            raise ValueError('must be 10 digits')
        return digits

# Quantity types with units
class Dollars(BaseModel):
    value: Decimal

    @validator('value')
    def must_be_non_negative(cls, v):
        if v < 0:
            raise ValueError('cannot be negative')
        return v

# Type system prevents mistakes
def getUser(id: UserId) -> User:  # Type error if passed OrderId!
    ...

def chargeCard(amount: Dollars) -> PaymentResult:  # Type error if passed raw Decimal!
    ...
```

**TypeScript: Branded types**

```typescript
// Nominal typing via branding
type Brand<K, T> = K & { __brand: T };

type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;
type EmailAddress = Brand<string, "EmailAddress">;
type Dollars = Brand<number, "Dollars">;

// Smart constructors that validate
function makeUserId(s: string): UserId | Error {
  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return new Error("invalid UUID");
  }
  return s as UserId;
}

function makeEmailAddress(s: string): EmailAddress | Error {
  if (!s.includes("@") || !s.split("@")[1].includes(".")) {
    return new Error("invalid email");
  }
  return s.toLowerCase().trim() as EmailAddress;
}

function makeDollars(n: number): Dollars | Error {
  if (n < 0) {
    return new Error("cannot be negative");
  }
  return n as Dollars;
}

// Type safety at compile time
function getUser(id: UserId): User {
  // ...
}

// This is a compile error:
// getUser(makeOrderId("..."));  // Type error!
// getUser("raw-string");         // Type error!
```

**Go: Struct wrappers**

```go
// Newtype via struct wrapper
type UserId struct {
    value uuid.UUID
}

func NewUserId(id uuid.UUID) UserId {
    return UserId{value: id}
}

func (u UserId) String() string {
    return u.value.String()
}

type EmailAddress struct {
    value string
}

func NewEmailAddress(s string) (EmailAddress, error) {
    if !strings.Contains(s, "@") || !strings.Contains(strings.Split(s, "@")[1], ".") {
        return EmailAddress{}, errors.New("invalid email format")
    }
    normalized := strings.ToLower(strings.TrimSpace(s))
    return EmailAddress{value: normalized}, nil
}

func (e EmailAddress) String() string {
    return e.value
}

type Dollars struct {
    value decimal.Decimal
}

func NewDollars(amount decimal.Decimal) (Dollars, error) {
    if amount.LessThan(decimal.Zero) {
        return Dollars{}, errors.New("cannot be negative")
    }
    return Dollars{value: amount}, nil
}

// Type safety
func GetUser(id UserId) (*User, error) {
    // ...
}

// This won't compile:
// GetUser(NewOrderId(...))  // Type error!
// GetUser("raw-string")     // Type error!
```

### When to use newtypes

Always wrap primitives when:

- **IDs that should never be mixed**: UserId vs OrderId vs ProductId
- **Validated strings**: EmailAddress, PhoneNumber, URL, SSN
- **Quantities with units**: Meters, Dollars, Seconds, Bytes
- **Opaque tokens**: ApiKey, SessionToken, PasswordHash
- **Constrained values**: PositiveInt, NonEmptyString, Percentage

## Making illegal states unrepresentable

Design types so invalid combinations cannot be constructed.

### Anti-pattern: Boolean flags with dependent fields

```sql
-- Bad: Many illegal states possible
CREATE TABLE reservations (
  id UUID PRIMARY KEY,
  confirmed BOOLEAN NOT NULL,
  cancelled BOOLEAN NOT NULL,
  confirmation_date TIMESTAMPTZ,
  cancellation_reason TEXT
);

-- Illegal states:
-- confirmed=true, cancelled=true (both!)
-- confirmed=true, confirmation_date=NULL (no date!)
-- cancelled=false, cancellation_reason='...' (reason without cancel!)
```

### Pattern: Sum types for mutually exclusive states

```sql
-- Good: Only valid states are possible
CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'cancelled');

CREATE TABLE reservations (
  id UUID PRIMARY KEY,
  status reservation_status NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Enforce: confirmed requires confirmation_date
ALTER TABLE reservations ADD CONSTRAINT confirmed_has_date CHECK (
  status != 'confirmed' OR (
    jsonb_typeof(metadata->'confirmation_date') = 'string'
  )
);

-- Enforce: cancelled requires cancellation_reason
ALTER TABLE reservations ADD CONSTRAINT cancelled_has_reason CHECK (
  status != 'cancelled' OR (
    jsonb_typeof(metadata->'cancellation_reason') = 'string'
  )
);

-- Illegal states now impossible at schema level!
```

**Generated code enforces at type level:**

```python
class Pending(BaseModel):
    type: Literal["pending"]
    # No extra fields

class Confirmed(BaseModel):
    type: Literal["confirmed"]
    confirmation_date: datetime  # Required!

class Cancelled(BaseModel):
    type: Literal["cancelled"]
    cancellation_reason: str  # Required!

ReservationStatus = Union[Pending, Confirmed, Cancelled]

class Reservation(BaseModel):
    id: UUID
    status: ReservationStatus

# Impossible to construct invalid state:
# - Can't be confirmed without date
# - Can't be cancelled without reason
# - Can't be both confirmed and cancelled
```

### Anti-pattern: Optional fields that should be mutually exclusive

```sql
-- Bad: Can have both payment_method types
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  credit_card_token VARCHAR,
  bank_account_number VARCHAR,
  amount NUMERIC NOT NULL
);

-- Illegal: both credit card and bank account
-- Illegal: neither payment method
```

### Pattern: Sum type for payment methods

```sql
-- Good: Exactly one payment method
CREATE TYPE payment_method_type AS ENUM ('credit_card', 'bank_account', 'paypal');

CREATE TABLE payments (
  id UUID PRIMARY KEY,
  payment_method_type payment_method_type NOT NULL,
  payment_details JSONB NOT NULL,
  amount NUMERIC NOT NULL,

  CHECK (
    (payment_method_type = 'credit_card' AND payment_details ? 'card_token') OR
    (payment_method_type = 'bank_account' AND payment_details ? 'account_number') OR
    (payment_method_type = 'paypal' AND payment_details ? 'paypal_email')
  )
);
```

**Generated code:**

```python
class CreditCardPayment(BaseModel):
    type: Literal["credit_card"]
    card_token: str

class BankAccountPayment(BaseModel):
    type: Literal["bank_account"]
    account_number: str
    routing_number: str

class PaypalPayment(BaseModel):
    type: Literal["paypal"]
    paypal_email: str

PaymentMethod = Union[CreditCardPayment, BankAccountPayment, PaypalPayment]

class Payment(BaseModel):
    id: UUID
    payment_method: PaymentMethod  # Exactly one!
    amount: Decimal
```

## Testing ADTs

### Property-based testing

Use hypothesis (Python) or similar to test ADT invariants:

```python
from hypothesis import given, strategies as st
from hypothesis.strategies import builds

# Generate arbitrary EmailAddress values
email_strategy = builds(
    EmailAddress,
    value=st.emails()
)

@given(email_strategy)
def test_email_roundtrip(email: EmailAddress):
    """Property: parsing serialized email should give original"""
    serialized = email.value
    parsed = EmailAddress(value=serialized)
    assert parsed == email

@given(email_strategy)
def test_email_normalized(email: EmailAddress):
    """Property: emails are always lowercase and trimmed"""
    assert email.value == email.value.lower().strip()

# Generate arbitrary OrderStatus values
order_status_strategy = st.one_of(
    builds(Pending, type=st.just("pending")),
    builds(Shipped,
           type=st.just("shipped"),
           tracking_number=st.text(min_size=5, max_size=20)),
    # ... other variants
)

@given(order_status_strategy)
def test_order_status_serialization(status: OrderStatus):
    """Property: status can roundtrip through JSON"""
    json_data = status.json()
    parsed = parse_order_status(json_data)  # Your parser
    assert parsed == status
```

### Exhaustiveness testing

Ensure pattern matching handles all cases:

```python
def test_all_order_statuses_handled():
    """Ensure processOrder handles all status variants"""
    statuses = [
        Pending(type="pending"),
        Confirmed(type="confirmed", confirmed_at=datetime.now()),
        Shipped(type="shipped", tracking_number="ABC123", shipped_at=datetime.now()),
        Delivered(type="delivered", delivered_at=datetime.now()),
        Cancelled(type="cancelled", reason="test", cancelled_at=datetime.now()),
    ]

    for status in statuses:
        order = Order(id=uuid4(), status=status)
        result = processOrder(order)
        assert result is not None  # Ensure no case is missed
```

## Integration with schema versioning

See `~/.claude/commands/preferences/schema-versioning.md` for:
- How to configure sqlc to generate ADT types
- Cross-database compatibility (PostgreSQL ENUMs → DuckDB CHECK)
- Migration patterns for evolving ADTs

See `~/.claude/commands/preferences/railway-oriented-programming.md` for:
- How to use ADTs with Result types for error handling
- Composing operations on sum types with bind/apply
