# KUCHI'S Logistics — Frontend Objetivo 13

## Resultado

**PASS CERTIFICADO.**

KUCHI'S Logistics dispone ahora de descubrimiento PWA instalable, orientación preferida horizontal, recursos de marca, comportamiento de red conservador y ajustes focales para tablet, teléfono horizontal y safe areas. Se preservó el sistema visual y el producto sigue siendo REST/backend-autoritativo. El gate automatizado ya había pasado antes del smoke humano controlado en build local production-like, Chrome y emulación responsive.

## PWA e instalación

Se añadió un manifest nativo del App Router en `src/app/manifest.ts`, servido por el build como `/manifest.webmanifest`, con:

- `name: KUCHI'S Logistics`
- `short_name: KUCHI'S`
- `start_url` e `id`: `/home`
- `scope: /`
- `display: standalone`
- `orientation: landscape`
- idioma español
- fondo `#faf7f1` y tema KUCHI'S `#f66b0e`
- iconos PNG 192×192, 512×512 y 512×512 maskable

`/home` conserva los guards certificados: al iniciar sin sesión utilizable, la navegación existente conduce a login; no se añadió un acceso paralelo. La metadata raíz declara el manifest, nombre de aplicación, Apple Web App, iconos y touch icon, mientras el viewport mantiene `viewportFit: cover` y el color de tema.

## Iconos y marca

Los SVG fuente y PNG se derivaron del `brand__mark` ya existente: naranja KUCHI'S, “K” blanca, punto crema y aro decorativo. No se introdujo una identidad diferente.

- `kuchis-logistics-192.png`: 192×192
- `kuchis-logistics-512.png`: 512×512
- `kuchis-logistics-maskable-512.png`: 512×512 con fondo completo y contenido dentro de la zona segura
- `apple-touch-icon.png`: 180×180

Los SVG quedan como fuente reproducible de esos recursos.

## Service worker y seguridad offline

`public/sw.js` se registra únicamente en builds de producción y usa estrategia **network-only**. No abre ni consulta Cache Storage, no guarda respuestas API/Auth, no mantiene shell offline, no añade Background Sync y no intercepta escrituras para encolarlas o repetirlas.

Los GET pasan directamente a `fetch`; las escrituras siguen el flujo de red normal. Por ello ninguna orden, sesión, cola, disponibilidad, pago, gasto, turno, cierre, cuadre, historial, usuario o respuesta de autenticación puede reaparecer desde una copia offline supuestamente autoritativa.

La actualización del worker no usa `skipWaiting`, `clients.claim` ni recarga forzada. Una nueva versión espera el ciclo normal de cierre de ventanas, evitando interrumpir un pago o una comanda en curso.

## Estado de red y reanudación

`PwaRuntime` escucha `online`/`offline` sin crear otro almacén de credenciales. Cuando el navegador informa pérdida de red aparece un aviso compacto en español: `Sin conexión. La sincronización está pendiente.` La pantalla renderizada puede seguir visible, pero la interfaz no afirma que esté sincronizada.

Al volver la red, el aviso desaparece y la infraestructura del Objetivo 12 recibe `online`, reanuda canales y solicita lecturas REST autoritativas. Al recuperar visibilidad también se invalidan lecturas de forma coalescida. No hay polling ni un segundo indicador Realtime duplicado.

## Orientación y LandscapeGate

El manifest expresa una preferencia `landscape`; no se usa bloqueo JavaScript como mecanismo de control. `LandscapeGate` sigue siendo la decisión efectiva para teléfonos táctiles en portrait: cubre la UI protegida completa, explica que se debe girar el dispositivo y no deja controles operativos rotos accesibles debajo. Login conserva su presentación responsive independiente y la sesión continúa en el `AuthProvider` existente.

## Responsive: tablet y teléfono horizontal

