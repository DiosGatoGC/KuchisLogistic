# Objetivo 13 — Reporte final Readiness + Timeouts

Fecha local de cierre: 2026-09-01 (America/Lima).

## 1–9. Estado y arquitectura final

1. **Rama:** `feat/logistics-backend-foundation`.
2. **HEAD inicial de Parte B:** `1590835d6b45d6a666cc6e3662653c45ce4ee6a4` (`1590835 feat: add API readiness and supabase timeouts`). Worktree inicial limpio y `git diff --check` PASS.
3. **Parte A resumida:** incorporó custom fetch central para los clientes productivos Supabase, abort HTTP real, dos variables de timeout validadas, `GET /health/ready`, probe read-only, cache corta, coalescing y 20 tests. No añadió retries, dependencias npm, SQL, remoto ni frontend.
4. **Arquitectura custom fetch:** `createTimeoutFetch` envuelve una sola vez `globalThis.fetch`; `supabaseFetch` se inyecta mediante `global.fetch` en el singleton `supabaseAdmin` y en cada cliente fresco de `createSupabaseAuthClient()`. `createSupabaseAdminClient`/`createSupabaseAuthClient` conservan inyección explícita para tests.
5. **`SUPABASE_REQUEST_TIMEOUT_MS`:** default 8000 ms; rango Zod 1000–30000 ms.
6. **`READINESS_TIMEOUT_MS`:** default 2000 ms; rango Zod 250–10000 ms.
7. **AbortSignal:** el timeout usa `AbortController` y aborta la operación fetch upstream; no usa `Promise.race` como timeout aparente.
8. **Caller signal:** combina el signal de un `Request` y `init.signal`, elimina duplicados y propaga el primer abort sin perder Request/URL, headers, método o body.
9. **Cleanup:** limpia el timer y elimina listeners en `finally`; no programa timer si el caller ya estaba abortado; el fetch se espera directamente y no deja rechazo sin observar.

## 10–19. Validación Supabase LOCAL y semántica de fallos

10. **Auth validado contra Supabase LOCAL:** SÍ. `test:e2e:local` pasó `1/1`; el harness invoca `POST /api/logistics/auth/login`, que llega a `createSupabaseAuthClient().auth.signInWithPassword()`. Luego llama `GET /api/logistics/auth/me` y múltiples endpoints privados con Bearer token, haciendo que el middleware use `createSupabaseAuthClient().auth.getUser()`.
11. **PostgREST validado contra Supabase LOCAL:** SÍ. El mismo E2E atraviesa endpoints productivos de lectura —por ejemplo service points, current shift, session/order detail y preparation queues— cuyos repositories usan `supabaseAdmin.from()`. Las lecturas directas del cliente del harness sólo verifican el estado final y no se confunden con esta evidencia del wiring productivo.
12. **RPC validado contra Supabase LOCAL:** SÍ. El E2E ejecuta mediante HTTP productivo apertura de turno/punto, creación y transición de órdenes, checkout/pago, gastos, cierre y reconciliación; esas mutaciones llegan a `supabaseAdmin.rpc()` con el custom fetch.
13. **Evidencia exacta:** la suite `real HTTP to PostgreSQL logistics lifecycle` cerró `1/1` PASS después de reset local completo. Login 200 prueba `signInWithPassword`; `/auth/me` 200 y cada request privada autenticada prueban `getUser`; lecturas API 200 prueban `.from()`; operaciones 201/200 y verificaciones PostgreSQL finales prueban `.rpc()`. No se conectó a Supabase remoto.
14. **Realtime/WebSocket:** `test:realtime:local` pasó `1/1` con exactamente 33 broadcasts. No existe `realtime.transport` custom; el WebSocket persistente no quedó sujeto al timeout HTTP de 8 segundos. El global custom fetch sólo puede alcanzar caminos HTTP auxiliares de la librería.
15. **Clasificación timeout:** `SupabaseRequestTimeoutError` identifica robustamente el vencimiento dentro del wrapper. Readiness lo reduce a 503 `{ "status": "not_ready" }`. No se fuerza 504 después de que Auth/PostgREST transforman la causa.
16. **Clasificación network:** readiness devuelve 503 `not_ready`; Auth conserva 503 `AUTH_PROVIDER_UNAVAILABLE`. PostgREST/RPC mantienen sus errores públicos sanitizados existentes. No se usa matching de `message`, `hint` ni raw Supabase text.
17. **Limitaciones supabase-js 2.112.3:** Auth convierte abort/network en `AuthRetryableFetchError status=0`; PostgREST sin `throwOnError` puede transformar AbortError en un resultado status 0. La causa final no permite distinguir timeout/network de forma sólida en capas superiores.
18. **Timeout de writes:** un abort HTTP no demuestra rollback. Una escritura puede haber llegado o confirmado antes del timeout. **EL FUTURO CLIENTE DEBE REFETCH EL ESTADO ANTES DE DECIDIR REINTENTAR UNA ESCRITURA QUE TERMINÓ EN TIMEOUT.** Concurrencia y CHECKOUT_CHANGED confirman integridad, pero no eliminan esta ambigüedad distribuida.
19. **Nuevos retries:** NO. No se añadieron retries a órdenes, transferencias, cancelaciones, gastos, pagos, cierre, reconciliación ni otras escrituras; tampoco se reemplazó la política nativa de lecturas idempotentes de Supabase.

