# Reporte de inspección del backend — Objetivo 13

La realidad del repositorio coincide ampliamente con el contexto maestro: objetivos 1–12 están implementados, `apps/logistics` sigue vacío y el Objetivo 13 continúa prácticamente completo. Se encontraron dos inconsistencias relevantes: el seed de puntos de servicio y documentación técnica desactualizada.

Durante la inspección no se modificó el repositorio ni ninguna base de datos.

## 1. Rama / HEAD / worktree

- Rama: `feat/logistics-backend-foundation`
- HEAD: `f082706463a289db44b75c0465396eec6028049a`
- Commit: `feat: add private logistics realtime broadcast`
- Worktree: limpio.
- `git diff` y `git diff --check`: limpios.
- Origin remoto consultado en modo lectura: apunta al mismo SHA.
- Divergencia real local/remoto: `0/0`.
- `main` permanece en `ef060eb`; no se hizo merge.

## 2. Commits recientes relevantes

- `f082706`: Private Realtime Broadcast + contrato compartido.
- `fb6aedd`: API de cierre, cuadre, release e historial.
- `dda8262`: RPC transaccionales de cierre y conciliación.
- `fd752a0`: API de gastos, checkout y pagos.
- `fd01368`: RPC de checkout/pagos.
- `58e8e9a`: comandas, preparación y transferencias.
- `d4cefcf`: gastos operativos.
- `f4373ff`: operaciones logísticas transaccionales.
- `4429c1c`: usuarios, turnos y sesiones.
- `b66b49d`: autenticación y autorización centralizada.

## 3. Migraciones actuales

Hay 17 migraciones SQL, desde:

- `20260819224000_initial_schema.sql`
- Las seis migraciones de catálogo/configuración del 21 de agosto.
- Identidad y puntos de servicio.
- Comandas y preparación.
- Transferencias y auditoría.
- Cierre y conciliación.
- Hardening de base de datos.
- Operaciones transaccionales.
- Gastos.
- Checkout/pagos.
- Cierre/reconciliación transaccional final.
- `20260827062738_logistics_v1_realtime_broadcast.sql`.

La última es `supabase/migrations/20260827062738_logistics_v1_realtime_broadcast.sql`.

## 4. Arquitectura Node real

La API logística sigue efectivamente:

```text
Route
→ Auth
→ Capability
→ Zod
→ Controller
→ Service
→ Repository/Gateway
→ Supabase / RPC
```

Los controllers son delgados. Los servicios concentran reglas y transformación de respuestas. Los repositories contienen acceso a Supabase y mapean errores.

Excepciones legítimas:

- `/api/categories` y `/api/products` son endpoints públicos heredados con una estructura más simple.
- Apertura de turnos, apertura/transición básica de sesiones y administración de perfiles todavía usan escrituras directas mediante `service_role`.
- Las operaciones financieras y logísticas críticas sí están delegadas a RPC transaccionales.

## 5. Módulos actuales

- `auth`
- `users`
- `shifts`
- `service-points` / `service-sessions`
- `logistics-catalog`
- `orders`
- `preparation`
- `transfers`
- `expenses`
- `checkout`
- `history`
- Infraestructura de autorización, configuración, logging, errores y validación.
- Catálogo público heredado.

La composición está en `apps/api/src/app.ts`.

## 6. Endpoints actuales

Hay 48 rutas:

```text
GET    /health
GET    /api/categories
GET    /api/products

POST   /api/logistics/auth/login
GET    /api/logistics/auth/me

GET    /api/logistics/users
POST   /api/logistics/users
GET    /api/logistics/users/:id
PATCH  /api/logistics/users/:id
POST   /api/logistics/users/:id/activate
POST   /api/logistics/users/:id/deactivate
POST   /api/logistics/users/:id/reset-password

GET    /api/logistics/shifts/current
POST   /api/logistics/shifts/open
GET    /api/logistics/shifts/:id
POST   /api/logistics/shifts/:id/close
GET    /api/logistics/shifts/:id/closure
POST   /api/logistics/shifts/:id/reconciliation
GET    /api/logistics/shifts/:id/reconciliation

GET    /api/logistics/service-points
GET    /api/logistics/service-points/status
POST   /api/logistics/service-points/:id/open

GET    /api/logistics/sessions/:id
POST   /api/logistics/sessions/:id/await-payment
POST   /api/logistics/sessions/:id/reopen
POST   /api/logistics/sessions/:id/release
GET    /api/logistics/sessions/:id/orders
POST   /api/logistics/sessions/:id/orders
GET    /api/logistics/sessions/:id/checkout
POST   /api/logistics/sessions/:id/payments
POST   /api/logistics/sessions/:id/transfer

GET    /api/logistics/orders/:id
POST   /api/logistics/order-items/:id/start
POST   /api/logistics/order-items/:id/ready
POST   /api/logistics/order-items/:id/deliver
POST   /api/logistics/order-items/:id/cancel
POST   /api/logistics/order-items/:id/transfer

GET    /api/logistics/preparation/kitchen
GET    /api/logistics/preparation/drinks

GET    /api/logistics/catalog/categories
GET    /api/logistics/catalog/products
PATCH  /api/logistics/catalog/products/:id/availability

GET    /api/logistics/expenses/current
GET    /api/logistics/expenses/:id
POST   /api/logistics/expenses
POST   /api/logistics/expenses/:id/void

GET    /api/logistics/history/shifts
GET    /api/logistics/history/shifts/:id
```