La auditoría confirmó que el CSS certificado ya tenía variantes específicas para las principales familias: Home, Mesas, Comandar, Estado de mesas, Preparación, Carta, Cobro, turnos, Gastos, Cierre, Cuadre, Historial y Usuarios. Se conservaron:

- shell estándar para desktop/tablet y shell compacto por altura para teléfono horizontal;
- botón Volver global, oculto en `/home`, fallback interno y supresión terminal de Checkout;
- geometría física de mesas dentro de un contenedor horizontal intencional;
- workspace de Comandar con scroll interno, sin comprimir sus tres paneles hasta perder uso;
- formularios, tarjetas e historiales con grids responsive existentes;
- diálogos flex con cuerpo scrollable y footer siempre dentro del viewport;
- custom `SelectField` previo al objetivo.

El ajuste compartido de `SelectField` posiciona ahora su portal usando `window.visualViewport`, incluyendo resize y scroll del viewport visual. Esto mantiene el menú dentro del área disponible cuando aparece teclado táctil o cambia el viewport de una PWA, sin perder navegación por teclado ni el stack superior de diálogos.

## Safe areas y touch

Se aplicaron `safe-area-inset-*` de forma neutra en desktop y efectiva en dispositivos instalados/fullscreen:

- laterales del `PageShell` y shell compacto;
- borde inferior del contenido principal;
- backdrop de diálogos;
- LandscapeGate;
- aviso de red.

Los controles principales ya usaban 44–54 px. Se elevó el mínimo de opciones del Select a 44 px, se aseguró 44 px en acciones de footer de diálogos compactos y, para puntero coarse, en navegación histórica y acciones/filtros de usuarios. Los controles densos de cantidad/edición usan 40 px en ese entorno para equilibrar alcance táctil y espacio del panel horizontal.

No se ocultó overflow global. Los desbordes necesarios permanecen confinados a mapas/workspaces o contenedores con scroll intencional.

## Accesibilidad preservada

- Focus visible, labels, errores y orden de tabulación permanecen sin cambios.
- El Select conserva combobox/listbox, flechas, Enter/Espacio, Escape y retorno de foco.
- Los diálogos conservan `role=dialog`, `aria-modal`, focus trap, Escape y retorno de foco.
- El aviso de red usa `role=status` y `aria-live=polite` sin toasts repetitivos.
- Las preferencias de reduced motion siguen aplicándose globalmente.

## Archivos del Objetivo 13

- `apps/logistics/src/app/layout.tsx`
- `apps/logistics/src/app/manifest.ts`
- `apps/logistics/src/app/globals.css`
- `apps/logistics/src/components/ui/select-field.tsx`
- `apps/logistics/src/features/pwa/pwa-model.ts`
- `apps/logistics/src/features/pwa/pwa-runtime.tsx`
- `apps/logistics/src/features/pwa/pwa-model.test.ts`
- `apps/logistics/public/sw.js`
- `apps/logistics/public/icons/kuchis-logistics.svg`
- `apps/logistics/public/icons/kuchis-logistics-maskable.svg`
- cuatro PNG enumerados en la sección de iconos
- `apps/logistics/package.json`
- `docs/architecture/reporte-frontend-logistics-objetivo-13-pwa-mobile-tablet.md`

No se modificaron `apps/api/**`, `apps/client/**`, `packages/shared/**`, `supabase/**`, Vercel, CORS ni Production.

## Validación automatizada

Regresión amplia ejecutada una vez después de completar los cambios compartidos:

| Comando | Resultado |
| --- | --- |
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
| `npm run test:users` | PASS — 12 tests, 0 fallos |
| `npm run test:navigation` | PASS — 6 tests, 0 fallos |
| `npm run test:select` | PASS — 4 tests, 0 fallos |
| `npm run test:realtime` | PASS — 5 tests, 0 fallos |
| `npm run test:pwa` | PASS — 3 tests, 0 fallos |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — `/manifest.webmanifest` y 17 rutas de aplicación generadas |
| `git diff --check` | PASS |

