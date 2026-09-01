# Objetivo 13 — Reporte de implementación CHECKOUT_CHANGED

Fecha local de cierre: 2026-08-31 (America/Lima).

## 1–4. Estado inicial y baseline

1. **Rama:** `feat/logistics-backend-foundation`.
2. **HEAD inicial:** `407beb105a5737216602dad004c52466db5ea02c`.
3. **Estado Git inicial:** worktree limpio; `git diff --check` sin errores.
4. **Baseline:** typecheck PASS; unit tests `115/115`; compile PASS; E2E `1/1`; concurrencia `9/9`; Realtime `1/1` con exactamente `33` broadcasts. El primer intento unitario restringido falló por el entorno (`listen EPERM`); la repetición autorizada con sockets loopback pasó `115/115`, por lo que no fue una regresión de código.

Supabase local estaba activo con API `http://127.0.0.1:54321` y PostgreSQL `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## 5–13. Migración y arquitectura SQL

5. **Migración creada:** `20260901004016_logistics_checkout_changed.sql`, mediante `supabase migration new logistics_checkout_changed`. Es una única migración forward-only; no se editó ninguna migración histórica.
6. **Arquitectura:** PostgreSQL produce el preview atómico, el monto económico, las opciones financieras y el token; Node valida/mapea la respuesta pero no recalcula la cuenta.
7. **Helper canónico:** `private.logistics_checkout_state(uuid)`, `VOLATILE`, `SECURITY INVOKER`, `search_path=''`, read-only y resuelto en una única sentencia SQL con CTEs.
8. **Canonicalización:** versión interna `checkout.v1`; `serviceSessionId`; items no cancelados pertenecientes por `current_service_session_id`; por item: `itemId`, `productId`, cantidad y precio snapshot en centavos; por adicional: `additionId`, `productId`, `quantityPerItem` y precio snapshot en centavos. Items y adicionales se ordenan por UUID; los vacíos son `[]`; no se usan floats, nombres, notas, timestamps, `line_number`, punto, catálogo actual, método ni estado de preparación.
9. **Fingerprint:** SHA-256 hexadecimal sobre JSONB canónico mediante `extensions.digest`, sin HMAC ni secretos. El token es opaco, identifica composición económica y no autoriza ni define precio.
10. **Preview RPC:** `public.logistics_checkout_preview(uuid)` devuelve `session`, punto, `items`, `businessAmount`, `paymentOptions` y `checkoutToken` desde la misma proyección/snapshot.
11. **Firma nueva payment:** `public.logistics_pay_service_session(uuid, payment_method, text, uuid, user_role)`; el argumento nuevo es `p_expected_checkout_token text` y es obligatorio.
12. **Firma vieja eliminada:** se revocó y se hizo `DROP` de `public.logistics_pay_service_session(uuid, payment_method, uuid, user_role)`. La auditoría con `to_regprocedure` devolvió NULL para la firma vieja y la firma nueva para la de cinco argumentos.
13. **Locks/transacción:** se conserva `FOR UPDATE OF service_session` como barrera de serialización. El helper se invoca en una sentencia posterior y es `VOLATILE`, permitiendo que `READ COMMITTED` vea el commit de una mutación que pudo terminar mientras payment esperaba el lock. No se añadieron locks, triggers, tablas, columnas ni revisiones de checkout.

## 14–21. Validaciones, REST, backend, ACL y tipos

14. **Orden de validaciones:** actor e inputs → lock de sesión → estado de sesión/turno → pago existente → estado económico actual → comparación token → entrega operativa → monto → fee CARD → insert payment → PAID → audit. Esto conserva `PAYMENT_ALREADY_EXISTS` como precedencia del doble pago.
15. **CHECKOUT_CHANGED:** error `P0001` mapeado a HTTP 409 con mensaje público exacto `La cuenta cambió. Actualiza el checkout antes de cobrar.`; no se expone hash actual, SQL ni estado interno.
16. **Contrato REST final:** GET checkout conserva la forma previa y añade `checkoutToken`. POST payment acepta `{ "method": "CASH|YAPE|CARD", "expectedCheckoutToken": "opaque-string" }`.
17. **Token obligatorio:** ausente, no-string o vacío/blanco → HTTP 400; string opaco diferente → RPC y HTTP 409 `CHECKOUT_CHANGED`. No se exige formato SHA-256 al cliente y no existe fallback legacy.
18. **Cambios backend:** controller propaga el token; schema lo exige; repository usa sólo `logistics_checkout_preview` para GET y envía el token a payment; service valida la respuesta PostgreSQL sin recalcular montos; mapper añade los códigos; harness expone `previewCheckout`, `paySessionWithToken` y `paySession`.
19. **Cambios SQL:** extensión idempotente `pgcrypto` en `extensions`; helper privado; preview público backend-only; reemplazo de firma payment; comparación stale; grants/comments. No hay SQL Realtime nuevo.
20. **ACL/grants:** helper, preview y payment tienen EXECUTE sólo para `service_role`; `anon` y `authenticated` devolvieron `false` en `has_function_privilege`. Las tres funciones son `SECURITY INVOKER`, `VOLATILE` y `search_path=''`. `pgcrypto` y `extensions.digest(bytea,text)` están disponibles.
21. **Tipos regenerados:** `packages/shared/database.types.ts` se regeneró desde Supabase local. Añade `logistics_checkout_preview` y `p_expected_checkout_token`. El CLI local 2.115 omitió la metadata no-esquema `__InternalSupabase` presente en el artefacto anterior; no se editaron firmas generadas manualmente.

## 22–36. Cobertura CHECKOUT_CHANGED

22. **Unit tests:** `115/115`. Cubren schema obligatorio, token vacío/missing, propagación controller → service → repository → RPC, preview RPC único, mapping de preview y códigos sanitizados 400/409.
23. **Suite dedicada:** `apps/api/src/tests/integration/checkout-changed.test.ts`, conectada al runner protegido como `checkout-changed` y al script `test:checkout-changed:local`. Resultado final `14/14`, HTTP/PostgreSQL/Auth reales, loopback guard y reset antes/finally.
24. **Nueva orden stale:** 409 `CHECKOUT_CHANGED`; cero payment; sesión no PAID; cero audit `PAYMENT_CONFIRMED`.
25. **Cancel stale:** 409 `CHECKOUT_CHANGED`, incluso cuando el estado actual termina sin consumo; la comparación precede a `NOTHING_TO_PAY`.
26. **Transfer OUT:** token de origen invalidado y payment 409.
27. **Transfer IN:** token de destino invalidado y payment 409.
28. **Preparation states:** PENDING → PREPARING → READY → DELIVERED conserva token y monto; el pago con el token inicial termina 201.
29. **CARD:** business amount coincide con preview; `feeRate=0.05`; fee redondeado a dos decimales; total exacto.
30. **Mismo total/composición distinta:** se reutilizaron dos productos orderable del seed local con igual precio e IDs distintos; monto igual y token diferente, sin modificar fixtures de producción.
31. **Token manipulado:** string opaco sintácticamente válido pero incorrecto → 409 y cero payment.
32. **Missing token:** HTTP 400 antes del RPC; cero payment y sesión sin PAID.
33. **Rollback:** los escenarios stale comprueban cero filas payment, cero audit de confirmación y estado de sesión no PAID.
34. **Doble pago:** dos POST concurrentes con el mismo token vigente → exactamente un 201 y un 409 `PAYMENT_ALREADY_EXISTS`; una sola fila payment.
35. **Mutación económica concurrente vs payment:** cancelación y payment se lanzan juntos. La suite acepta y verifica sólo las dos serializaciones seguras: cancelación gana → payment 409 stale; payment gana → cancelación rechazada por sesión no activa. La base final nunca contiene un pago aplicado a una composición distinta.
36. **Preview atomicity:** 24 GET concurrentes con una nueva orden; cada observación fue exactamente el estado anterior o posterior, y la suma de `lineTotal` coincidió con `businessAmount`. No apareció combinación items/amount/token mezclada.

## 37–45. Regresión y auditoría final

37. **E2E final:** `1/1` PASS.
38. **Concurrencia final:** `9/9` PASS. Pago doble conserva `PAYMENT_ALREADY_EXISTS`; transferencia/pago conserva un único propietario económico y un único resultado válido.
39. **Realtime final:** `1/1` PASS, exactamente `33` broadcasts: SHIFT_CHANGED 2, TABLES_CHANGED 7, ORDERS_CHANGED 7, KITCHEN PREPARATION_CHANGED 4, DRINKS PREPARATION_CHANGED 4, CATALOG_CHANGED 4, FINANCE_CHANGED 5. No existe evento CHECKOUT_CHANGED.
40. **Typecheck final:** PASS.
41. **Unit tests finales:** `115/115` PASS.
42. **Compile final:** PASS.
43. **git diff --check:** PASS tras normalizar mecánicamente el newline final emitido por el generador de tipos.
44. **Supabase local reset:** PASS desde historia completa, incluyendo la nueva migración, tanto en validación directa como antes/después de cada suite.
45. **Security audit:** firmas y ACL verificadas en `pg_proc`; firma vieja ausente; `prosecdef=false`; `provolatile='v'`; `proconfig={search_path=""}`; sólo `service_role` con EXECUTE; digest en `extensions`; la migración no contiene `CREATE TABLE`, `ALTER TABLE`, `CREATE TRIGGER` ni cambios Realtime. `supabase db lint --local --level warning` devolvió `No schema errors found` y cero resultados.

## 46–48. Entrega y deuda

46. **Migración requerida remotamente:** sí, después de revisión humana.
47. **Cambios remotos realizados:** NO. No se ejecutó `db push`, no hubo commit, push ni merge.
48. **Deuda restante del Objetivo 13:** revisión humana del diff y aplicación manual de la migración remota; coordinación posterior con el futuro frontend para refetch y reintento ante 409. El hardening posterior no se inició, conforme a la stop condition.

## Criterio final

- PREVIEW ATÓMICO ✅
- TOKEN CANÓNICO / OBLIGATORIO ✅
- ORDER / CANCEL / TRANSFER OUT / TRANSFER IN STALE → 409 ✅
- PREP STATUS NO INVALIDA ✅
- CARD 5% ✅
- SAME TOTAL / DIFFERENT STATE ✅
- TOKEN MANIPULADO / MISSING ✅
- ROLLBACK / DOUBLE PAYMENT / MUTATION VS PAYMENT ✅
- PAYMENT FINANCIAL INTEGRITY ✅
- REALTIME CONTRACT UNCHANGED ✅
- OLD PAYMENT RPC REMOVED ✅
- SERVICE_ROLE ONLY ✅
- LOCAL RESET / FULL REGRESSION ✅
