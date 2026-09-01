# Objetivo 13 — Handoff Readiness + Timeouts, Parte A de 2

Fecha local: 2026-08-31 (America/Lima).

Este documento cierra únicamente la Parte A. No se ejecutó la regresión integral local, no se inició Production Readiness y no se hicieron cambios remotos.

## 1–5. Punto de partida y alcance

1. **Rama:** `feat/logistics-backend-foundation`.
2. **HEAD inicial:** `bee6be2a6b41d025818bc13596bb9ccb87d35f56` (`bee6be2 feat: harden logistics API security`).
3. **Worktree inicial:** limpio; `git diff --check` PASS.
4. **Baseline ligero inicial:** typecheck PASS; unitarias `140/140` en 20 suites; compile PASS. No se ejecutaron E2E, concurrencia, Realtime ni CHECKOUT_CHANGED en Parte A.
5. **Archivos modificados:** `apps/api/.env.example`, `apps/api/src/app.ts`, `apps/api/src/config/env.ts`, `apps/api/src/config/supabase.ts`, `apps/api/src/routes/health.routes.ts`. Archivos nuevos: `apps/api/src/config/supabase-fetch.ts`, `apps/api/src/readiness/readiness.service.ts`, `apps/api/src/tests/readiness-timeouts.test.ts` y este handoff.

## 6–18. Transporte HTTP Supabase y errores

6. **Arquitectura final custom fetch:** `createTimeoutFetch` crea el fetch común. `supabaseFetch` se construye una vez desde env y se pasa mediante `global.fetch` tanto al singleton `supabaseAdmin` como a cada cliente fresco de `createSupabaseAuthClient()`. `createSupabaseAdminClient` y `createSupabaseAuthClient` aceptan config/fetch inyectables para tests, sin mutar `process.env` después de imports.
7. **Timeout default:** `SUPABASE_REQUEST_TIMEOUT_MS=8000`, validado como integer entre 1000 y 30000 ms.
8. **Combinación con caller signal:** el wrapper conserva `Request`/URL e init (headers, method y body), obtiene tanto el signal propio de un `Request` como `init.signal`, elimina duplicados y propaga el primer abort a un `AbortController` interno. El timeout nunca reemplaza ni ignora un abort del caller.
9. **Cleanup:** el timeout se implementa con timer + abort real, no con `Promise.race`. En `finally` se cancela el timer y se eliminan todos los listeners añadidos. Si el caller ya estaba abortado, no se programa timer. El fetch upstream es awaited, evitando rechazos sin observar.
10. **Cobertura Auth:** `signInWithPassword()` y `getUser()` de los clientes frescos usan el fetch común. `AuthRetryableFetchError status=0` no preserva con fiabilidad timeout frente a network; el gateway conserva su respuesta existente HTTP 503 `AUTH_PROVIDER_UNAVAILABLE`, sin string matching.
11. **Cobertura PostgREST:** `.from()` del singleton administrativo usa el fetch común. El test llama una lectura real del cliente contra un fetch inyectado y verifica el request PostgREST.
12. **Cobertura RPC:** `.rpc()` usa el mismo fetch común. No se añadió wrapper repository por repository ni retry adicional.
13. **Impacto Realtime:** `global.fetch` también queda disponible para caminos HTTP auxiliares internos de Supabase. No se configura `realtime.transport`; el WebSocket persistente sigue sin estar envuelto como una operación HTTP de 8 segundos. No se modificó código ni SQL Realtime.
14. **Clasificación real de timeout:** el wrapper puede identificar robustamente su propio vencimiento y lanza `SupabaseRequestTimeoutError`. Readiness transforma timeout/fallo a 503 `{ "status": "not_ready" }`. No se fuerza HTTP 504 en Auth/PostgREST/RPC después de que `supabase-js` transforme la causa.
15. **Clasificación network failure:** readiness devuelve 503 `not_ready`; Auth devuelve 503 `AUTH_PROVIDER_UNAVAILABLE`. PostgREST/RPC conservan los mappers sanitizados existentes y no se reclasifican mediante message/hint/raw text. No se expone hostname, URL, SQL, stack, JWT ni service key.
16. **Limitación encontrada en supabase-js 2.112.3:** Auth convierte abort/network en `AuthRetryableFetchError status=0`; PostgREST sin `throwOnError` puede convertir AbortError en resultado status 0. Esa transformación impide distinguir timeout de network de forma sólida en capas superiores. Por eso no se implementó clasificación 504 distribuida ni matching de strings. La documentación oficial confirma `global.fetch`; el changelog filtrado no mostró un breaking change aplicable a Node 22/custom fetch.
17. **Timeout de writes:** un abort del cliente no demuestra rollback. PostgreSQL puede haber recibido o confirmado orden, transferencia, cancelación, gasto, pago, cierre o reconciliación antes del abort. **EL FUTURO CLIENTE DEBE REFETCH EL ESTADO ANTES DE DECIDIR REINTENTAR UNA ESCRITURA QUE TERMINÓ EN TIMEOUT.** No se añadieron idempotency keys; resolver globalmente esa ambigüedad queda fuera de scope.
18. **Retries nuevos:** NO. El wrapper llama exactamente una vez al fetch subyacente. No se reemplazó la política nativa de lecturas idempotentes de Supabase y no se añadieron retries para writes.

