# KUCHI'S Logistics — Frontend Objetivo 12

## Resultado

**PASS CERTIFICADO.**

Se integró el contrato privado de Supabase Realtime existente como una capa de invalidación segura. Los broadcasts aceleran la convergencia entre operadores, pero nunca sustituyen lecturas REST, mutaciones ni decisiones autoritativas. El gate automatizado ya había pasado antes del smoke humano controlado, que confirmó la convergencia real entre dos sesiones autenticadas.

## Arquitectura

La infraestructura común vive en `apps/logistics/src/features/realtime/` y tiene tres responsabilidades separadas:

- `logistics-realtime-model.ts` valida versión, forma básica, tópico y familia del evento contra `@kuchis/shared/logistics-realtime`.
- `realtime-invalidation-coordinator.ts` agrupa ráfagas durante 180 ms, serializa recargas y conserva una invalidación pendiente si otra lectura sigue en curso.
- `use-logistics-realtime.ts` vincula autenticación, canales privados, suscripción, reconexión, retorno a primer plano, recuperación de red y teardown.

No se añadió un store global ni una dependencia de estado. Supabase JS sigue siendo el único cliente Realtime y utiliza la sesión ya gestionada por `AuthProvider`.

## Regla REST autoritativa

El flujo implementado es exclusivamente:

`broadcast válido → invalidación coalescida → GET REST existente → estado de pantalla`

Los payloads no escriben ocupación de mesas, sesiones, comandas, preparación, disponibilidad, turnos, pagos, gastos, cierres ni cuadre. Mensajes malformados, de versión futura o asociados a una familia incorrecta se ignoran sin afectar la UI. No se introdujeron polling, mutaciones Realtime, retries de escrituras ni replay supuesto.

## Tópicos y pantallas

| Tópico oficial | Eventos aceptados | Pantallas que invalidan lecturas |
| --- | --- | --- |
| `logistics:v1:tables` | `TABLES_CHANGED`, `ORDERS_CHANGED` | Mesas, Estado de mesas, Comandar y Cobro |
| `logistics:v1:kitchen` | `PREPARATION_CHANGED` con estación `KITCHEN` | Cocina cuando esa estación está activa |
| `logistics:v1:drinks` | `PREPARATION_CHANGED` con estación `DRINKS` | Bebidas cuando esa estación está activa |
| `logistics:v1:catalog` | `CATALOG_CHANGED` | Actualizar carta y Comandar |
| `logistics:v1:shift` | `SHIFT_CHANGED` | Apertura, Cierre, Cuadre, Gastos e Historial |
| `logistics:v1:finance` | `FINANCE_CHANGED` | Cobro, Gastos, Cierre, Cuadre e Historial |

Las vistas no se suscriben indiscriminadamente a los seis tópicos. Comandar preserva y revalida su borrador local después del GET; Preparación mantiene su reloj local de 60 segundos sin tráfico adicional.

## Seguridad y ciclo de sesión

- Todos los canales se crean con `config: { private: true }`.
- No se intenta suscribir antes de disponer de usuario y estado autenticado.
- La conexión usa la sesión Supabase existente y actualiza la autenticación del cliente Realtime sin exponer credenciales.
- Logout, cambio de sesión, cambio de tópicos y desmontaje cancelan el coordinador, retiran listeners y ejecutan `removeChannel` para cada canal.
- Los remounts de React limpian la instancia anterior; las dependencias primitivas por tópico evitan resuscripciones causadas sólo por arrays recreados al renderizar.
- No se modificaron Auth, RLS, configuración Supabase ni canales públicos.

## Reconexión y degradación

Cada estado `SUBSCRIBED`, tanto inicial como posterior a una interrupción, agenda una lectura REST antes de considerar la vista sincronizada. Volver a una pestaña visible también invalida de forma coalescida y el evento `online` solicita una lectura inmediata. No se asume replay ni se reconstruyen mensajes perdidos.

Los estados `TIMED_OUT`, `CHANNEL_ERROR` y `CLOSED` se consideran sincronización demorada, pero no bloquean la operación REST. Los botones Actualizar/Refresh existentes permanecen disponibles y no existe polling de respaldo. El estado técnico no se expone mediante mensajes ruidosos al operador.

## Coalescing y seguridad de mutaciones

- Una ráfaga crea como máximo un temporizador de 180 ms.
- Si llega otra invalidación durante un GET, queda una sola recarga pendiente y se ejecuta al terminar.
- Los identificadores de request ya certificados en las vistas impiden que una respuesta antigua sobrescriba la más reciente.
- Mesas, Preparación y Estado de mesas conservan sus locks y reconciliaciones existentes.
- Carta, turnos, Gastos, Cobro y Cuadre omiten una recarga Realtime durante su escritura activa; la propia operación conserva su refetch autoritativo.
- Realtime nunca cancela, repite ni confirma una escritura, y tampoco limpia campos o selecciones de formularios.

## Archivos cambiados

- `apps/logistics/package.json`
- `apps/logistics/package-lock.json`
- `apps/logistics/src/features/realtime/logistics-realtime-model.ts`
- `apps/logistics/src/features/realtime/realtime-invalidation-coordinator.ts`
- `apps/logistics/src/features/realtime/use-logistics-realtime.ts`
- `apps/logistics/src/features/realtime/logistics-realtime-model.test.ts`
- Vistas de `tables`, `table-operations`, `ordering`, `preparation`, `catalog-availability`, `checkout`, `expenses`, `shifts` e `history` enumeradas en la tabla anterior.
- `docs/architecture/reporte-frontend-logistics-objetivo-12-realtime-hardening.md`

