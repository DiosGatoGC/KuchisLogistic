# Objetivo 13 — Reporte de concurrencia real A–H

Fecha: 2026-08-31  
Estado: **COMPLETADO — A–H verificadas contra Supabase local**

## 1. Resultado ejecutivo

Se implementó y ejecutó una suite dedicada de concurrencia con Express real,
Supabase Auth local real, HTTP real y PostgreSQL local real. Cada carrera fue
lanzada con dos requests autenticadas independientes mediante `Promise.all` y
su estado final fue consultado directamente en base de datos.

Resultado formal:

```text
A ✅  B ✅  C ✅  D ✅  E ✅  F ✅  G ✅  H ✅
tests 9 | pass 9 | fail 0
```

No se encontró ningún defecto que requiera migration, RPC, constraint, trigger
o cambio de locking SQL. No se modificó Supabase remoto, no se ejecutó
`db push` y no se avanzó a Realtime real.

## 2. Rama, HEAD y estado inicial

- Rama: `feat/logistics-backend-foundation`.
- Upstream: `origin/feat/logistics-backend-foundation`.
- HEAD: `6cb2df8ba4c5609538ffc6b6543978d78cd67b4d`.
- Commit HEAD: `test: add logistics e2e and fix transactional blockers`.
- `git diff --check` inicial: correcto.
- Estado inicial recibido al retomar este checkpoint:

```text
 M apps/api/package.json
 M apps/api/src/modules/service-points/service-points.repository.ts
 M apps/api/src/tests/integration/run-local.ts
?? apps/api/src/tests/integration/concurrency.test.ts
```

Estos cambios correspondían a la primera implementación de concurrencia del
checkpoint inmediatamente anterior y se conservaron. No se hizo commit, push,
merge ni rebase.

## 3. Precheck de Supabase local

- Supabase CLI instalada: `2.115.0`.
- Node: `v24.18.0`.
- API local: loopback HTTP en `127.0.0.1:54321`.
- PostgreSQL local: loopback en `127.0.0.1:54322`.
- El runner obtiene URL y claves desde `supabase status --output json`.
- El harness vuelve a rechazar cualquier API o DB que no sea loopback.
- El reset usa explícitamente `supabase db reset --local --yes`.
- Cada suite hace reset antes de empezar y otro reset dentro de `finally`.
- Servicios opcionales detenidos reportados por CLI: imgproxy, Edge Runtime y
  pooler. No son dependencias de estas pruebas.
- La CLI informó que existe la versión `2.116.0`; no se actualizó ninguna
  dependencia durante el checkpoint.

El changelog vigente fue revisado antes de continuar. Los cambios recientes de
gateway self-hosted y extensiones no alteran las operaciones cubiertas. El
proyecto ya cumple la exigencia vigente de Node 22 o superior.

## 4. Fixtures canónicos

El E2E lifecycle ejecutado antes y después de concurrencia confirmó exactamente
18 `service_points`, con nombre, tipo y orden esperados:

- `Mesa 1`–`Mesa 7`: `TABLE`, orden 1–7.
- `B1`–`B4`: `BAR`, orden 8–11.
- `LL1`–`LL7`: `TAKEAWAY`, orden 12–18.

## 5. Baseline previo a concurrencia

Ejecutado desde `apps/api` después de confirmar el entorno local:

| Verificación | Resultado |
|---|---:|
| `npm run typecheck` | PASS |
| `npm test` | 115/115 PASS, 19 suites, 0 fallos |
| `npm run compile` | PASS |
| `npx tsx src/tests/integration/run-local.ts` | 1/1 PASS, 0 fallos |
| Reset inicial/final del E2E | PASS |

No hubo regresión previa a la ejecución formal A–H.

## 6. Archivos creados y modificados

### Creados

- `apps/api/src/tests/integration/concurrency.test.ts`: suite A–H y diagnósticos
  de respuestas/estado final.