## 19–26. Liveness, readiness y configuración

19. **`GET /health`:** conserva el contrato anterior, responde 200 si Express vive, no llama readiness/Supabase/DB/Auth, sigue fuera del limiter `/api` y funciona aunque readiness falle.
20. **`GET /health/ready`:** nuevo endpoint, responde 200 `{ "status": "ready" }` o 503 `{ "status": "not_ready" }`. Siempre aplica `Cache-Control: no-store`, conserva `X-Request-ID` y nunca devuelve detalles upstream.
21. **Probe elegido:** query read-only `supabaseAdmin.from("profiles").select("id").limit(1).abortSignal(signal)`. Es barata, funciona con cero filas, comprueba PostgREST → PostgreSQL, no usa Auth Admin, RPC nuevo, count, side effects, SQL ni migration.
22. **Readiness timeout:** `READINESS_TIMEOUT_MS=2000`, validado como integer entre 250 y 10000 ms. Un `AbortController` dedicado cancela el probe realmente; no se usa probe obligatorio al startup.
23. **Cache TTL:** 3000 ms constantes, en memoria y best-effort por instancia. Cachea brevemente tanto `ready` como `not_ready`; al expirar vuelve a probar. No se añadió env de TTL, Redis ni cache DB.
24. **Coalescing:** existe una sola promesa in-flight por instancia. Veinte checks concurrentes comparten un probe; al resolver se publica el resultado cacheado y se libera la referencia in-flight.
25. **Variables env:** nuevas `SUPABASE_REQUEST_TIMEOUT_MS` y `READINESS_TIMEOUT_MS`; ambas documentadas en `.env.example`. `.env` no fue modificado. Config inválida falla startup; caída temporal de Supabase no impide iniciar Express.
26. **Dependencias npm añadidas:** ninguna. No cambió `package.json` ni lockfile.

## 27–35. Tests, validación y riesgos

27. **Tests nuevos:** `apps/api/src/tests/readiness-timeouts.test.ts`, 20 casos sin sleeps largos. Cubren liveness, readiness healthy/failure/timeout, contrato sanitizado, no-store, request ID, probe mínimo, coalescing, cache/expiración, abort de timeout/caller, cleanup, Auth, PostgREST, RPC, logs, ausencia de retry, env y WebSocket no envuelto.
28. **Resultado exacto suite nueva:** `20/20` PASS, 1 suite. Se ejecutó aislada con `NODE_ENV=test node --test --import tsx src/tests/readiness-timeouts.test.ts`.
29. **`npm test` final Parte A:** `160/160` PASS en 21 suites; baseline 140 + 20 nuevos.
30. **Hardening:** `25/25` PASS.
31. **Typecheck:** PASS.
32. **Compile:** PASS.
33. **`git diff --check`:** PASS antes de crear el handoff; debe repetirse como última operación después de este archivo.
34. **SQL/remoto:** NO. Sin cambios en SQL, migrations, RPCs, triggers, RLS, Realtime SQL, `database.types.ts`, frontend ni datos remotos. No hubo `db push`, deploy, commit, push o merge.
35. **Riesgos/dudas:** (a) los timeouts de writes tienen resultado indeterminado y exigen refetch antes de retry; (b) la clasificación timeout/network se pierde dentro de Auth/PostgREST, así que no existe 504 general; (c) cache/coalescing es por instancia serverless; (d) los caminos reales contra Supabase local y el contrato Realtime/WebSocket todavía deben verificarse en Parte B; (e) el fetch timeout sí alcanza HTTP auxiliar de Realtime, pero no el WebSocket persistente.

36. **Pendientes exactos para Parte B:** revisar este handoff y el diff completo; validar Auth, PostgREST y RPC contra Supabase local real; ejecutar toda la regresión; confirmar cardinalidades exactas; revisar que los resets locales no descubran incompatibilidades; crear el reporte final de Readiness + Timeouts. No iniciar npm audit, Vercel/deploy ni Production Readiness dentro de esa validación.

## INSTRUCCIONES EXACTAS PARA PARTE B

1. Leer completo este handoff.
2. Revisar el diff de Parte A y confirmar que no contiene SQL, migrations, RLS, RPC changes, Realtime SQL, `database.types.ts`, frontend ni `.env`.
3. Validar con Supabase LOCAL real que el custom fetch funciona en:
   - Auth (`signInWithPassword` y `getUser`).
   - PostgREST (`.from()`).
   - RPC (`.rpc()`).
4. Ejecutar, en este orden:
   - `npm run typecheck`
   - `npm test`
   - `npm run compile`
   - `npm run test:hardening`
   - `npm run test:e2e:local`
   - `npm run test:concurrency:local`
   - `npm run test:realtime:local`
   - `npm run test:checkout-changed:local`
5. Confirmar Realtime `1/1` con exactamente `33` broadcasts.
6. Confirmar concurrency `9/9`.
7. Confirmar CHECKOUT_CHANGED `14/14`.
8. Repetir `git diff --check` y la auditoría de scope.
9. Crear el reporte final de Readiness + Timeouts con resultados exactos y limitaciones.
10. NO hacer commit/push hasta revisión humana. No ejecutar `db push`, remoto, deploy, npm audit ni Vercel.
