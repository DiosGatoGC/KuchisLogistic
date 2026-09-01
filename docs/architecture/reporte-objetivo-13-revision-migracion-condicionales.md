# Objetivo 13 — Revisión estática de migración de expresiones condicionales

Fecha: 2026-08-27  
Estado: **migración creada y revisada estáticamente; no ejecutada**

## 1. Migración

- Nombre: `fix_logistics_conditional_expressions`.
- Timestamp: `20260827183221`.
- Archivo:
  `supabase/migrations/20260827183221_fix_logistics_conditional_expressions.sql`.
- Creación: `npx supabase migration new fix_logistics_conditional_expressions`.
- Tipo: forward-only, explícita y auditable.
- Tamaño: 3,038 líneas; 81,093 bytes.

No se modificó ninguna migración histórica.

## 2. Funciones incluidas y conteos

| Función | Definición fuente más reciente | `COALESCE` | `NULLIF` | SECURITY |
|---|---|---:|---:|---|
| `public.logistics_create_order` | `20260826140401_logistics_transactional_operations.sql` | 1 | 2 | INVOKER |
| `public.logistics_transfer_service_session` | `20260826140401_logistics_transactional_operations.sql` | 0 | 1 | INVOKER |
| `public.logistics_transfer_order_item` | `20260826140401_logistics_transactional_operations.sql` | 1 | 1 | INVOKER |
| `public.logistics_cancel_order_item` | `20260826140401_logistics_transactional_operations.sql` | 0 | 1 | INVOKER |
| `public.logistics_record_shift_expense` | `20260826170523_logistics_v1_shift_expenses.sql` | 0 | 2 | INVOKER |
| `public.logistics_void_shift_expense` | `20260826170523_logistics_v1_shift_expenses.sql` | 0 | 1 | INVOKER |
| `public.logistics_pay_service_session` | `20260826182612_logistics_v1_checkout_payments.sql` | 2 | 0 | INVOKER |
| `public.logistics_release_empty_service_session` | `20260827050631_logistics_v1_shift_close_reconciliation.sql` | 2 | 1 | INVOKER |
| `public.logistics_close_shift` | `20260827050631_logistics_v1_shift_close_reconciliation.sql` | 9 | 1 | INVOKER |
| `public.logistics_reconcile_shift` | `20260827050631_logistics_v1_shift_close_reconciliation.sql` | 0 | 1 | INVOKER |
| `private.logistics_realtime_orders_insert` | `20260827062738_logistics_v1_realtime_broadcast.sql` | 1 | 0 | DEFINER |
| **Total** | **11 funciones** | **16** | **11** | **27 reemplazos** |

Confirmación: 16 `pg_catalog.coalesce(` y 11 `pg_catalog.nullif(` fueron
corregidos, total exacto **27**.

## 3. Método para obtener las definiciones vigentes

La generación y validación siguió estas barreras:

1. Se recorrieron las migraciones en orden por timestamp.
2. Para cada una de las 11 funciones se conservó el último bloque efectivo
   `CREATE [OR REPLACE] FUNCTION` encontrado.
3. Se consultó read-only `pg_proc` del PostgreSQL local actual.
4. El cuerpo histórico elegido se comparó byte por byte con `pg_proc.prosrc`
   mediante longitud y MD5.
5. Resultado: **11/11 cuerpos locales coinciden exactamente** con las fuentes
   seleccionadas.
6. Se contrastaron además firma efectiva, retorno, lenguaje, volatility,
   SECURITY, configuración, owner y ACL.
7. Sobre esos bloques se aplicaron exclusivamente los dos reemplazos
   autorizados.
8. El archivo escrito se volvió a comparar en modo solo lectura contra el SQL
   mecánicamente esperado y contra el catálogo local.

La migración final contiene SQL estático explícito. No usa
`pg_get_functiondef()`, SQL dinámico ni introspección durante su ejecución.

## 4. Diff semántico/mecánico

Resultado automático:

```text
functions=11
localBodyMatches=11
coalesceReplacements=16
nullifReplacements=11
totalReplacements=27
invalidQualifiedOccurrences=0
nonMechanicalBodyDifferences=0
```

Para cada función se construyó el resultado esperado desde su definición
vigente y se exigió igualdad byte por byte con el bloque nuevo después de:

```text
pg_catalog.coalesce( -> coalesce(
pg_catalog.nullif(   -> nullif(
```

No existe otra diferencia dentro de los cuerpos.

## 5. Firmas, retornos, lenguaje y volatility

- Las 11 firmas coinciden con las firmas aprobadas.
- Las 10 funciones públicas conservan retorno `jsonb`.
- La función privada conserva retorno `trigger`.
- Las 11 conservan lenguaje `plpgsql`.
- Las 11 conservan volatility efectiva `VOLATILE` (`provolatile = v`).
- No existe `DROP FUNCTION`.

