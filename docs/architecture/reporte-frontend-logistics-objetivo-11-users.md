# KUCHI'S Logistics — Frontend Objetivo 11

## Resultado

**PASS CERTIFICADO.**

Se implementó la administración de usuarios con autorización por capacidad, lecturas autoritativas y escrituras de un solo envío. La interfaz no llama Supabase Auth directamente, no ejecuta compensaciones, no introduce polling/Realtime y no conserva ni muestra contraseñas después de una operación.

## Alcance implementado

- `/usuarios` reemplaza el placeholder por un directorio con estados Todos, Activos e Inactivos.
- La creación admite nombre, usuario normalizado, contraseña inicial, rol backend exacto y estado activo/inactivo.
- La edición permite cambiar únicamente nombre, usuario y rol.
- Activación y desactivación usan acciones dedicadas; la desactivación exige confirmación explícita.
- El restablecimiento de contraseña está separado de edición y de acciones de acceso.
- La cuenta actual se identifica visualmente; su desactivación muestra una advertencia reforzada y cierra la sesión tras confirmarse.
- Un cambio del propio rol fuerza una recarga completa para resolver nuevamente el perfil y las capacidades.
- Formularios y diálogos reutilizan labels, errores asociados, focus trap, Escape/cancelación, estados busy y controles táctiles del sistema KUCHI'S.

## Contratos backend exactos

Todos los endpoints requieren `users.manage`:

- `GET /api/logistics/users` — sin query devuelve todos; `status=active|inactive` filtra en servidor.
- `GET /api/logistics/users/:id` — devuelve `{ user }`; `USER_NOT_FOUND` se presenta explícitamente.
- `POST /api/logistics/users` — payload `{ fullName, username, password, role, isActive }`, respuesta 201 `{ user }`.
- `PATCH /api/logistics/users/:id` — payload con uno o más de `{ fullName, username, role }`.
- `POST /api/logistics/users/:id/activate` y `/deactivate` — sin body.
- `POST /api/logistics/users/:id/reset-password` — payload `{ newPassword }`, respuesta `{ success: true }`.

Los roles enviados se limitan a `ADMIN`, `MANAGER`, `WAITER`, `CASHIER` y `KITCHEN`, con etiquetas amigables sólo de presentación.

## Capacidad y listado

La ruta permanece dentro de `CapabilityGuard` con `users.manage`; una cuenta sin esa capacidad no monta la vista ni realiza solicitudes conocidas como no autorizadas. No existe una falsa vista de sólo lectura. Todos/Activos/Inactivos emiten únicamente las queries soportadas, sin búsqueda o paginación inventadas.

## Creación y actualización

- Nombre se recorta y valida en 1..120 caracteres.
- Usuario se recorta, pasa a minúsculas, valida 3..60 caracteres y restringe letras, números, punto, guion y guion bajo.
- La contraseña se valida en 8..72 caracteres y se envía mediante input protegido.
- Cada submit adquiere un lock síncrono y envía exactamente una escritura.
- No se inserta ni modifica una fila de forma optimista.
- Después de crear se consulta la lista completa autoritativa y se exige una coincidencia única del usuario normalizado.
- Después de editar se consulta el detalle y se comparan los campos normalizados solicitados.
- `USERNAME_ALREADY_EXISTS` conserva un mensaje determinista explícito.
- `USER_CREATION_COMPENSATION_FAILED` bloquea la creación y exige revisión manual; el frontend no replica la creación Auth ni intenta compensar.

Ante un resultado ambiguo de create, la UI consulta todos los usuarios: una coincidencia exacta única confirma el resultado; cero coincidencias no afirman éxito y requieren otra decisión humana; múltiples coincidencias o lectura fallida bloquean la operación para revisión. Ante un PATCH ambiguo se consulta el detalle y sólo se confirma si refleja los campos solicitados. Nunca se reenvía automáticamente la escritura.

## Activación, desactivación y cuenta propia

Activar/desactivar usa confirmación, lock, un único POST y lectura posterior del usuario. Los controles corresponden al estado actual y nunca cambian de forma optimista. Un resultado ambiguo sólo se acepta si la lectura autoritativa refleja el estado solicitado.

La auto-desactivación advierte que se perderá acceso. Si el POST queda confirmado, o la lectura posterior ya no es accesible porque la cuenta quedó inactiva, la sesión local se cierra de forma conservadora. Un cambio del propio rol recarga la aplicación después de la respuesta/decisión de reconciliación para que `/auth/me` vuelva a resolver capacidades; no se mantienen supuestos basados en el rol anterior.

## Contraseñas

- Los campos usan `type=password` y `autocomplete=new-password`.
- El reset exige confirmación coincidente antes de enviar.
- Los valores sensibles no entran en URLs, almacenamiento local/de sesión, banners, modelos de usuario ni logs.
- Los campos se limpian después de un intento enviado y el valor resultante nunca se muestra.
- Un reset ambiguo no tiene lectura que pueda probar el resultado: no se reintenta, no afirma éxito, no intenta login y bloquea el reenvío inmediato hasta una nueva decisión administrativa explícita.

Este reporte no contiene ninguna contraseña.

## Archivos cambiados

- `apps/logistics/src/app/(protected)/usuarios/page.tsx`
- `apps/logistics/src/features/users/users-api.ts`
- `apps/logistics/src/features/users/users-types.ts`
- `apps/logistics/src/features/users/users-model.ts`
- `apps/logistics/src/features/users/users-attempts.ts`
- `apps/logistics/src/features/users/users-errors.ts`
- `apps/logistics/src/features/users/users-view.tsx`
- `apps/logistics/src/features/users/users-model.test.ts`
- `apps/logistics/src/app/globals.css`
- `apps/logistics/package.json`
- `docs/architecture/reporte-frontend-logistics-objetivo-11-users.md`