No se modificaron `apps/api/**`, `apps/client/**`, `packages/shared/**` ni `supabase/**`.

## Validación automatizada

Ejecutada desde `apps/logistics` salvo `git diff --check`:

| Comando | Resultado |
| --- | --- |
| `npm run test:realtime` | PASS — 5 tests, 0 fallos |
| `npm run test:tables` | PASS — 5 tests, 0 fallos |
| `npm run test:ordering` | PASS — 35 tests, 0 fallos |
| `npm run test:preparation` | PASS — 34 tests, 0 fallos |
| `npm run test:table-operations` | PASS — 20 tests, 0 fallos |
| `npm run test:catalog-availability` | PASS — 10 tests, 0 fallos |
| `npm run test:shifts` | PASS — 8 tests, 0 fallos |
| `npm run test:expenses` | PASS — 13 tests, 0 fallos |
| `npm run test:checkout` | PASS — 25 tests, 0 fallos |
| `npm run test:closeout` | PASS — 16 tests, 0 fallos |
| `npm run test:history` | PASS — 7 tests, 0 fallos |
| `npm run test:navigation` | PASS — 6 tests, 0 fallos |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS en ejecución estable posterior al build |
| `npm run build` | PASS — 17 rutas generadas/compiladas |
| `git diff --check` | PASS |

Una primera ejecución paralela de `typecheck` coincidió con la regeneración de `.next/types` por `next build` y observó archivos transitorios ausentes. Se repitió una sola vez después de terminar el build y pasó sin errores de fuente. No se conservó `tsconfig.tsbuildinfo`.

## Smoke humano controlado

Se ejecutó con dos sesiones Logistics autenticadas y flujos operativos soportados:

- **Mesas Realtime:** una mesa abierta desde la sesión A cambió automáticamente de Libre a Abierta en B, sin Refresh, Actualizar ni cambio de ruta. Al liberarla normalmente desde A, B volvió automáticamente a Libre: PASS.
- **Catálogo Realtime:** un producto disponible se marcó no disponible desde A y B reflejó el cambio sin actualización manual. Al restaurarlo desde A, B volvió a mostrarlo disponible; el estado final del catálogo quedó restaurado: PASS.
- **Cocina:** una comanda controlada nueva apareció automáticamente en la vista Cocina de B. Las transiciones `PENDING → PREPARING → READY → DELIVERED` se sincronizaron sin actualización manual: PASS.
- **Bebidas:** se repitió el flujo con un ítem de Bebidas; la comanda y sus transiciones soportadas se propagaron automáticamente: PASS.
- **Seguridad de release:** el intento de liberar una atención que ya contenía una comanda fue rechazado correctamente y la orden/sesión permaneció intacta. Es evidencia de regresión, no un contrato Realtime nuevo: PASS.
- **Checkout y mesas:** después del pago autoritativo por el flujo normal de Cobro, la segunda sesión mostró la mesa Libre automáticamente: PASS.
- **Finance/Gastos:** A creó un gasto Insumos de S/ 1.00 con descripción `Smoke Realtime Obj12`; B pasó automáticamente de 0 gastos/S/ 0.00 a 1 gasto/S/ 1.00. Tras anularlo por el flujo soportado, B regresó a 0 gastos/S/ 0.00 y el estado final quedó restaurado: PASS.
- **Shift/Cierre:** ambas sesiones mostraban el mismo turno OPEN. A lo cerró normalmente y B pasó, sin actualización manual, al estado sin turno abierto: PASS.
- **Shift/Apertura:** sin turno actual, A abrió uno con S/ 0.00 y B detectó automáticamente el nuevo turno OPEN: PASS.
- **Offline/reconexión:** B quedó en Mesas y se puso Offline desde DevTools. Mostró `Sin conexión. La sincronización está pendiente.` y conservó su visual anterior sin inventar el cambio que A realizó. Al recuperar red, B convergió automáticamente a Abierta sin F5, Actualizar ni cambio de ruta. La mesa temporal se liberó normalmente después: PASS.

### Límites del smoke

No se forzaron manualmente el rechazo de canales privados para cuentas anónimas o inactivas, el conteo exacto de GET por ráfaga ni todas las variantes de payload malformado o de versión futura mediante un canal vivo. Esas áreas permanecen respaldadas por la certificación de seguridad/backend existente y/o pruebas frontend deterministas donde corresponde; no se observaron bloqueos.

## Riesgos residuales

- La convergencia depende de que el backend emita los broadcasts ya certificados; la UI conserva Refresh manual cuando Realtime no está disponible.
- Una invalidación descartada durante una mutación depende del refetch autoritativo ya incluido en ese flujo; no se añade una segunda lectura automática que pudiera interferir con su reconciliación.
- El coalescing reduce ráfagas por instancia de vista; no existe coordinación global entre pestañas, de forma deliberada.
- Los rechazos privados de sesiones anónimas/inactivas, el conteo exacto de GET por ráfaga y todas las formas inválidas/futuras no se volvieron a forzar en este smoke frontend.

**Frontend Objetivo 12 — PASS CERTIFICADO.**
