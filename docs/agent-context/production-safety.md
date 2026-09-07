# KUCHI'S — Production Safety Context

Use this file only for Production/Vercel/Supabase audits, deployments, env/CORS work or human smoke tests.

## Canonical Production services

- Supabase project: `Kuchis`
- Supabase ref: `jijdfljbuyvdoobhdwlo`
- Region: `sa-east-1`
- Canonical backend: `https://kuchis-logistic-api.vercel.app`
- Public client: `https://kuchis-client.vercel.app`

Do not place secret values in this document.

## Safety defaults

- Audits are read-only by default.
- Prefer logs, GET endpoints and read-only SQL for diagnosis.
- Do not mutate Production merely to prove a hypothesis when logs/read paths can resolve it.
- If a smoke test requires mutations, use the official backend HTTP API rather than direct SQL.
- Record IDs/state needed for cleanup, then clean up all smoke-created operational state.
- After cleanup, verify the final state with authoritative reads.

## CORS / local smoke

Production API configuration is fail-closed. `CORS_ALLOWED_ORIGINS` is required and wildcard Production CORS is not allowed.

Normal Production should not retain temporary localhost origins. If a human local smoke explicitly requires localhost:

1. add only the exact localhost origin needed;
2. redeploy/verify;
3. run the controlled smoke;
4. remove localhost again;
5. redeploy and verify normal Production CORS is restored.

Do not weaken env validation or CORS code to avoid this procedure.

## Vercel project caution

The repository has historically had more than one Vercel API project. Treat `kuchis-logistic-api` as the canonical backend unless the task explicitly concerns a legacy deployment.

`apps/client` should use `NEXT_PUBLIC_API_URL=https://kuchis-logistic-api.vercel.app` in its deployed environment. The public client loads `/api/categories` and `/api/products` through that API.

When diagnosing a frontend data outage, verify the actual deployment/env target before assuming Supabase is unavailable.

## Supabase caution

- Do not use direct SQL to perform app/business mutations during smoke tests.
- Read-only SQL is acceptable for audits and post-action verification.
- Do not modify RLS/policies/migrations outside an explicit backend/database task.
- Never expose service-role/secret keys to browser code.

## Certification discipline

A Production smoke is complete only when:

- the intended behavior was observed;
- authoritative backend/database state confirms it when relevant;
- temporary smoke data/state is cleaned up;
- temporary CORS/config changes are reverted;
- the final Production state is verified clean.
