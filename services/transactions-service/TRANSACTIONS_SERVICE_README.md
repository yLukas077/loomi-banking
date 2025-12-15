# Loomi Banking - Transactions Service

## Overview

The Transactions Service handles all financial operations in the Loomi Banking platform, including deposits, withdrawals, and transfers between accounts.

## Features

### 1. Transaction Types

| Type | senderUserId | receiverUserId | Description |
|------|--------------|----------------|-------------|
| `deposit` | null | required | Add funds to an account |
| `withdraw` | required | null | Remove funds from an account |
| `transfer` | required | required | Move funds between accounts |

### 2. Transaction CRUD (Core Operations)

- **Create** new transactions with validation:
  - `senderUserId` (required for withdraw/transfer)
  - `receiverUserId` (required for deposit/transfer)
  - `type` (`deposit`, `withdraw`, `transfer`)
  - `amount` (positive number)
  - `description` (optional)
- **Retrieve** transactions by ID
- **List** all transactions ordered by creation date (DESC)
- **Filter** by user: `GET /transactions?userId=xxx`
- **Update** transaction status (`pending`, `completed`, `failed`)

### 3. User & Banking Validation (via Redis cache)

Before a transaction is created, the service validates:

**For Deposit:**
- Receiver user must exist in cache

**For Withdraw:**
- Sender user must exist in cache
- Sender must have complete banking details (agency, accountNumber, accountType)

**For Transfer:**
- Sender and receiver must be different users
- Both users must exist in cache
- Sender must have complete banking details
- Receiver must have banking details configured

### 4. Caching Layer (Redis)

Stores data received from RabbitMQ events:

| Key Pattern | Data | Source Event |
|-------------|------|--------------|
| `user:{id}` | User info | `user.created` |
| `user:{id}:banking` | Banking details | `banking_details.updated` |

Enables fast validation without synchronous calls to Users Service.

### 5. Event Consumption (RabbitMQ)

Subscribes to `users` exchange (topic) and processes:

| Event | Action |
|-------|--------|
| `user.created` | Caches user data |
| `banking_details.updated` | Caches banking details |

### 6. Event Publishing (RabbitMQ)

Publishes to `transactions` exchange (topic):

| Event | Routing Key | Trigger |
|-------|-------------|---------|
| `transaction.created` | `transaction.created` | New transaction created |
| `transaction.status_updated` | `transaction.status_updated` | Status changed |

**transaction.created payload:**
```json
{
  "event": "transaction.created",
  "transactionId": "uuid",
  "senderUserId": "uuid | null",
  "receiverUserId": "uuid | null",
  "type": "deposit | withdraw | transfer",
  "amount": 100.50,
  "timestamp": "2025-12-15T00:00:00.000Z"
}
```

**transaction.status_updated payload:**
```json
{
  "event": "transaction.status_updated",
  "transactionId": "uuid",
  "senderUserId": "uuid | null",
  "receiverUserId": "uuid | null",
  "type": "deposit | withdraw | transfer",
  "amount": 100.50,
  "newStatus": "completed | failed",
  "timestamp": "2025-12-15T00:00:00.000Z"
}
```

### 7. Validation Layer (class-validator)

DTO validation rules:

- **senderUserId**: UUID format, required for withdraw/transfer (conditional)
- **receiverUserId**: UUID format, required for deposit/transfer (conditional)
- **type**: Must be valid enum value
- **amount**: Must be positive number
- **status**: Must be valid enum value

### 8. Idempotency (Redis-backed)

`POST /transactions` accepts an `Idempotency-Key` header.

Prevents:
- Duplicate transaction processing
- Double publishing of events
- Inconsistent financial data

Same payload + same key = cached response returned.

### 9. Global Exception Handling

Custom exception filter providing consistent error responses:

```json
{
  "statusCode": 400,
  "timestamp": "2025-12-15T00:00:00.000Z",
  "path": "/transactions",
  "method": "POST",
  "message": "Sender has no banking details configured",
  "requestId": "uuid"
}
```

### 10. Structured Logging

Global interceptor logs:
- HTTP method
- URL
- Execution duration
- Request ID (correlation)

### 11. Swagger Documentation

Complete OpenAPI documentation at `/api`:
- All endpoints documented
- Request/response schemas
- Example payloads

### 12. Modular Architecture

```
├── transactions/    # Core business logic
├── rabbitmq/        # Event pub/sub
├── redis/           # Caching layer
├── common/          # Shared utilities
│   ├── filters/
│   ├── interceptors/
│   ├── middleware/
│   └── idempotency/
└── database/        # TypeORM configuration
```

---

## API Endpoints

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/transactions` | Create transaction |
| GET | `/transactions` | List all transactions |
| GET | `/transactions?userId=xxx` | List user transactions |
| GET | `/transactions/:id` | Get transaction by ID |
| PATCH | `/transactions/:id/status` | Update transaction status |

---

## Request Examples

### Create Deposit

```bash
curl -X POST http://localhost:3002/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "receiverUserId": "84914ac4-4c99-4fa2-b862-4146c2e287f1",
    "type": "deposit",
    "amount": 500,
    "description": "Initial deposit"
  }'