- `docs/architecture/reporte-objetivo-13-concurrencia.md`: este reporte.

### Modificados

- `apps/api/src/tests/integration/run-local.ts`: registra la suite
  `concurrency` en el runner protegido.
- `apps/api/package.json`: añade `test:concurrency:local`.
- `apps/api/src/modules/service-points/service-points.repository.ts`: conserva
  el código de dominio `P0001` que puede emitir el trigger al perder la carrera
  F, devolviendo `409 SHIFT_NOT_OPEN` en lugar de un 500 genérico.

No se modificó ningún archivo en `supabase/migrations`.

## 7. Diseño de la suite

La suite crea dos identidades ADMIN desechables en Supabase Auth local, obtiene
dos access tokens mediante el endpoint real de login y levanta la aplicación
Express en un puerto efímero de `127.0.0.1`.

Para cada escenario:

1. prepara el estado mediante endpoints reales;
2. crea las dos promesas HTTP antes de esperar resultados;
3. las libera en el mismo `Promise.all`;
4. inspecciona ambas respuestas y sus códigos de dominio;
5. consulta las tablas reales con un cliente administrativo local;
6. comprueba conteos, IDs, estados, montos y auditoría;
7. deja el agregado en un estado válido para el siguiente escenario;
8. permite que el runner restablezca la base completa al finalizar.

No hay mocks, sleeps de producción, escrituras SQL desde el test ni llamadas a
Supabase remoto. B se ejecuta antes que A porque crea el único turno que A–F
usan como precondición; esto no cambia la independencia de las invariantes.

## 8. Resultado A — doble apertura del mismo service point

Requests observadas:

```text
request 1 → HTTP 201
request 2 → HTTP 409 SERVICE_POINT_OCCUPIED
```

Estado final PostgreSQL:

```text
service_point_id: d6435f08-0a0f-4570-8634-14c8ee37f511
active sessions: 1
service_session_id: 2ea412bf-988d-43d3-8c68-fcf51d21d7d6
status: OPEN
```

La barrera definitiva fue el índice único parcial
`uq_service_sessions_one_active_per_point`, que cubre `OPEN` y
`AWAITING_PAYMENT`. La comprobación previa de Node mejora la respuesta común;
el índice resuelve la carrera real y el perdedor mantiene un error estable.

## 9. Resultado B — doble apertura de turno

Requests observadas:

```text
request 1 → HTTP 201
request 2 → HTTP 409 SHIFT_ALREADY_OPEN
```

Estado final PostgreSQL:

```text
OPEN shifts: 1
shift_id: a770c315-e084-4067-89eb-905657d049dc
status: OPEN
```

La barrera definitiva fue el índice único parcial `uq_shifts_single_open`. No
se aceptaron dos turnos abiertos aunque ambas requests hicieron la consulta
previa concurrentemente.

## 10. Resultado C — dos comandas simultáneas

Requests observadas:

```text
request 1 → HTTP 201
request 2 → HTTP 201
```

Estado final PostgreSQL:

```text
orders nuevas: 2
order IDs:
  17ba39bc-efac-4e35-a282-aded99ca13df
  c3eca48c-c8af-4269-b95a-c33b280fbad5
sequence_number: [1, 2]
order_items: 2
```

`logistics_create_order` bloquea la `service_session` con `FOR UPDATE OF
session` antes de calcular `MAX(sequence_number) + 1`. La segunda barrera es la
constraint `orders_session_sequence_unique`. Ambas comandas persistieron y los
IDs de las respuestas coincidieron exactamente con los IDs almacenados.

## 11. Resultado D — doble pago

Requests observadas:

```text
request 1 → HTTP 409 PAYMENT_ALREADY_EXISTS
request 2 → HTTP 201
```

Estado final PostgreSQL:

```text
payments: 1
payment_id: 532c0baf-5067-4fd1-87c3-2c995114c5ad
method: CASH
business_amount: 12.50
fee_rate: 0
fee_amount: 0
customer_total: 12.50
session status: PAID
PAYMENT_CONFIRMED audits: 1
```

`logistics_pay_service_session` toma `FOR UPDATE OF session`, recalcula el
consumo dentro de la transacción e inserta pago, cierre de sesión y auditoría
atómicamente. `payments_service_session_unique` actúa además como última
barrera contra doble cobro.

## 12. Resultado E — transferencia de item vs pago

Serialización observada: **PAYMENT_WON**.

```text
transferencia → HTTP 409 SERVICE_SESSION_NOT_ACTIVE
pago          → HTTP 201
```

Estado final PostgreSQL antes de la limpieza del escenario:

```text
item_id: fda89e3a-4753-42fe-88a2-11277269cc0f
item status: DELIVERED
economic owner: 4415c2f2-240e-4ff3-a37a-f499f1c29df4 (sesión origen)
origin payments: 1
destination payments: 0
order_item_transfers: 0
```

El pago obtuvo primero el lock de la sesión origen, congeló el consumo y dejó
la sesión `PAID`. La transferencia, que bloquea primero el item y su order y
luego ambas sesiones en orden UUID, continuó después y rechazó el origen ya no
activo. Su transacción se revirtió completa. No hubo consumo perdido, item
huérfano, transferencia parcial persistida ni pago que correspondiera a B.

La suite acepta también la serialización inversa válida: si la transferencia
gana, el item pasa a B y el pago de A termina como `NOTHING_TO_PAY`; después
comprueba propietario, cantidades, transfer y ausencia de pagos incoherentes.

## 13. Resultado F — apertura de session vs cierre de shift

Serialización observada: **SHIFT CLOSE WON**.

```text
apertura → HTTP 409 SHIFT_NOT_OPEN
cierre   → HTTP 201
```

Estado final PostgreSQL:

```text
shift_id: a770c315-e084-4067-89eb-905657d049dc
shift status: CLOSED
active sessions for shift: 0
shift_closures: 1
```

`logistics_close_shift` bloquea el turno `FOR UPDATE`. El trigger
`logistics_assert_active_session_shift_open` toma `FOR SHARE` sobre ese mismo
turno antes de insertar o reactivar una sesión. Como el cierre ganó, el trigger
leyó `CLOSED` y abortó la apertura. El estado imposible `CLOSED + active
session` no apareció.

La primera ejecución exploratoria del checkpoint confirmó que este error del
trigger llegaba al repositorio como `P0001`; el mapeo Node fue normalizado a
`409 SHIFT_NOT_OPEN`. No fue necesario cambiar el trigger ni el locking SQL.

## 14. Resultado G — dos cierres simultáneos

Requests observadas:

```text
request 1 → HTTP 201
request 2 → HTTP 409 SHIFT_ALREADY_CLOSED
```

Estado final PostgreSQL:

```text
shift_id: baebe7e1-064a-4b55-b2a7-f809e7257080
shift status: CLOSED
shift_closures: 1
closure_id: 257efbff-1d42-4408-ab33-15785fa7dd0e
SHIFT_CLOSED audits: 1
```

El `FOR UPDATE` de `logistics_close_shift` serializó los intentos. El segundo
observó el turno cerrado después de esperar. La unicidad de
`shift_closures.shift_id` conserva además un único snapshot histórico.

## 15. Resultado H — dos reconciliaciones simultáneas

Requests observadas:

```text
request 1 → HTTP 201
request 2 → HTTP 409 CASH_RECONCILIATION_ALREADY_EXISTS
```

Estado final PostgreSQL:

```text
cash_reconciliations: 1
reconciliation_id: e292772e-310a-4449-88d0-a25f8f820a2d
expected_cash: 75.00
cash_difference: 0
yape_difference: 0
card_difference: 0
CASH_RECONCILED audits: 1
shift_closures unchanged: true
```