## Validación automatizada

Ejecutada desde `apps/logistics`:

| Comando | Resultado |
| --- | --- |
| `npm run test:users` | PASS — 12 tests, 0 fallos |
| `npm run test:history` | PASS — 7 tests, 0 fallos |
| `npm run test:navigation` | PASS — 6 tests, 0 fallos |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — `/usuarios`, `/historial` y `/historial/[shiftId]` generadas |
| `git diff --check` | PASS |

No se modificó auth compartido, por lo que no existe una suite auth adicional aplicable. La prueba focal cubre requests de lista, filtros, normalización, etiquetas, autorización, validaciones/payload de create, locks, conflicto, compensación fallida, reconciliación ambigua sin retry, PATCH mínimo, refetch, activación/desactivación, cuenta propia, validación/payload/limpieza de reset y resultado ambiguo terminal.

## Smoke humano controlado en Production

Se utilizó la cuenta dedicada no crítica `smoke.obj11`. La cuenta administradora principal permaneció activa e intacta. Ninguna contraseña se registra en este reporte.

### Verificado manualmente

- `/usuarios` presentó el directorio con nombre, username, rol amigable, estado, fecha, Editar, Desactivar, Restablecer contraseña y formulario de creación separado; la cuenta actual se marcó con `(tú)`: PASS.
- Los filtros Todos, Activos e Inactivos cargaron correctamente. Inactivos presentó `No hay usuarios en este estado` como vacío válido antes de la cuenta controlada: PASS.
- Una sola creación explícita produjo `Usuario Smoke Objetivo 11`, `@smoke.obj11`, rol WAITER/Mesero y estado Activo; la lista autoritativa mostró una única fila y el administrador no cambió: PASS.
- El username normalizado se presentó correctamente como `@smoke.obj11`: PASS.
- La edición exclusiva del nombre a `Usuario Smoke Obj11 Editado` conservó username, rol y estado, con confirmación autoritativa: PASS.
- El cambio del usuario no actual de WAITER/Mesero a CASHIER/Caja se reflejó tras la lectura autoritativa: PASS.
- Un login manual separado de `smoke.obj11` mostró nombre/rol Caja y capacidades CASHIER reales; Usuarios y funciones administrativas restringidas no aparecieron: PASS.
- La desactivación confirmada una sola vez cambió el usuario a Inactivo y sustituyó Desactivar por Activar: PASS.
- Una sesión ya autenticada de la cuenta controlada perdió acceso útil a endpoints protegidos después de la desactivación remota. La UI no cerró automáticamente esa sesión local; lo verificado fue la denegación autoritativa del backend: PASS.
- Un login nuevo de la cuenta inactiva fue rechazado con el mensaje genérico `Usuario o contraseña incorrectos`, evitando enumerar el estado de la cuenta: PASS.
- La reactivación confirmó estado Activo y restauró la acción Desactivar: PASS.
- Un login manual posterior volvió a resolver rol Caja y acceso CASHIER; Gastos mostró el estado operativo válido `No hay turno abierto`: PASS.
- El diálogo de restablecimiento presentó nueva contraseña, confirmación, Cancelar, acción final y aviso de no volver a mostrar la credencial: PASS.
- Un único reset confirmó manualmente que la credencial anterior fue rechazada, la nueva fue aceptada y el frontend no mostró el valor resultante: PASS.
- Una creación con el username existente `smoke.obj11` devolvió `El nombre de usuario ya está en uso.`; no apareció otra fila ni se creó un tercer usuario: `USERNAME_ALREADY_EXISTS` PASS.
- La limpieza final desactivó nuevamente `smoke.obj11`. El administrador quedó Activo y la cuenta controlada quedó como `Usuario Smoke Obj11 Editado`, rol Caja, estado Inactivo: PASS.

No existe un endpoint soportado para eliminar usuarios. Por ello, la cuenta dedicada del smoke permanece intencionalmente retenida en Production como **INACTIVA** después de la limpieza; esto no constituye un fallo de cleanup.

### No verificado manualmente

- Respuestas ambiguas/perdidas de create, update, activate, deactivate o reset.
- Submits duplicados concurrentes, `USER_CREATION_COMPENSATION_FAILED` y carrera mutante `USER_NOT_FOUND`.
- Auto-desactivación del administrador, cambio del propio rol y rehidratación de su sesión.
- Cambio del username controlado a otro username único.
- Límites exactos de contraseña, límites/regex de username, navegación exclusiva por teclado en todos los diálogos y todos los breakpoints responsive.

Estos escenarios permanecen cubiertos automáticamente, no fueron necesarios o no era seguro forzarlos en Production.

## Riesgos residuales

- Un reset ambiguo no puede reconciliarse técnicamente; requiere decisión administrativa y verificación humana fuera del flujo automático.
- La cuenta dedicada del smoke permanece intencionalmente Inactiva porque el contrato no dispone de eliminación; es el cleanup esperado.
- La auto-desactivación y el cambio del propio rol son deliberadamente conservadores, pero quedan pendientes de smoke en un entorno/cuenta segura.
- `USER_CREATION_COMPENSATION_FAILED` requiere investigación manual del backend y no admite retry automático desde la interfaz.
- La desactivación remota corta el acceso protegido en backend, pero no limpió automáticamente la sesión local ya abierta durante este smoke.

**Frontend Objective 11 — PASS CERTIFICADO.**
