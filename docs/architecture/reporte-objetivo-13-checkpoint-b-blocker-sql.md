# Objetivo 13 — Checkpoint B bloqueado por defecto SQL reproducible

Fecha: 2026-08-27  
Estado: **BLOQUEADO; requiere aprobación de una nueva migración correctiva**

## 1. Resultado ejecutivo

El baseline y las precondiciones locales pasaron. Se implementó el guard local
del harness y el escenario E2E principal hasta su primera escritura
transaccional real. La creación de la primera comanda falló dentro de
`public.logistics_create_order` con SQLSTATE `42883`.

No se creó ni modificó ninguna migración, RPC, función o trigger. Tampoco se
continuó con concurrencia, Realtime, `CHECKOUT_CHANGED` ni hardening.

## 2. Rama, HEAD y estado inicial

- Rama: `feat/logistics-backend-foundation`.
- HEAD local: `ff9a47511d459587c3337fed65ca2f2d975be211`.
- Upstream: `origin/feat/logistics-backend-foundation`.
- HEAD remoto consultado con `git ls-remote`: el mismo hash.
- Diferencia local/remoto inicial: `0 / 0`.
- Working tree inicial: limpio.
- `git diff --check` inicial: correcto.

## 3. Baseline inicial

Desde `apps/api`:

- `npm run typecheck`: correcto.
- `npm test`: **115/115 tests**, 19 suites, 0 fallos.
- `npm run compile`: correcto.

El sandbox inicialmente impidió que los tests HTTP abrieran
`127.0.0.1` (`listen EPERM`). Al ejecutar la misma suite con permiso de red
local, los 115 tests pasaron. No fue un fallo del repositorio.

## 4. Supabase local

- CLI: 2.115.0.
- API y PostgreSQL: endpoints `127.0.0.1`.
- No se usaron claves remotas ni se modificó Supabase remoto.
- `service_points`: 18 filas exactas.
  - `Mesa 1`–`Mesa 7`: `TABLE`, orden 1–7.
  - `B1`–`B4`: `BAR`, orden 8–11.
  - `LL1`–`LL7`: `TAKEAWAY`, orden 12–18.
- Cada ejecución E2E hizo un reset local protegido antes de comenzar y otro al
  finalizar, incluso al fallar.

## 5. Arquitectura del harness implementado

El runner:

1. obtiene configuración mediante `supabase status --output json`;
2. exige que API y DB sean URL loopback;
3. rechaza URL remota, configuración incompleta o ejecución ambigua;
4. inyecta solamente URL y claves reportadas por el stack local;
5. ejecuta `supabase db reset --local --yes` solo después del guard;
6. inicia Express en un puerto efímero de `127.0.0.1`;
7. crea Auth y perfil ADMIN desechables;
8. usa HTTP real y verifica estado con Supabase/PostgreSQL real;
9. restablece la base local en `finally`.

Los tests unitarios continúan separados: el glob existente no ejecuta
automáticamente la suite de infraestructura real.

## 6. Resultado E2E observado

Pasaron realmente:

1. reset limpio;
2. bootstrap de ADMIN local;
3. login real por username/password;
4. `GET /auth/me` real;
5. apertura de turno;
6. consulta del turno actual;
7. apertura de service session.

Falló el primer `POST /sessions/:id/orders`, antes de insertar una comanda
confirmada.

Error interno real:

```text
SQLSTATE 42883
function pg_catalog.coalesce(integer, integer) does not exist
```

Respuesta HTTP segura observada:

```json
{
  "error": {
    "code": "ORDER_CREATE_FAILED",
    "message": "No se pudo completar la operación logística."
  }
}
```

La API no filtró el error SQL al cliente; el detalle quedó solo en logging
interno.

## 7. Causa exacta

`COALESCE` y `NULLIF` son expresiones condicionales especiales de PostgreSQL,
no funciones ordinarias resolubles por schema. Las funciones PL/pgSQL actuales
usan formas inválidas como:

```sql
pg_catalog.coalesce(...)
pg_catalog.nullif(...)
```

PostgreSQL interpreta esas formas calificadas como llamadas a funciones
inexistentes. Las migraciones se aplican porque los cuerpos PL/pgSQL no
ejercitan todas estas sentencias al crear la función; el defecto aparece en la
primera ruta real que las ejecuta. Los tests unitarios usan repositories/RPC
mockeados y por eso no podían detectarlo.

## 8. Alcance comprobado del defecto

Se encontraron 27 usos inválidos distribuidos en 11 funciones:

| Función | Expresión afectada |
|---|---|
| `public.logistics_create_order` | `COALESCE`, `NULLIF` |
| `public.logistics_transfer_service_session` | `NULLIF` |
| `public.logistics_transfer_order_item` | `NULLIF`, `COALESCE` |
| `public.logistics_cancel_order_item` | `NULLIF` |
| `public.logistics_record_shift_expense` | `NULLIF` |
| `public.logistics_void_shift_expense` | `NULLIF` |
| `public.logistics_pay_service_session` | `COALESCE` |
| `public.logistics_release_empty_service_session` | `NULLIF`, `COALESCE` |
| `public.logistics_close_shift` | `NULLIF`, `COALESCE` |
| `public.logistics_reconcile_shift` | `NULLIF` |
| `private.logistics_realtime_orders_insert` | `COALESCE` |

Corregir solamente `logistics_create_order` no sería suficiente: la creación
de una comanda llegaría después al trigger Realtime diferido y fallaría por el
mismo patrón.

## 9. Diseño recomendado

Crear, previa aprobación, **una nueva migración forward-only**. No modificar
migraciones históricas.

