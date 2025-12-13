# Loomi Banking - Users Service

## Features

### 1. User CRUD
- Create user with validation (`name`, `email`, `address`).
- Ensure email uniqueness across the system.
- Retrieve a user by ID, including banking details.
- List all users ordered by creation date.
- Update user fields with validation and unique email enforcement.
- Delete user by ID.

### 2. Banking Details Management
- One-to-one relationship between User and BankingDetails.
- Create or update banking details for a user:
  - `agency`
  - `accountNumber`
  - `accountType`
- Automatically persists changes and returns the updated state.

### 3. Caching (Redis)
- Caches results of `GET /users/:id` to reduce database load.
- Cache invalidation triggered on:
  - user update
  - user deletion
  - banking details update

### 4. Idempotency (Redis-backed)
- `POST /users` supports `Idempotency-Key` header.
- Prevents duplicate user creation in retry or timeout scenarios.
- Returns the original response for repeated requests with the same key.
- Ensures no duplicate domain events are emitted.

### 5. Event Publishing (RabbitMQ)
- Emits domain events for downstream services:
  - `user.created`
  - `banking_details.updated`
- Events include metadata such as timestamp, user identifiers, and updated fields.

### 6. Validation Layer (class-validator)
- Strong DTO validation for all request payloads.
- Automatic payload transformation and property whitelisting.
- Unknown or invalid fields are rejected.

### 7. Global Exception Handling
- Custom HTTP exception filter standardizes error responses.
- Consistent error shapes across the service.

### 8. Structured Logging
- Custom LogInterceptor logs all requests with:
  - method
  - URL
  - correlation ID (Request-ID)
  - execution time
- Useful for debugging, tracing and observability.

### 9. Swagger Documentation
- Full OpenAPI documentation available for all endpoints.
- Includes DTO schemas, response descriptions and endpoint summaries.

### 10. Modular Architecture
- Isolated modules for:
  - Users
  - BankingDetails
  - Redis
  - RabbitMQ
  - Idempotency
- Promotes maintainability and separation of concerns.