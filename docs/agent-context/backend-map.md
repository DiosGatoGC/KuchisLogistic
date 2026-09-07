# KUCHI'S — Backend Map for Agents

Use this file only when a task needs API contract locations, capability names, or backend invariants. Read the referenced route/schema/service files for exact payloads instead of scanning all `apps/api`.

## Canonical routing

Mounted in `apps/api/src/app.ts`:

- public catalog: `/api/categories`, `/api/products`
- auth: `/api/logistics/auth`
- expenses: `/api/logistics/expenses`
- history: `/api/logistics/history`
- users: `/api/logistics/users`
- shifts: `/api/logistics/shifts`
- service points: `/api/logistics/service-points`
- service sessions: `/api/logistics/sessions`
- logistics catalog: `/api/logistics/catalog`
- preparation: `/api/logistics/preparation`
- orders, checkout and transfers mount under `/api/logistics`

## Objective 5-relevant routes

Use these source files for the exact request/response schemas and service behavior:

### Tables/service sessions

`apps/api/src/modules/service-points/service-points.routes.ts`

- `GET /api/logistics/service-points`
- `GET /api/logistics/service-points/status`
- `POST /api/logistics/service-points/:id/open`

`apps/api/src/modules/service-points/service-sessions.routes.ts`

- `GET /api/logistics/sessions/:id`
- `POST /api/logistics/sessions/:id/await-payment`
- `POST /api/logistics/sessions/:id/reopen`
- `POST /api/logistics/sessions/:id/release`

### Orders/corrections

`apps/api/src/modules/orders/orders.routes.ts`

- `GET /api/logistics/sessions/:sessionId/orders`
- `POST /api/logistics/sessions/:sessionId/orders`
- `GET /api/logistics/orders/:id`
- `POST /api/logistics/order-items/:id/start`
- `POST /api/logistics/order-items/:id/ready`
- `POST /api/logistics/order-items/:id/deliver`
- `POST /api/logistics/order-items/:id/cancel`

### Transfers

`apps/api/src/modules/transfers/transfers.routes.ts`

- `POST /api/logistics/sessions/:id/transfer`
- `POST /api/logistics/order-items/:id/transfer`

For payload fields, validation rules, conflict behavior and error codes, open only the sibling `*.schemas.ts`, controller/service/repository files for the operation being implemented.

## Capability map

Canonical list: `apps/api/src/authorization/capabilities.ts`.

Relevant operational capabilities include:

- `tables.view`
- `tables.operate`
- `tables.release`
- `orders.create`
- `orders.transfer`
- `orders.cancel`
- `orders.kitchen.view`
- `orders.kitchen.manage`
- `orders.drinks.view`
- `orders.drinks.manage`
- `catalog.availability`
- `payments.charge`
- `shift.open`, `shift.close`
- `expenses.view`, `expenses.manage`
- `cash.reconcile`
- `history.view`
- `users.manage`

Do not infer authorization from role names when a capability check exists.

## Stable backend invariants

- `apps/api` is the canonical operational HTTP API.
- Server-side Supabase access uses the configured administrative client; frontend operational mutations should go through HTTP endpoints, not direct database writes.
- Production environment validation is fail-closed; do not weaken it to make a deployment pass.
- `CORS_ALLOWED_ORIGINS` is required in Production and wildcard Production CORS is rejected.
- Private logistics/auth responses use no-store behavior; public catalog has separate cache behavior.
- HTTP/API errors have established middleware/mapping; preserve stable status/error semantics rather than throwing ad-hoc frontend assumptions.
- For write ambiguity (timeout/network loss after send), do not retry blindly; reconcile through a read endpoint where possible.

## Backend validation entry points

From `apps/api`:

- `npm test`
- `npm run test:hardening`
- `npm run typecheck`
- local integration suites exist for e2e, concurrency, realtime and checkout-changed.

Choose focused tests based on changed backend modules. Do not run all integration suites for a frontend-only task.