La suite PWA verifica semántica de instalación/orientación/icono maskable, aviso de red y ausencia de caché, Background Sync, activación forzada o control inmediato de clientes en el worker.

## Smoke humano controlado

- **Build production-like local:** `npm run build` y `npm run start` cargaron correctamente desde localhost y habilitaron la ruta de registro del service worker exclusiva de producción: PASS.
- **Manifest:** Chrome DevTools reconoció nombre `KUCHI'S Logistics`, short name `KUCHI'S`, inicio `/home`, modo standalone, orientación landscape, colores KUCHI'S e iconos 192, 512 y maskable. Las recomendaciones opcionales de screenshots no bloquearon instalación: PASS.
- **Service worker:** `sw.js` completó install/activate y quedó activo/disponible para localhost. Que el navegador lo detuviera en inactividad se confirmó como ciclo normal: PASS.
- **Instalación:** Chrome ofreció instalar KUCHI'S Logistics; la instalación terminó y abrió una ventana standalone sin UI normal de pestañas/dirección, en `/home` autenticado y preservando la sesión existente: PASS.
- **Resume:** la PWA instalada quedó en Mesas y se minimizó. Tras cambiar una mesa desde otra sesión autenticada, al restaurarla convergió automáticamente al estado autoritativo sin actualización manual: PASS.
- **Seguridad offline:** en Offline mostró `Sin conexión. La sincronización está pendiente.`, dejó de presentar la carga operacional como vigente, mostró un fallo explícito de conectividad y no permitió una mutación offline desde el estado obsoleto. Al restaurar red, Mesas reapareció por resincronización autoritativa sin F5, Intentar nuevamente, Actualizar ni cambio de ruta: PASS.
- **Teléfono portrait emulado:** LandscapeGate cubrió los controles protegidos e indicó rotar el dispositivo: PASS.
- **Teléfono landscape emulado:** apareció el shell compacto; Mesas, Volver, geometría y controles del header permanecieron utilizables: PASS.
- **Tablet landscape/Mesas:** shell y geometría física permanecieron coherentes, sin clipping relevante y con controles/leyenda alcanzables: PASS.
- **Tablet landscape/Comandar:** categorías, productos y borrador conservaron uso; el scroll quedó contenido y Enviar permaneció alcanzable: PASS.
- **Modal largo en tablet:** contenido con scroll interno, footer dentro del viewport y acciones Cancelar/Agregar visibles y alcanzables: PASS.
- **SelectField en teléfono landscape:** en la transferencia de Estado de mesas, el dropdown apareció por encima del diálogo, sin clipping, dentro del viewport y con opciones legibles/táctiles; el footer siguió alcanzable. No se ejecutó transferencia durante esta verificación visual: PASS.
- **Footer de modal largo:** tras scroll manual en compacto, la acción primaria siguió alcanzable y fuera del borde inferior: PASS.

### Límites del smoke

La certificación responsive se realizó con Chrome desktop y emulación de dispositivos. No se probaron físicamente instalación en iPhone/iPad Safari, instalación en Android Chrome, hardware real con notch/safe areas, diferencias reales de prompts móviles ni orientación entre versiones de sistema operativo.

## Riesgos residuales

- La detección de manifest, prompts de instalación y orientación todavía pueden variar fuera del Chrome desktop validado.
- `navigator.onLine` es una señal de conectividad, no prueba de disponibilidad de la API; los errores REST existentes siguen siendo la autoridad visible de cada operación.
- La estrategia network-only prioriza seguridad operacional: no ofrece uso offline y una recarga sin red puede mostrar la pantalla offline del navegador.
- Una actualización del worker puede permanecer en espera hasta cerrar las ventanas abiertas; se eligió deliberadamente no forzar un reload durante una mutación.
- El posicionamiento con `visualViewport`, las safe areas y la instalación requieren verificación futura en dispositivos físicos Safari/iOS y Chrome/Android.

**Frontend Objetivo 13 — PASS CERTIFICADO.**