## 20–28. Health, readiness, startup y shutdown

20. **`GET /health`:** liveness puro; HTTP 200 mientras Express vive, sin Supabase, DB ni Auth. Sigue fuera del limiter `/api` y antes del parser JSON.
21. **`GET /health/ready`:** 200 `{ "status": "ready" }` o 503 `{ "status": "not_ready" }`; siempre `Cache-Control: no-store`, con `X-Request-ID` y sin detalle upstream.
22. **Readiness probe:** `supabaseAdmin.from("profiles").select("id").limit(1).abortSignal(signal)`. Es read-only, barato, sin count completo, side effects, Auth Admin, RPC nuevo, tabla nueva, SQL ni migration; funciona con cero filas.
23. **Cache TTL:** 3000 ms en memoria, tanto para `ready` como para `not_ready`; best-effort por instancia y nunca indefinida.
24. **Coalescing:** una única promesa in-flight por instancia; 20 checks concurrentes comparten un probe y el siguiente probe ocurre al expirar el TTL.
25. **Startup:** configuración inválida falla el import/startup. Una caída temporal de Supabase no bloquea Express porque no existe probe obligatorio al arrancar; `/health` permanece 200 y `/health/ready` devuelve 503.
26. **Shutdown audit:** local importa Express y ejecuta `app.listen(env.PORT)` sólo cuando `VERCEL` no está definido. Vercel consume directamente el export default de Express. No hay pool DB propio, worker/background job, queue ni recurso persistente adicional que cerrar en este checkpoint. No se implementó lifecycle específico de Vercel.
27. **Dependencias npm nuevas:** ninguna en Readiness + Timeouts; `package.json` y lockfile no cambiaron.
28. **Archivos modificados en Parte B:** sólo este reporte. La revisión y regresión no demostraron ningún bug de Parte A, por lo que no se modificó código ni tests.

## 29–39. Regresión completa

29. **Typecheck:** PASS.
30. **Unitarias:** `160/160` PASS en 21 suites.
31. **Readiness/timeouts:** `20/20` PASS, incluida dentro de `npm test`.
32. **Hardening:** `25/25` PASS.
33. **Compile:** PASS.
34. **E2E:** `1/1` PASS, lifecycle HTTP → Auth/PostgREST/RPC → PostgreSQL real local.
35. **Concurrency:** `9/9` PASS; invariantes A–H intactas y sin retry automático.
36. **Realtime:** `1/1` PASS; suscripciones privadas y autorizaciones intactas.
37. **Broadcasts Realtime:** exactamente `33`: SHIFT_CHANGED 2, TABLES_CHANGED 7, ORDERS_CHANGED 7, kitchen PREPARATION_CHANGED 4, drinks PREPARATION_CHANGED 4, CATALOG_CHANGED 4 y FINANCE_CHANGED 5.
38. **CHECKOUT_CHANGED:** `14/14` PASS; token/fingerprint, stale detection, CARD 5%, locking, pago y firma RPC sin cambios.
39. **`git diff --check`:** PASS final. El chequeo adicional del reporte no encontró whitespace al final de línea; no hubo warnings en el precheck ni durante la regresión.

## 40–43. Scope y deuda restante

40. **SQL changes:** NO. Sin cambios en migrations, schema, RPCs, triggers, RLS ni Realtime SQL.
41. **Remote changes:** NO. No hubo `db push`, acceso a datos remotos, deploy, commit, push ni merge en Parte B.
42. **Frontend changes:** NO. Sin cambios en `apps/client`, `apps/logistics`, frontend, `.env` ni `packages/shared/database.types.ts`.
43. **Deuda restante del Objetivo 13:** revisión humana y commit/push posterior de este reporte; Production Readiness/Vercel, topología final de proxy, decisión sobre rate limiting distribuido/WAF, auditoría npm/dependencias, deploy y monitoreo externo; el futuro frontend debe implementar refetch antes de retry tras timeout de write. Esos checkpoints no se iniciaron.

## Criterio final

- CUSTOM FETCH AUTH / POSTGREST / RPC VALIDADO LOCAL ✅
- ABORT REAL / CALLER SIGNAL / CLEANUP ✅
- NO RETRIES NUEVOS ✅
- LIVENESS SEPARADO DE READINESS ✅
- READINESS REAL / TIMEOUT / CACHE / COALESCING ✅
- WEBSOCKET REALTIME INTACTO: 1/1, 33 BROADCASTS ✅
- CONCURRENCIA 9/9 ✅
- CHECKOUT_CHANGED 14/14 ✅
- NO SQL / NO REMOTO / NO FRONTEND ✅
