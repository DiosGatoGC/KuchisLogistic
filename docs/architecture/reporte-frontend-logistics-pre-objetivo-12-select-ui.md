# KUCHI'S Logistics — Microajuste previo al Objetivo 12

## Resultado

**PASS — ready for controlled human smoke.**

Se reemplazó la presentación nativa de los selects ordinarios de Logistics por un único Select/Listbox reutilizable y controlado visualmente. El cambio es exclusivamente presentacional y de accesibilidad: no modifica contratos, validaciones, capacidades, locks, payloads ni reconciliaciones autoritativas.

## Problema original

El control cerrado heredaba parcialmente el diseño KUCHI'S, pero el panel nativo abierto dependía del navegador y sistema operativo: superficie blanca, esquinas rectas, selección azul, tipografía ajena, espaciado variable y listas de destino excesivamente altas. Esto producía una experiencia inconsistente, especialmente dentro de modales y en PWA/fullscreen.

## Implementación

- Se creó `SelectField`, un componente controlado compartido con API de `value`, `options` y `onChange`.
- El trigger conserva superficie cálida, borde, tipografía, altura, esquinas, chevron y foco KUCHI'S.
- El listbox se renderiza mediante portal fijo sobre la interfaz, con `z-index` superior al diálogo para evitar clipping por el cuerpo scrollable del modal.
- La posición se calcula respecto del trigger y del viewport; abre hacia abajo por defecto y hacia arriba cuando el espacio inferior es insuficiente.
- El panel admite aproximadamente seis opciones antes de activar scroll vertical interno, sin overflow horizontal.
- No se añadió ninguna dependencia.

## Controles migrados

1. Estado de mesas — punto libre para transferir una atención completa.
2. Estado de mesas — atención activa para transferir un ítem.
3. Gastos — categoría `SUPPLIES` / `CLEANING` / `OTHER`.
4. Usuarios — rol al crear una cuenta.
5. Usuarios — rol al editar una cuenta.
6. Actualizar carta — categoría del toolbar compacto.

No quedan elementos `<select>` nativos dentro de `apps/logistics/src`.

## Accesibilidad

- Label visible asociado al trigger.
- Semántica `combobox` + `listbox` + `option` con estado expandido, opción activa y selección actual anunciables.
- Enter y Space abren/seleccionan.
- Arrow Up/Arrow Down recorren las opciones habilitadas con wrap.
- Escape cierra sólo el listbox y evita cerrar accidentalmente el modal contenedor.
- Tab cierra el panel y conserva el avance normal del foco.
- Click/tap fuera cierra el panel.
- Estados disabled, required, error y descripción se exponen mediante ARIA.
- Foco visible, opciones seleccionadas/activas con tratamiento naranja KUCHI'S y touch targets de 42 px.

## Preservación de valores

El componente devuelve directamente el `value` exacto de la opción proporcionada por el formulario padre:

- las transferencias conservan el ID exacto de sesión o punto de servicio;
- los placeholders no son valores válidos ni se envían;
- Gastos conserva `SUPPLIES`, `CLEANING` y `OTHER`, incluido el comportamiento de `customCategory`;
- Usuarios conserva los enums backend exactos de rol;
- Carta conserva el slug exacto de categoría.

No se modificaron flujos de confirmación, validaciones, mutaciones, permisos ni manejo de errores.

## Validación automatizada

Ejecutada desde `apps/logistics`:

| Comando | Resultado |
| --- | --- |
| `npm run test:select` | PASS — 4 tests, 0 fallos |
| `npm run test:table-operations` | PASS — 20 tests, 0 fallos |
| `npm run test:expenses` | PASS — 13 tests, 0 fallos |
| `npm run test:users` | PASS — 12 tests, 0 fallos |
| `npm run test:catalog-availability` | PASS — 10 tests, 0 fallos |
| `npm run test:navigation` | PASS — 6 tests, 0 fallos |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

La prueba focal cubre índice inicial, navegación por flechas, wrap, exclusión de opciones deshabilitadas, selección del valor exacto y placeholder.

## Smoke humano pendiente

1. Abrir Categoría en Gastos y comprobar estilo, selección exacta y aparición de categoría personalizada para `OTHER`.
2. Abrir los destinos de transferencia de ítem y confirmar opciones elegibles y workflow intacto sin ejecutar mutaciones sólo por motivos visuales.
3. Revisar la lista larga de transferencia de atención, su altura máxima, scroll interno y destino seleccionado.
4. Confirmar que el panel aparece encima del modal y footer, sin clipping, y que Escape cierra primero el listbox.
5. Verificar Enter/Space, flechas, Enter para seleccionar, Escape, Tab y click/tap exterior.
6. Revisar desktop, tablet, teléfono landscape compacto y touch.
7. Revisar los roles de creación/edición y el selector compacto de Carta.

No se debe mutar Production para fabricar casos durante esta comprobación visual.

## Riesgos residuales

- El posicionamiento final, scroll y stacking dentro de navegadores/PWA reales requieren el smoke visual humano.
- La implementación usa el patrón `aria-activedescendant`; su anuncio puede variar ligeramente entre combinaciones de navegador y lector de pantalla.
- Los controles especializados que no eran selects nativos no se modificaron.

**PRE-OBJECTIVE 12 SELECT UI FIX: PASS — ready for controlled human smoke.**