## 7. Capabilities actuales

Existen las 19 capacidades descritas en el contexto. `ADMIN` y `MANAGER` reciben todas. `CASHIER` posee correctamente `tables.release`.

No se encontró autorización dispersa del tipo `role === ...`. La estación de un ítem se convierte dinámicamente en `orders.kitchen.manage` u `orders.drinks.manage`.

Fuentes:

- `apps/api/src/authorization/capabilities.ts`
- `apps/api/src/authorization/roles.ts`

## 8. RPC actuales

La API utiliza 12 RPC de negocio:

- `logistics_create_order`
- `logistics_transition_order_item`
- `logistics_cancel_order_item`
- `logistics_transfer_service_session`
- `logistics_transfer_order_item`
- `logistics_set_product_availability`
- `logistics_record_shift_expense`
- `logistics_void_shift_expense`
- `logistics_pay_service_session`
- `logistics_release_empty_service_session`
- `logistics_close_shift`
- `logistics_reconcile_shift`

Existe además `logistics_assert_active_session_shift_open`, utilizado internamente como función de trigger.

## 9. Estado de Realtime

El estado local coincide con el contexto:

- Schema privado `private`.
- Helper activo mediante `auth.uid()` y `profiles.is_active`.
- Policy SELECT sobre `realtime.messages`.
- Seis topics privados.
- Payloads de invalidación mínimos.
- Triggers sobre sesiones, comandas, ítems, transferencias, productos, pagos, turnos, gastos y conciliaciones.
- Trigger de creación de comanda `DEFERRABLE INITIALLY DEFERRED`.
- `realtime.send(..., true)` en todos los casos.

No existe todavía una prueba automatizada real de conexión Realtime. Tampoco puede verificarse desde Git que “Allow public access” esté desactivado en producción.

## 10. Contrato `logistics-realtime`

`packages/shared/logistics-realtime.ts` define:

- Versión `1`.
- Seis topics exactos.
- `TABLES_CHANGED`
- `ORDERS_CHANGED`
- `PREPARATION_CHANGED`
- `CATALOG_CHANGED`
- `SHIFT_CHANGED`
- `FINANCE_CHANGED`

No contiene `CHECKOUT_CHANGED`.

## 11. Packages y dependencias

API:

- Node `>=22`
- Express `^5.2.1`
- Zod `^4.4.3`
- Supabase JS `^2.112.3`
- CORS `^2.8.6`
- dotenv `^17.4.2`
- TypeScript `5.9.3`
- tsx `^4.23.12`

Root:

- Supabase CLI `^2.115.0`

Los lockfiles están versionados. No están instalados `helmet`, un rate limiter ni un logger estructurado con redacción.

## 12. Scripts npm

En `apps/api/package.json`:

```text
dev       tsx watch src/index.ts
compile   tsc
start     node dist/index.js
typecheck tsc --noEmit
test      node --test --import tsx src/tests/*.test.ts
```

No hay scripts de lint, E2E, Realtime, concurrency, audit o CI.

## 13–15. Baselines

- Typecheck: correcto.
- Tests: `115/115`, 19 suites, 0 fallos.
- Compile: correcto, emitiendo únicamente a `/tmp`.
- `git diff --check`: correcto.
- El worktree continuó limpio.

Los 115 tests actuales son principalmente unitarios y HTTP con dependencias simuladas; no constituyen E2E real contra PostgreSQL/Auth/Realtime local.

## 16. Seguridad existente

Ya existe:

- `x-powered-by` desactivado.
- JWT validado mediante `auth.getUser`.
- Perfil activo revisado por request.
- Capabilities centralizadas.
- Zod en rutas logísticas.
- Respuesta indistinguible para usuario inexistente/password incorrecto.
- Errores 500 sanitizados para el cliente.
- Mapeo central de errores RPC.
- RLS y revocación de acceso directo a tablas operativas.
- `service_role` únicamente en la API.
- Clientes Supabase sin persistencia ni auto-refresh de sesión.
- Validación inicial de variables de entorno.

Falta:

- Rate limiting.
- Defensa de brute force en login.
- Helmet/security headers.
- Timeouts y cancelación de operaciones externas.
- Request ID/trazabilidad.
- Redacción formal de logs.
- Hardening específico para proxy/serverless.
- Tests automatizados de estas protecciones.

## 17. CORS

Existe allowlist configurable mediante `CORS_ALLOWED_ORIGINS`, pero:

