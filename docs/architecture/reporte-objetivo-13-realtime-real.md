# Objetivo 13 — checkpoint Realtime real local

Fecha de verificación: 2026-08-31

Resultado: **PASS**

Alcance: Supabase Auth real, Private Broadcast real, RLS real, operaciones HTTP/RPC reales y PostgreSQL local. No se usaron mocks para Realtime.

## Resumen ejecutivo

El contrato Realtime V1 existente quedó verificado contra Supabase local. Un perfil activo autenticado se suscribió a los seis topics privados; anonymous, un perfil autenticado posteriormente desactivado y un topic fuera de la allowlist fueron rechazados por Realtime con `CHANNEL_ERROR / Unauthorized`.

La suite recibió y validó 33 broadcasts reales. Las cardinalidades de creación de orden, pago y cierre fueron exactas; una orden que insertó estado intermedio y terminó en `PRODUCT_UNAVAILABLE` hizo rollback sin persistir órdenes/items y sin emitir broadcasts fantasma. La reconexión no reprodujo historia y el GET REST devolvió el estado actual, confirmando el contrato `reconnect → refetch REST`.

No se encontró defecto de policy, trigger, función PostgreSQL ni `realtime.send`. No se creó ni modificó SQL, migración o configuración remota.

## Evidencia solicitada

| # | Evidencia | Resultado |
|---:|---|---|
| 1 | Rama | `feat/logistics-backend-foundation` |
| 2 | HEAD | `d2ef1bb87a5df0eb09af2aff99dc29db1fa9c519` |
| 3 | Estado git inicial | Limpio; `git diff --check` sin errores. |
| 4 | Supabase local confirmado | CLI `2.115.0`; API `http://127.0.0.1:54321`; DB `127.0.0.1:54322`. El runner exige API y DB loopback y API HTTP. No se imprimen keys. |
| 5 | Baseline | Typecheck PASS, unitarias 115/115, compile PASS, E2E 1/1. Concurrencia ya cerrada 9/9 en este HEAD y no repetida por la orden explícita `NO repetir concurrencia`. |
| 6 | Archivo creado | `apps/api/src/tests/integration/realtime.test.ts`. |
| 7 | Archivos modificados | `apps/api/src/tests/integration/run-local.ts` y `apps/api/package.json`. Este reporte también se añadió. |
| 8 | Arquitectura de test | Runner local protegido obtiene `supabase status --output json`, valida loopback, resetea antes y en `finally`, y ejecuta Node Test + `tsx` con concurrencia 1. La suite usa listeners WebSocket, deadlines y ventanas cortas encapsuladas. |
| 9 | Clientes usados | Cliente activo, anonymous, inactivo, topic inválido y cliente de reconnect usan publishable key. Los autenticados hacen `signInWithPassword` real y mantienen sesión Auth en memoria. `service_role` solo crea fixtures y consulta DB. |
| 10 | Active authenticated | `SUBSCRIBED` en los seis topics: tables, kitchen, drinks, catalog, shift y finance. |
| 11 | Anonymous | `CHANNEL_ERROR`: `Unauthorized: You do not have permissions to read from this Channel topic: logistics:v1:tables`; recibió 0 eventos tras una apertura real de sesión. |
| 12 | Inactive | Login real realizado antes de cambiar `profiles.is_active=false`; luego `CHANNEL_ERROR / Unauthorized`; recibió 0 eventos. |
| 13 | Invalid topic | Usuario activo real en `logistics:v1:not-a-real-topic`: `CHANNEL_ERROR / Unauthorized`; recibió 0 eventos. |
| 14 | `TABLES_CHANGED` | 7 eventos totales esperados: aperturas, transición a cobro, pago y liberaciones. IDs de session/point exactos y payload mínimo. |
| 15 | `ORDERS_CHANGED` | 7 eventos: 1 por creación y 6 por las transiciones de dos items. Cada operación produjo exactamente 1 invalidación de órdenes. |
| 16 | Fan-out kitchen/drinks | La orden mixta produjo exactamente 3 eventos: 1 tables/`ORDERS_CHANGED`, 1 kitchen/`PREPARATION_CHANGED` y 1 drinks/`PREPARATION_CHANGED`. No produjo `TABLES_CHANGED` adicional. |
| 17 | Preparation kitchen | PENDING → PREPARING → READY → DELIVERED produjo exactamente 3 eventos kitchen y 3 `ORDERS_CHANGED`; `station=KITCHEN`, IDs correctos, sin evento drinks. |
| 18 | Preparation drinks | PENDING → PREPARING → READY → DELIVERED produjo exactamente 3 eventos drinks y 3 `ORDERS_CHANGED`; `station=DRINKS`, IDs correctos, sin evento kitchen. |
| 19 | Catalog | Disponibilidad false/true de dos productos produjo exactamente 4 `CATALOG_CHANGED`; solo `productId` más campos base contractuales. |
| 20 | Shift | Apertura y cierre produjeron exactamente 2 `SHIFT_CHANGED`, uno por operación. |
| 21 | Finance expense | Alta y void produjeron exactamente 2 `FINANCE_CHANGED`, `scope=EXPENSE`; sin amount, description, customCategory ni notes. |
| 22 | Finance payment | Pago real persistido produjo exactamente 1 `FINANCE_CHANGED`, `scope=PAYMENT`, junto con 1 `TABLES_CHANGED`; sin montos, fee ni method. |
| 23 | Finance closure | Cierre real produjo exactamente 1 `SHIFT_CHANGED` y 1 `FINANCE_CHANGED`, `scope=CLOSURE`. |
| 24 | Finance reconciliation | Reconciliation real persistida produjo exactamente 1 `FINANCE_CHANGED`, `scope=RECONCILIATION`; sin valores de caja, diferencias ni notes. |
| 25 | Rollback | Una RPC de orden insertó la orden y procesó primero un item válido, falló luego con producto no disponible y devolvió HTTP 409 `PRODUCT_UNAVAILABLE`. DB mantuvo 0 órdenes/0 items para la sesión y Realtime emitió 0 eventos durante la ventana de ausencia. |
| 26 | Duplicados | Todas las operaciones se comparan contra cardinalidad exacta, no `>=1`. Create order: 3 exactos; payment: 2 exactos; closure: 2 exactos. |
| 27 | Reconnect/refetch | Mismo cliente: subscribe, remove channel, cambio durante desconexión, resubscribe sin replay, GET `/service-points/status` con la sesión actual correcta. Contrato frontend: al reconectar, refetch REST. |
| 28 | Aislamiento de topics | Catalog no contaminó finance; expense no contaminó preparation; kitchen no contaminó drinks; drinks no contaminó kitchen. Solo se aceptó fan-out explícito del contrato. |
| 29 | Seguridad de payload | Se compararon keys exactas por tipo y se inspeccionaron recursivamente password, token, access/refresh token, authorization, auth_email, email, notes y campos financieros. Todos los eventos pasaron. |
| 30 | Timeouts/cleanup | Suscripción/evento: 8 s con resolución por callback/predicate; quiet window: 450 ms; ausencia: 700 ms. Todos los canales se remueven y los sockets se cierran en teardown. |
| 31 | Blockers encontrados | Ninguno de producción. Se adaptó el test a (a) UUID técnico de transporte que la versión local entrega en metadata/payload y (b) sesión Auth interna necesaria para rejoin; no requirieron cambios de backend/SQL. Una ejecución unitaria dentro del sandbox falló con `listen EPERM`; fuera del sandbox pasó 115/115. |
| 32 | ¿Migración necesaria? | **No**. Policy, allowlist, triggers, funciones y broadcasts existentes pasaron. |
| 33 | Typecheck | `npm run typecheck`: PASS. |
| 34 | Unit tests | `npm test`: 115/115 PASS, 19 suites. |
| 35 | Compile | `npm run compile`: PASS. |
| 36 | E2E regression | `npm run test:e2e:local`: 1/1 PASS; reset inicial y final completados. |
| 37 | Concurrency regression | No repetida: la instrucción de cabecera exige `NO repetir concurrencia`; resultado cerrado del HEAD: 9/9 PASS. El intento de ejecución fue rechazado precisamente por esa restricción. |
| 38 | Realtime suite | `npm run test:realtime:local`: 1/1 PASS; test 20.168 s, runner Node 30.251 s, reset inicial/final completados. |
| 39 | `git diff --check` | PASS al cierre. |
| 40 | Deuda restante Objetivo 13 | `CHECKOUT_CHANGED` y hardening permanecen fuera de este checkpoint y no se iniciaron. El frontend deberá consumir invalidaciones y refetchear REST; no se implementó replay ni frontend. |