La migración debe usar `CREATE OR REPLACE FUNCTION` para las 11 funciones,
copiando sus definiciones vigentes y haciendo únicamente estos reemplazos:

```text
pg_catalog.coalesce(...) -> coalesce(...)
pg_catalog.nullif(...)   -> nullif(...)
```

No debe cambiar:

- firmas;
- tipos de retorno;
- `SECURITY INVOKER`/`SECURITY DEFINER`;
- `search_path`;
- grants/revokes;
- triggers;
- reglas financieras;
- códigos de dominio;
- orden de locks.

Nombre conceptual sugerido:

```text
fix_logistics_conditional_expressions
```

## 10. Firmas RPC propuestas

No se propone una RPC nueva ni un cambio de firma. Deben conservarse:

```text
logistics_create_order(uuid, uuid, user_role, text, jsonb) -> jsonb
logistics_transfer_service_session(uuid, uuid, uuid, user_role, text) -> jsonb
logistics_transfer_order_item(uuid, uuid, integer, uuid, user_role, text) -> jsonb
logistics_cancel_order_item(uuid, text, uuid, user_role) -> jsonb
logistics_record_shift_expense(uuid, user_role, expense_category, text, text, numeric) -> jsonb
logistics_void_shift_expense(uuid, text, uuid, user_role) -> jsonb
logistics_pay_service_session(uuid, payment_method, uuid, user_role) -> jsonb
logistics_release_empty_service_session(uuid, text, uuid, user_role) -> jsonb
logistics_close_shift(uuid, text, uuid, user_role) -> jsonb
logistics_reconcile_shift(uuid, numeric, numeric, numeric, text, uuid, user_role) -> jsonb
private.logistics_realtime_orders_insert() -> trigger
```

## 11. Tablas afectadas funcionalmente

No se propone alterar tablas. Las funciones corregidas operan o consultan:

- `profiles`;
- `categories`;
- `products`;
- `service_points`;
- `shifts`;
- `service_sessions`;
- `orders`;
- `order_items`;
- `order_item_additions`;
- `service_session_transfers`;
- `order_item_transfers`;
- `payments`;
- `shift_expenses`;
- `shift_closures`;
- `cash_reconciliations`;
- `audit_logs`;
- `realtime.messages`, solo mediante `realtime.send` existente.

## 12. Locking y concurrencia esperados

La corrección propuesta no toca locking. Deben preservarse:

- lock de la service session para secuencia de comandas y pago;
- locks ordenados de sesiones/puntos en transferencias;
- lock del turno frente a apertura/cierre;
- lock de cierre frente a reconciliación duplicada;
- índices únicos como última barrera.

Por tanto, el comportamiento concurrente pretendido no cambia. Aún no fue
validado porque ninguna carrera que dependa de estas RPC debe ejecutarse sobre
funciones conocidas como defectuosas.

## 13. Errores esperados después de la corrección

- Debe desaparecer SQLSTATE `42883` para estos casos.
- Deben conservarse los códigos de dominio existentes, por ejemplo
  `SERVICE_SESSION_NOT_OPEN`, `PAYMENT_ALREADY_EXISTS`,
  `SERVICE_POINT_OCCUPIED`, `SHIFT_ALREADY_CLOSED` y
  `CASH_RECONCILIATION_ALREADY_EXISTS`.
- Errores desconocidos deben continuar saliendo al cliente como 500 genérico.

## 14. Alternativas descartadas

1. **Editar migraciones históricas:** rompe trazabilidad y no corrige bases ya
   migradas.
2. **Crear wrappers dentro de `pg_catalog`:** inseguro, invasivo y conceptualmente
   incorrecto.
3. **Sustituir RPC por escrituras Node directas:** perdería atomicidad, locking y
   autoridad financiera de PostgreSQL.
4. **Corregir solo la primera ocurrencia:** dejaría diez funciones defectuosas y
   el trigger Realtime seguiría revirtiendo comandas.
5. **Reescribir funciones dinámicamente desde `pg_get_functiondef`:** migración
   opaca, frágil y difícil de auditar.

## 15. Riesgos de la migración propuesta

- Copiar cuerpos grandes puede introducir drift accidental; el diff debe ser
  estrictamente mecánico.
- Una ocurrencia omitida mantendría rutas rotas.
- El trigger Realtime debe conservar exactamente sus permisos y semántica
  diferida.
- Es obligatorio ejecutar fresh reset y toda la suite real después del cambio.

Mitigación: comprobar que ya no exista ningún
`pg_catalog.coalesce(` o `pg_catalog.nullif(` en las definiciones efectivas,
ejecutar E2E completo, ocho carreras y Realtime antes de avanzar a
`CHECKOUT_CHANGED`.

## 16. Archivos del checkpoint

Modificado:

- `apps/api/package.json`.

Creados:

- `apps/api/src/tests/integration/run-local.ts`.
- `apps/api/src/tests/integration/local-harness.ts`.
- `apps/api/src/tests/integration/e2e.test.ts`.
- `docs/architecture/reporte-objetivo-13-checkpoint-b-blocker-sql.md`.

No se modificaron seed, migraciones, tipos de base, frontend ni Supabase
remoto.

## 17. Trabajo no ejecutado por el blocker

- resto del escenario E2E;
- concurrencia A–H;
- autorización/eventos/rollback/reconexión Realtime;
- `CHECKOUT_CHANGED`;
- rate limiting y protección brute force;
- headers, CORS, body limits y timeouts;
- hardening de errores/logging/env;
- readiness, audit de dependencias y Vercel.

Se requiere aprobación explícita para crear la migración correctiva antes de
reanudar el Objetivo 13.
