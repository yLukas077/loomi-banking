# Loomi Banking - Users Service

## Overview

The Users Service is responsible for user lifecycle management, banking details, and balance tracking in the Loomi Banking platform.

## Features

### 1. User CRUD (Core Operations)

- Create new users with validation:
  - `name` (required)
  - `email` (required, unique)
  - `address` (optional)
- Retrieve users by ID (with Redis caching)
- List all users ordered by creation date
- Update user fields with validation
- Delete users

### 2. Banking Details Management

- One-to-one relationship with User entity
- Create or update banking information:
  - `agency` (required)
  - `accountNumber` (required)
  - `accountType` (required: `checking` | `savings`)
- Publishes `banking_details.updated` event on change

### 3. User Balance

- Decimal field with precision (12,2)
- New users start with balance = 0
- Automatically updated when transactions complete
- Endpoint: `GET /users/:id/balance`

Response:
```json
{
  "userId": "uuid",
  "balance": 500.50,
  "updatedAt": "2025-12-15T00:00:00.000Z"
}
```

### 4. Caching Layer (Redis)

- Caches user data on `GET /users/:id`
- TTL: 300 seconds (5 minutes)
- Cache invalidated on:
  - User update
  - User deletion
  - Banking details update

### 5. Event Publishing (RabbitMQ)

Publishes to `users` exchange (topic):

| Event | Routing Key | Trigger |
|-------|-------------|---------|
| `user.created` | `user.created` | New user created |
| `banking_details.updated` | `banking_details.updated` | Banking info set/updated |

Event payload example:
```json
{
  "event": "user.created",
  "userId": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "timestamp": "2025-12-15T00:00:00.000Z"
}
```

### 6. Event Consumption (RabbitMQ)

Subscribes to `transactions` exchange and processes:

| Event | Action |
|-------|--------|
| `transaction.status_updated` | Updates user balance when `newStatus: 'completed'` |

Balance update logic:

| Transaction Type | Sender | Receiver |
|-----------------|--------|----------|
| deposit | — | +amount |
| withdraw | -amount | — |
| transfer | -amount | +amount |

### 7. Idempotency (Redis-backed)

`POST /users` accepts an `Idempotency-Key` header.

Prevents:
- Duplicate user creation
- Double publishing of events
- Inconsistent data

### 8. Validation Layer (class-validator)

DTO validation ensures:
- Email format validation
- Required fields enforcement
- Enum validation for `accountType`

### 9. Global Exception Handling

Custom exception filter providing consistent error responses:

```json
{
  "statusCode": 400,
  "timestamp": "2025-12-15T00:00:00.000Z",
  "path": "/users",
  "method": "POST",
  "message": "Email already exists",
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

---

## API Endpoints

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/users` | Create user |
| GET | `/users` | List all users |
| GET | `/users/:id` | Get user by ID |
| GET | `/users/:id/balance` | Get user balance |
| PATCH | `/users/:id` | Update user |
| DELETE | `/users/:id` | Delete user |

### Banking Details

| Method | Endpoint | Description |
|--------|----------|-------------|
| PATCH | `/users/:id/banking-details` | Set/update banking details |

---

## Environment Variables

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=users_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# App
PORT=3001
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

**Coverage:** ~77%+

Unit tests cover:
- UsersService (CRUD, balance, banking)
- UsersController
- TransactionsConsumer (balance updates)
- DTOs validation
- Redis service
- RabbitMQ publisher
- Exception filters
- Interceptors
- Middleware

### E2E Tests

```bash
npm run test:e2e
```

Uses Testcontainers for isolated PostgreSQL database.

E2E tests cover:
- User creation with balance initialization
- User retrieval with banking details
- Balance endpoint
- Banking details creation/update
- User deletion
- Error scenarios (404, 409, 400)

---

## Project Structure

```
src/
├── users/
│   ├── dto/
│   │   ├── create-user.dto.ts
│   │   ├── update-user.dto.ts
│   │   └── banking-details.dto.ts
│   ├── entities/
│   │   ├── user.entity.ts
│   │   └── banking-details.entity.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── users.module.ts
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
│   ├── users.service.spec.ts
│   ├── users.controller.spec.ts
│   ├── transactions.consumer.spec.ts
│   ├── dto.spec.ts
│   └── ...
└── e2e/
    └── users.e2e-spec.ts
```

---

## Entity Schemas

### User

```typescript
{
  id: string (UUID, PK)
  name: string
  email: string (unique)
  address?: string
  balance: decimal(12,2) // default: 0
  createdAt: Date
  updatedAt: Date
  bankingDetails?: BankingDetails
}
```

### BankingDetails

```typescript
{
  id: string (UUID, PK)
  agency: string
  accountNumber: string
  accountType: 'checking' | 'savings'
  userId: string (FK)
}
```

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
- supertest
- ts-jest

---

## License

MIT License.