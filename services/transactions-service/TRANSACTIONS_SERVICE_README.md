# Loomi Banking - Transactions Service

## Features

### 1. Transaction CRUD (Core Operations)
- Create new transactions with validation:
  - `userId`
  - `type` (`deposit`, `withdraw`, `transfer`)
  - `amount`
  - optional `description`
- Retrieve transactions by ID.
- List all transactions ordered by creation date.
- Update transaction status (`pending`, `completed`, `failed`).

### 2. User & Banking Validation (via Redis cache)
Before a transaction is created, the service verifies:

- **User existence**  
  Looks up `user:{userId}` in Redis to confirm the user exists.

- **Banking details for withdraw/transfer**  
  Requires cached `user:{id}:banking`, ensuring:
  - `agency`
  - `accountNumber`
  - `accountType`

Invalid or incomplete data results in immediate rejection, ensuring safety and correctness.

### 3. Caching Layer (Redis)
- Stores user and banking data learned from RabbitMQ events.
- Enables fast validation without calling other services.
- Reduces network overhead and improves service independence.

### 4. Event Consumption (RabbitMQ Listener)
Subscribes to the `users.events` exchange and processes:

- `user.created`
- `banking_details.updated`

Updates the Redis cache ensuring the local state stays consistent with Users Service.

### 5. Event Publishing (RabbitMQ)
The service emits events to notify the system about transaction lifecycle changes:

- `transaction.created`
- `transaction.status_updated`

Events contain metadata such as identifiers, timestamps, type and amounts.

### 6. Validation Layer (class-validator)
DTO validation rules ensure:
- correct enums  
- UUID format  
- positive numeric values  
- proper payload structure  

Invalid requests are rejected centrally.

### 7. Structured Logging
A global interceptor logs:
- method
- URL
- execution time
- correlation ID

Supports debugging and production observability.

### 8. Idempotency (Redis-backed)
`POST /transactions` accepts an `Idempotency-Key` header.

This prevents:
- duplicate transaction processing
- double publishing of events
- inconsistent financial data

Repeated requests always return the same response.

### 9. Global Exception Handling
Custom standardized error responses ensure consistent API behavior.

### 10. Swagger Documentation
Complete OpenAPI documentation including:
- routes
- request bodies
- response schemas

Available at `/api`.

### 11. Modular Architecture
The service is structured into clear modules:
- Transactions
- RabbitMQ
- Redis
- Idempotency
- Database (TypeORM)

Supports maintainability, scaling, and testing.