```

### Create Withdraw

```bash
curl -X POST http://localhost:3002/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "senderUserId": "84914ac4-4c99-4fa2-b862-4146c2e287f1",
    "type": "withdraw",
    "amount": 100
  }'
```

### Create Transfer

```bash
curl -X POST http://localhost:3002/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "senderUserId": "84914ac4-4c99-4fa2-b862-4146c2e287f1",
    "receiverUserId": "4c6eea26-3e05-4d6c-949e-040b42f638d1",
    "type": "transfer",
    "amount": 200,
    "description": "PIX transfer"
  }'
```

### Complete Transaction

```bash
curl -X PATCH "http://localhost:3002/transactions/{txId}/status" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

### List User Transactions

```bash
curl "http://localhost:3002/transactions?userId=84914ac4-4c99-4fa2-b862-4146c2e287f1"
```

---

## Environment Variables

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=transactions_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# App
PORT=3002
```

---

## Running Locally

### Development

```bash
npm install
npm run start:dev
```

### Production

```bash
npm run build
npm run start:prod
```

---

## Testing

### Unit Tests

```bash
npm run test
npm run test:cov  # with coverage
```

**Coverage:** ~82%+

Unit tests cover:
- TransactionsService (all transaction types, validations)
- TransactionsController
- TransactionsConsumer (event handling)
- DTOs validation (conditional validation)
- IdempotencyService
- RedisService
- RabbitMQPublisher
- Exception filters
- Interceptors
- Middleware

### E2E Tests

```bash
npm run test:e2e
```

Uses Testcontainers for isolated PostgreSQL database.

E2E tests cover:
- Deposit creation and validation
- Withdraw creation and validation
- Transfer creation and validation
- Same account transfer rejection
- Missing banking details rejection
- Status updates (completed, failed)
- Transaction listing and filtering
- Error scenarios (404, 400)

---

## Project Structure

```
src/
├── transactions/
│   ├── dto/
│   │   ├── create-transaction.dto.ts
│   │   └── update-status.dto.ts
│   ├── entities/
│   │   └── transaction.entity.ts
│   ├── transactions.controller.ts
│   ├── transactions.service.ts
│   └── transactions.module.ts
├── rabbitmq/
│   ├── rabbitmq.publisher.ts
│   ├── transactions.consumer.ts
│   └── rabbitmq.module.ts
├── redis/
│   ├── redis.service.ts
│   └── redis.module.ts
├── common/
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── interceptors/
│   │   └── log.interceptor.ts
│   ├── middleware/
│   │   └── request-id.middleware.ts
│   └── idempotency/
│       ├── idempotency.service.ts
│       └── idempotency.module.ts
├── database/
│   └── database.module.ts
└── app.module.ts

test/
├── unit/
│   ├── transactions.service.spec.ts
│   ├── transactions.controller.spec.ts
│   ├── transactions.consumer.spec.ts
│   ├── dto.spec.ts
│   ├── idempotency.service.spec.ts
│   ├── redis.service.spec.ts
│   ├── rabbitmq.publisher.spec.ts
│   ├── http-exception.filter.spec.ts
│   ├── log.interceptor.spec.ts
│   └── request-id.middleware.spec.ts
└── e2e/
    └── transactions.e2e-spec.ts
```

---

## Entity Schema

### Transaction

```typescript
{
  id: string (UUID, PK)
  senderUserId?: string (UUID, nullable)
  receiverUserId?: string (UUID, nullable)
  type: 'deposit' | 'withdraw' | 'transfer'
  amount: decimal(10,2)
  status: 'pending' | 'completed' | 'failed' (default: pending)
  description?: string
  createdAt: Date
  updatedAt: Date
}
```

### Transaction Type Rules

| Type | senderUserId | receiverUserId |
|------|--------------|----------------|
| deposit | null | required |
| withdraw | required | null |
| transfer | required | required (different from sender) |

---

## Validation Errors

| Scenario | Error Message |
|----------|---------------|
| Missing receiverUserId for deposit | `receiverUserId is required for deposit` |
| Missing senderUserId for withdraw | `senderUserId is required for withdraw` |
| Sender not found | `Sender user does not exist` |
| Receiver not found | `Receiver user does not exist` |
| No sender banking | `Sender has no banking details configured` |
| Incomplete sender banking | `Sender banking details are incomplete` |
| No receiver banking (transfer) | `Receiver has no banking details configured` |
| Same account transfer | `Cannot transfer to the same account` |

---

## Dependencies

### Production

- @nestjs/common, @nestjs/core, @nestjs/platform-express
- @nestjs/typeorm, typeorm, pg
- @nestjs/swagger
- amqplib
- ioredis
- class-validator, class-transformer
- uuid

### Development

- jest, @types/jest
- @testcontainers/postgresql
- @faker-js/faker
- supertest
- ts-jest

---

## License

MIT License.