# Reporte de saneamiento de reproducibilidad y documentación

**Fecha:** 2026-08-27  
**Rama:** `feat/logistics-backend-foundation`  
**Alcance:** corrección del seed de `service_points` y actualización puntual de documentación obsoleta previa al Objetivo 13.

## Resultado general

El saneamiento quedó completado dentro del alcance autorizado. Un `supabase db reset` local reconstruye ahora exactamente los 18 puntos de servicio canónicos, sin nombres históricos `Barra 1–4`. La documentación revisada ya presenta el login por `username`, los cinco roles actuales, los tres tipos de punto de servicio y la terminología operativa de Cocina/Bebidas.

No se crearon ni modificaron migraciones. No se consultó ni modificó Supabase remoto. No se ejecutaron commit, push ni merge. Tampoco se trabajó en E2E, concurrencia, Realtime, `CHECKOUT_CHANGED` o hardening.

## 1. Causa exacta del bug del seed

La migración histórica `20260826040232_logistics_v1_identity_and_service_points.sql` conserva correctamente una conversión compatible con instalaciones previas:

```text
Barra 1–4 → B1–B4
```

En una reconstrucción limpia, sin embargo, las filas `Barra 1–4` todavía no existen cuando se aplica esa migración. Posteriormente `supabase/seed.sql` insertaba `Barra 1–4`, por lo que la conversión histórica ya había pasado y no podía renombrarlas.

La solución correcta fue cambiar únicamente el seed para que inserte directamente `B1–B4`. La migración histórica se dejó intacta, preservando compatibilidad con bases antiguas que sí pudieran contener los nombres `Barra 1–4`.

## 2. Archivos modificados

- `supabase/seed.sql`
- `README.md`
- `docs/database/erd-v2-final.md`
- `docs/architecture/reporte-saneamiento-reproducibilidad-documentacion.md` — este reporte nuevo.

El reporte previo `docs/architecture/reporte-inspeccion-backend-objetivo-13.md` ya existía sin seguimiento antes de esta tarea y no fue modificado.

## 3. Diff conceptual por archivo

### `supabase/seed.sql`

- Sustituyó `Barra 1`, `Barra 2`, `Barra 3` y `Barra 4` por `B1`, `B2`, `B3` y `B4`.
- Conservó tipos `BAR`, órdenes 8–11 y estado activo.
- No alteró migraciones ni el resto de datos iniciales.

### `README.md`

- Cambió el login visible de correo a usuario.
- Documentó `username` + contraseña y aclaró que `auth_email` es interno.
- Actualizó roles a `ADMIN`, `MANAGER`, `WAITER`, `CASHIER` y `KITCHEN`.
- Actualizó la distribución a 18 puntos: `Mesa 1–7`, `B1–B4`, `LL1–LL7`.
- Añadió el tipo `TAKEAWAY`.
- Sustituyó terminología operativa obsoleta de Parrilla por Cocina/Bebidas.
- Aclaró que `DRINKS` es una estación de preparación, no un rol.

### `docs/database/erd-v2-final.md`

- Actualizó nombres, cantidades y tipos de `service_points`.
- Actualizó roles y enumeraciones solicitadas.
- Documentó `username` y el carácter interno de `auth_email`.
- Actualizó ejemplos históricos de Barra a nombres `B1–B4`.
- Sustituyó terminología de Parrilla por preparación `KITCHEN`/Cocina y `DRINKS`/Bebidas.
- No reescribió el ERD completo ni corrigió divergencias fuera del alcance autorizado.

## 4. Resultado de `supabase db reset`

Comando ejecutado con Supabase CLI local `2.115.0`:

```text
supabase db reset
```

Resultado:

```text
Finished supabase db reset on branch feat/logistics-backend-foundation.
Reset local database.
```

Las 17 migraciones se aplicaron correctamente y después se cargó `supabase/seed.sql`. No hubo fallos de migración ni de seed.

## 5. `service_points` resultantes

| sort_order | name | type | is_active |
|---:|---|---|---|
| 1 | Mesa 1 | TABLE | true |
| 2 | Mesa 2 | TABLE | true |
| 3 | Mesa 3 | TABLE | true |
| 4 | Mesa 4 | TABLE | true |
| 5 | Mesa 5 | TABLE | true |
| 6 | Mesa 6 | TABLE | true |
| 7 | Mesa 7 | TABLE | true |
| 8 | B1 | BAR | true |
| 9 | B2 | BAR | true |
| 10 | B3 | BAR | true |
| 11 | B4 | BAR | true |
| 12 | LL1 | TAKEAWAY | true |
| 13 | LL2 | TAKEAWAY | true |
| 14 | LL3 | TAKEAWAY | true |
| 15 | LL4 | TAKEAWAY | true |
| 16 | LL5 | TAKEAWAY | true |
| 17 | LL6 | TAKEAWAY | true |
| 18 | LL7 | TAKEAWAY | true |

Verificaciones agregadas:

- `Barra 1–4`: 0 filas.
- `TABLE`: 7 filas.
- `BAR`: 4 filas.
- `TAKEAWAY`: 7 filas.
- `sort_order` distintos: 18.
- Rango de `sort_order`: 1–18.

## 6. Total de `service_points`

```text
18
```

## 7. Resultado de typecheck

```text
npm run typecheck
> tsc --noEmit
```

Resultado: correcto, sin errores.

## 8–9. Resultado y total de tests

```text
npm test
tests:     115
suites:    19
passed:    115
failed:    0
cancelled: 0
skipped:   0
```

Resultado: correcto, `115/115`.

## 10. Resultado de compile

```text
npm run compile
> tsc
```

Resultado: correcto, sin errores.

## 11. Verificaciones Git

- `git diff --check`: correcto, sin errores de whitespace.
- No se modificaron migraciones históricas.
- No se creó ninguna migración nueva.
- No se realizó commit, push ni merge.
- Los cambios permanecen locales para revisión.

## 12. Otra contradicción descubierta

`docs/database/erd-v2-final.md` conserva divergencias adicionales del modelo previo a la implementación que no pertenecían al saneamiento autorizado. Entre los ejemplos confirmados:

- Documenta campos `orders.status` y `orders.ready_at` que no existen en el modelo actual.
- Documenta estados de `order_items` como `ACTIVE`/`CANCELLED`; el modelo actual usa `PENDING`, `PREPARING`, `READY`, `DELIVERED` y `CANCELLED`.
- La sección de entidades finales afirma que existen 11 tablas propias, pero el backend actual añadió, entre otras, adiciones, transferencias, gastos y conciliaciones.
- No reconstruye completamente campos actuales como `current_service_session_id`, snapshots de rol, estación de preparación y trazabilidad de cancelaciones/transferencias.

Estas divergencias se reportan, pero no se corrigieron para evitar ampliar el alcance y reescribir innecesariamente el ERD.

## 13. Seguridad para comenzar después el Objetivo 13

Sí, el saneamiento solicitado deja una base reproducible y es seguro comenzar posteriormente el desarrollo formal del Objetivo 13.

La recomendación es tratar la actualización integral del ERD como deuda documental separada o incorporarla en la documentación técnica final del propio Objetivo 13. Esta deuda no impide iniciar el harness E2E, porque las migraciones, los tipos generados y la base local reconstruida son la fuente técnica vigente.

## Conclusión

El bug del seed quedó cerrado sin tocar historial de migraciones. El reset local produce el estado canónico exacto y todos los baselines existentes siguen verdes. El alcance se detuvo aquí, antes de cualquier desarrollo del Objetivo 13.