## 6. SECURITY, owner y ACL

- Las 10 funciones públicas permanecen `SECURITY INVOKER`.
- `private.logistics_realtime_orders_insert()` permanece
  `SECURITY DEFINER`.
- Owner efectivo previo de las 11: `postgres`.
- ACL efectiva previa de las públicas:
  `postgres=EXECUTE`, `service_role=EXECUTE`.
- ACL efectiva previa de la privada: únicamente `postgres=EXECUTE`.

`CREATE OR REPLACE FUNCTION` conserva identidad, ownership y ACL existentes;
la migración no contiene `GRANT`, `REVOKE` ni cambio de owner.

## 7. `search_path`

Las 11 funciones conservan:

```sql
set search_path = ''
```

La consulta al catálogo confirmó `proconfig = ["search_path=\"\""]` en
11/11 funciones.

## 8. Locking y comportamiento transaccional

Los cuerpos nuevos conservan exactamente:

- todos los `FOR UPDATE`;
- todos los `FOR UPDATE OF ...`;
- todos los `FOR SHARE`;
- todos los `FOR SHARE OF ...`;
- orden de adquisición de locks;
- comprobaciones posteriores a locks;
- inserts, updates y auditoría dentro de las mismas transacciones.

No se encontró ninguna diferencia de locking.

## 9. Reglas financieras

Permanecen intactos:

- cálculo autoritativo desde snapshots;
- exclusión de ítems cancelados;
- propiedad económica mediante `current_service_session_id`;
- comisión CARD de 5%;
- separación `business_amount`, `fee_amount` y `customer_total`;
- cálculo de efectivo esperado;
- exclusión de gastos anulados;
- reglas y diferencias del cuadre;
- límites, redondeo y códigos de error.

Solo se retiró la calificación inválida de `COALESCE`/`NULLIF`.

## 10. Realtime y triggers

`private.logistics_realtime_orders_insert()` conserva:

- `SECURITY DEFINER`;
- `set search_path = ''`;
- retorno `trigger`;
- payload `ORDERS_CHANGED`;
- un evento de preparación por estación;
- los dos sitios `realtime.send(...)`;
- el argumento privado `true`;
- códigos de error y tópicos actuales.

La migración no contiene `CREATE TRIGGER`, `DROP TRIGGER` ni `ALTER TRIGGER`.
Por tanto, el constraint trigger existente continúa intacto con
`DEFERRABLE INITIALLY DEFERRED`.

## 11. Diferencias adicionales a los dos reemplazos

Dentro de los cuerpos funcionales: **ninguna**.

Fuera de los cuerpos existen únicamente:

1. un encabezado de comentarios que documenta la corrección;
2. `private.logistics_realtime_orders_insert()` usa
   `CREATE OR REPLACE FUNCTION` en lugar del `CREATE FUNCTION` de su migración
   histórica, porque la revisión exige reemplazarla sin `DROP` ni recrear el
   trigger.

Este segundo cambio es solo el introductor DDL requerido; no modifica la
definición efectiva de la función.

## 12. Validaciones Git

- `git diff --check`: correcto, salida vacía.
- `git diff -- <nueva-migracion>`: salida vacía porque el archivo aún es
  untracked.
- Revisión suplementaria:
  `git diff --no-index --stat /dev/null <nueva-migracion>` reporta exactamente
  3,038 inserciones.

Estado relevante:

```text
 M apps/api/package.json
?? apps/api/src/tests/integration/
?? docs/architecture/reporte-objetivo-13-checkpoint-b-blocker-sql.md
?? docs/architecture/reporte-objetivo-13-revision-migracion-condicionales.md
?? supabase/migrations/20260827183221_fix_logistics_conditional_expressions.sql
```

Los cambios del harness y el primer reporte pertenecen al checkpoint anterior
y no fueron modificados durante esta revisión.

## 13. Riesgos restantes

- La migración aún no ha sido ejecutada: falta validación real de sintaxis y
  comportamiento al aplicarla.
- Falta `db reset`, expresamente prohibido en este paso.
- Faltan E2E, concurrencia y Realtime después de aplicar la migración.
- Al repetir cuerpos grandes siempre existe riesgo de drift futuro; para este
  archivo, el comparador automático confirmó cero drift actual.
- Ownership y ACL deben volver a verificarse después de aplicar la migración,
  aunque `CREATE OR REPLACE` está diseñado para preservarlos.

## 14. Acciones no realizadas

- No `db reset`.
- No aplicación manual de la migración.
- No `db push`.
- No Supabase remoto.
- No E2E, concurrencia ni Realtime.
- No cambios al harness.
- No `CHECKOUT_CHANGED` ni hardening.
- No commit, push o merge.