- El valor predeterminado es `*`, incluso en producción.
- No se exige una allowlist al usar `NODE_ENV=production`.
- `methods` solo permite `GET`, `POST`, `OPTIONS`.
- La API tiene endpoints `PATCH`, por lo que los PATCH desde navegador fallarían en preflight.

Este es un defecto real a resolver.

## 18. Body limits

Existe `express.json({ limit: "100kb" })`.

Falta:

- Respuesta explícita `413 PAYLOAD_TOO_LARGE`; actualmente un exceso probablemente termina como 500 genérico.
- Límites configurables por entorno/ruta.
- Timeouts para cuerpos lentos.
- Pruebas de payload excesivo y content types.

## 19. Logging

Actualmente registra:

- Evento.
- Método.
- Path.
- Nombre/mensaje del error.
- Cause externo con código, status, message y hint.

No registra body, headers ni token, lo cual es positivo. Sin embargo, no existe redacción explícita y los mensajes/hints crudos de Supabase pueden acabar en logs internos. Tampoco hay request ID, nivel, ambiente, duración ni logger estructurado de producción.

## 20. Health endpoint

`GET /health` devuelve siempre:

```json
{
  "status": "ok",
  "service": "kuchis-api",
  "timestamp": "..."
}
```

Es liveness, no readiness: no comprueba configuración operacional, Supabase/Auth ni conectividad.

## 21. Vercel/deploy

Existe soporte mínimo en `apps/api/src/index.ts`:

- Exporta directamente la instancia Express.
- No ejecuta `listen()` cuando existe `VERCEL`.

No existe:

- `vercel.json`.
- Script `vercel-build`.
- Workflow de deploy/CI.
- Matriz documentada de variables.
- Configuración de función, región o timeout.
- Runbook de producción.
- Validación automática de settings Realtime.

## 22. Deudas del Objetivo 13 que continúan

Continúan todas las deudas principales:

- E2E local real.
- Concurrencia real.
- Realtime privado real.
- `CHECKOUT_CHANGED` y optimistic concurrency.
- Rate limiting y login protection.
- CORS de producción.
- Headers.
- Body/error hardening.
- Timeouts.
- Logging/redaction.
- Readiness.
- Dependency/security review.
- Vercel/producción.
- Tests de hardening.
- Documentación y verificación final.

La validación de entorno ya existe parcialmente, pero necesita reglas específicas de producción.

## 23. Contradicciones encontradas

La principal contradicción funcional está en `supabase/seed.sql`:

- La migración intenta renombrar filas existentes `Barra 1–4` a `B1–B4`.
- En un reset limpio esas barras todavía no existen.
- El seed posterior inserta nuevamente `Barra 1–4`.
- Resultado esperado en un entorno limpio: 18 puntos, pero con `Barra 1–4`, no `B1–B4`.

También están desactualizados `README.md` y `docs/database/erd-v2-final.md`:

- Hablan de login por correo.
- Conservan roles `HALL` y `GRILL`.
- Describen 11 puntos.
- Utilizan “Parrilla” en lugar de la terminología actual.

La implementación y los tipos generados sí contienen los cinco roles definitivos y `TAKEAWAY`.

## 24. Riesgos antes de implementar

- El entorno E2E puede partir con nombres de puntos distintos al remoto.
- El cambio de checkout probablemente requerirá RPC/migración; debe diseñarse y aprobarse antes de escribir SQL.
- Los tests actuales no demuestran atomicidad ni locks reales.
- Realtime solo está validado histórica/manual, no de forma repetible.
- CORS bloquea PATCH y permite `*` por defecto.
- Rate limiting depende de resolver correctamente IP/proxy en Vercel.
- Logs internos todavía pueden conservar detalles crudos de Supabase.
- No hay readiness ni estrategia clara para fallos lentos de Supabase.
- La configuración local permite signup y contraseña mínima de 6; los settings productivos necesitan auditoría separada.
- No hay pipeline CI ni configuración reproducible de despliegue.

## 25. Orden recomendado para el Objetivo 13

1. Corregir primero la reproducibilidad del entorno local/seed y actualizar documentación.
2. Crear el harness E2E desechable con usuarios y datos aislados.
3. Ejecutar el flujo integral real de turno → sesión → comanda → preparación → checkout → pago → cierre → cuadre → historial.
4. Diseñar `CHECKOUT_CHANGED` y el token/versionado optimista; detenerse para aprobar la migración/RPC.
5. Implementar y probar concurrencia real, especialmente doble apertura, transferencias, doble pago y doble cierre.
6. Probar Realtime privado, autorización, rollback, fan-out diferido y reconexión/refetch.
7. Incorporar CORS estricto, proxy confiable, rate limiting y protección especial del login.
8. Añadir headers, body handling, timeouts, error hardening y logging con redacción.
9. Separar liveness/readiness y probar fallos de Supabase.
10. Ejecutar auditoría de dependencias y preparar Vercel/producción.
11. Automatizar los tests de hardening y documentar operación.
12. Realizar reset final, E2E, concurrencia, Realtime, typecheck, 115 tests, compile, auditorías local/remota y checklist del Dashboard antes de commit/push manual.