## Cardinalidad observada

| Topic / event | Cantidad |
|---|---:|
| `logistics:v1:shift / SHIFT_CHANGED` | 2 |
| `logistics:v1:tables / TABLES_CHANGED` | 7 |
| `logistics:v1:tables / ORDERS_CHANGED` | 7 |
| `logistics:v1:kitchen / PREPARATION_CHANGED` | 4 |
| `logistics:v1:drinks / PREPARATION_CHANGED` | 4 |
| `logistics:v1:catalog / CATALOG_CHANGED` | 4 |
| `logistics:v1:finance / FINANCE_CHANGED` | 5 |
| **Total** | **33** |

## Notas técnicas

- La fuente autorizada continúa siendo REST/DB. Realtime transporta únicamente señales de invalidación.
- La suite importa topics, versión y unión de eventos desde `@kuchis/shared/logistics-realtime`; no replica el contrato canónico.
- El UUID generado por Supabase para cada mensaje es metadata de transporte y no parte del payload de dominio emitido por los triggers. El helper lo valida como UUID y luego compara exclusivamente el payload contractual. El protocolo oficial describe `meta.id` como identificador del broadcast: <https://supabase.com/docs/guides/realtime/protocol>.
- El trigger deferred de orders quedó probado indirectamente con rollback real: no hubo persistencia ni broadcast fantasma.
- No se modificó frontend, Supabase remoto, migrations, policies, triggers ni funciones PostgreSQL. No se hizo `db push`, commit, push o merge.

## Archivos del checkpoint

- `apps/api/src/tests/integration/realtime.test.ts`
- `apps/api/src/tests/integration/run-local.ts`
- `apps/api/package.json`
- `docs/architecture/reporte-objetivo-13-realtime-real.md`
