# Loomi Banking --- Distributed Microservices Architecture

Loomi Banking is a financial microservices platform built with NestJS,
PostgreSQL, Redis, and RabbitMQ.\
The system adopts domain-driven design principles, asynchronous
messaging, loose coupling, and fully independent service boundaries.

The platform consists of three core services:

-   **Users Service** --- user creation, updates, and banking details
    management\
-   **Transactions Service** --- transaction creation, validation, and
    status updates\
-   **API Gateway** --- unified external entrypoint that routes requests
    to internal services

This document explains how to run the system locally, how the
architecture is designed, and which features are included.

------------------------------------------------------------------------

## 1. Architecture Overview

                             API Gateway (NestJS)
                                    |
               ------------------------------------------------
               |                                              |
        Users Service                                  Transactions Service

(User CRUD, Banking Info) (Business transactions) \| \|
----------------- Domain Events ------------ RabbitMQ (topic exchange)

       PostgreSQL per service           Redis (cache + idempotency keys)

### Technologies

-   NestJS\
-   TypeORM (PostgreSQL)\
-   Redis (caching and idempotency)\
-   RabbitMQ (async messaging)\
-   Swagger / OpenAPI\
-   Docker Compose\
-   Jest (unit testing)

------------------------------------------------------------------------

## 2. Running the System

### 2.1 Copy environment files

Each service includes a `.env.example`. You must copy it manually:

``` bash
cp services/users-service/.env.example services/users-service/.env
cp services/transactions-service/.env.example services/transactions-service/.env
cp services/api-gateway/.env.example services/api-gateway/.env
```

Adjust values if necessary.\
The defaults assume the Docker Compose network.

### 2.2 Start the full stack

From the project root:

``` bash
docker-compose up --build
```

This starts:

-   PostgreSQL\
-   Redis\
-   RabbitMQ\
-   Users Service\
-   Transactions Service\
-   API Gateway

### 2.3 Service URLs

-   **API Gateway:** http://localhost:3000\
-   **Users Service:** http://localhost:3001\
-   **Transactions Service:** http://localhost:3002\
-   **RabbitMQ Management:** http://localhost:15672

Swagger docs:

-   Users Service → http://localhost:3001/api-docs\
-   Transactions Service → http://localhost:3002/api-docs

------------------------------------------------------------------------

## 3. Users Service --- Features

### 3.1 User CRUD

-   Create users with validation (name, email, address).\
-   Enforced unique email.\
-   Retrieve user details including banking information.\
-   Update user fields with validation.\
-   Delete users.

### 3.2 Banking Details

-   One-to-one relational model.\
-   Endpoint to create or update banking information.\
-   Automatically tied to the user record.

### 3.3 Redis Caching

Caches `GET /users/:id`.

Cache invalidated on:

-   user update\
-   user deletion\
-   banking details update

### 3.4 Idempotency (Redis)

Uses `Idempotency-Key` header on `POST /users`.

Prevents duplicate user creation during retries, replaying the same
response and avoiding double events.

### 3.5 RabbitMQ Events

Events emitted:

-   `user.created`\
-   `banking_details.updated`

Used internally by the Transactions Service.

### 3.6 Global Error Handling

Custom exception filter returning consistent structured JSON errors.

### 3.7 Logging Interceptor

Logs method, route, duration, request ID --- improving observability.

------------------------------------------------------------------------

## 4. Transactions Service --- Features

### 4.1 Transaction Creation

-   Validates user cache.\
-   Requires banking details for withdraw/transfer.\
-   Stores transaction with status **PENDING**.\
-   Emits `transaction.created`.

### 4.2 Status Update

Updates status to `SUCCESS` or `FAILED` and emits
`transaction.status_updated`.

### 4.3 RabbitMQ Consumer

Consumes:

-   `user.created` --- caches minimal user info\
-   `banking_details.updated` --- caches banking info

Removes synchronous dependency on Users Service.

### 4.4 Redis Integration

Stores:

-   Cached user metadata\
-   Cached banking details

Used to validate transactions without hitting databases.

### 4.5 Global Logging & Error Handling

Follows same structure as the Users Service.

------------------------------------------------------------------------

## 5. API Gateway

Acts as centralized proxy:

-   `/users/*` → Users Service\
-   `/transactions/*` → Transactions Service

Keeps internal services isolated.

------------------------------------------------------------------------

## 6. Testing

### 6.1 Unit Tests

Located in:

    services/users-service/src/**/*.spec.ts

Run:

``` bash
npm run test
```

### 6.2 No E2E Tests Yet

Project does **not** include:

-   E2E tests\
-   Testcontainers\
-   `/test` folder

Recommended for future improvements.

------------------------------------------------------------------------

## 7. Continuous Integration

CI performs:

-   Install dependencies\
-   TypeScript build\
-   Run unit tests\
-   Fail on any error

------------------------------------------------------------------------

## 8. Future Improvements

### Architecture

-   JWT authentication at Gateway\
-   Rate limiting\
-   Circuit breaker\
-   Outbox Pattern\
-   Retry mechanisms

### Observability

-   Centralized logs\
-   Prometheus metrics\
-   OpenTelemetry

### Features

-   Account balance\
-   Transaction reversal\
-   Sagas for transfers\
-   Fraud detection

### Testing

-   Full E2E\
-   RabbitMQ mocking\
-   Stress tests

------------------------------------------------------------------------

## 9. License

MIT License.