`logistics_reconcile_shift` bloqueó `public.shifts FOR UPDATE` y leyó
`public.shift_closures` sin `FOR UPDATE`. Una comparación completa de la fila
de closure antes y después confirmó su inmutabilidad. La unicidad de
`cash_reconciliations.shift_id` funciona como última barrera.

## 16. Códigos de dominio observados

| Escenario | Ganador | Perdedor |
|---|---|---|
| A | `201` | `409 SERVICE_POINT_OCCUPIED` |
| B | `201` | `409 SHIFT_ALREADY_OPEN` |
| C | `201` | `201` |
| D | `201` | `409 PAYMENT_ALREADY_EXISTS` |
| E | pago `201` | transferencia `409 SERVICE_SESSION_NOT_ACTIVE` |
| F | cierre `201` | apertura `409 SHIFT_NOT_OPEN` |
| G | `201` | `409 SHIFT_ALREADY_CLOSED` |
| H | `201` | `409 CASH_RECONCILIATION_ALREADY_EXISTS` |

Todos los errores fueron respuestas de dominio sanitizadas. No se expusieron
mensajes SQL ni detalles internos a los clientes.

## 17. Locks y constraints comprobados

| Invariante | Mecanismo principal | Última barrera |
|---|---|---|
| Un turno abierto | Inserciones concurrentes | `uq_shifts_single_open` |
| Una sesión activa por punto | Inserciones concurrentes | `uq_service_sessions_one_active_per_point` |
| Secuencia de comandas | session `FOR UPDATE` | `orders_session_sequence_unique` |
| Un pago por sesión | session `FOR UPDATE` | `payments_service_session_unique` |
| Transfer vs payment | item/order locks + sessions ordenadas / session lock | validación de estado y transacción RPC |
| Session vs close | shift `FOR SHARE` en trigger / `FOR UPDATE` en cierre | validación `SHIFT_NOT_OPEN` |
| Un cierre | shift `FOR UPDATE` | unique de `shift_closures.shift_id` |
| Un cuadre | shift `FOR UPDATE` | unique de `cash_reconciliations.shift_id` |

## 18. Blockers y hallazgos

- Blockers SQL: ninguno.
- Inconsistencias finales de DB: ninguna.
- Migración necesaria: no.
- Cambio de RPC/constraint/trigger/locking: no.
- Hallazgo HTTP no estructural: el trigger de F emitía correctamente
  `SHIFT_NOT_OPEN`, pero la apertura directa lo envolvía inicialmente como 500.
  Se conserva el código de dominio como 409 mediante el mapper existente.

## 19. Regresión final

Ejecutada después de la suite formal A–H:

| Verificación | Resultado |
|---|---:|
| `npm run typecheck` | PASS |
| `npm test` | 115/115 PASS, 19 suites, 0 fallos |
| `npm run compile` | PASS |
| `npx tsx src/tests/integration/run-local.ts` | 1/1 PASS, 0 fallos |
| Reset inicial/final del E2E | PASS |
| `git diff --check` | PASS |

El E2E lifecycle pasó tanto antes como después de concurrencia. No se repitió
ninguna corrección SQL anterior ni se alteraron sus migraciones.

## 20. Deuda restante del Objetivo 13

Este checkpoint termina exclusivamente la concurrencia real A–H. Continúan,
en checkpoints posteriores y separados:

1. Realtime real con clientes autenticado, anónimo e inactivo.
2. Validación de topics, fan-out, rollback, reconnect y ausencia de duplicados.
3. Diseño y aprobación previa de `CHECKOUT_CHANGED`.
4. Hardening HTTP y seguridad de producción.
5. Readiness y estrategia de timeouts.
6. Auditoría de dependencias.
7. Revisión Vercel/producción y runbook de deploy.
8. Verificación final integral del Objetivo 13.

El trabajo se detiene aquí antes de Realtime real, sin commit, push, merge ni
`db push`.
