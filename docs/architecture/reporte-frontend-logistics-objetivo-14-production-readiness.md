# KUCHI'S Logistics — Frontend Objetivo 14 — Production Readiness

## Resultado final

**Frontend Objetivo 14 — PASS CERTIFICADO.**

La auditoría inicial y el smoke humano amplio en Production validaron los flujos
operativos, desktop y tablet. Una validación posterior con un teléfono Android
físico reveló dos defectos finales: login recortado en landscape corto y relaunch
no visible desde el icono instalado. Tras desplegar las correcciones, el smoke
físico final confirmó el login responsive, la instalación, dos cold relaunch
consecutivos desde el icono y la restauración de sesión. El objetivo queda
certificado y el roadmap frontend queda completo.

## Alcance

- Auditoría transversal de `apps/logistics` sobre configuración pública, cliente
  REST, Auth, seguridad del navegador, PWA, Realtime, rutas, recuperación,
  accesibilidad, responsive, recursos, dependencias e higiene del repositorio.
- Correcciones limitadas a defectos concretos de readiness, sin rediseño ni
  cambios en contratos operativos certificados.
- La implementación no modificó backend, cliente público, contratos compartidos,
  Supabase, CORS ni contratos operativos. Este cierre documental tampoco cambió
  aplicación, configuración local o remota ni Production.
- En esta corrección local no se ejecutaron mutaciones ni se modificó Production.
  La evidencia humana Production indicada aquí fue aportada después del smoke
  controlado y su cleanup.

## Baseline certificado preservado

Se preservaron los Objetivos 1–13 y sus invariantes: REST/backend autoritativo,
capacidades como fuente de autorización, reconciliación sin reintentos ciegos,
pago sin éxito optimista, Historial read-only, geometría física de mesas,
reloj local de Preparación sin tráfico API, Realtime privado como invalidación,
PWA sin caché/cola de mutaciones, navegación Back protegida, `LandscapeGate` y
`SelectField` accesible. Las suites específicas de todos estos módulos permanecen
en PASS.

## Hallazgos de readiness

| Severidad | Área | Hallazgo | Acción | Estado |
|---|---|---|---|---|
| BLOCKER | Dependencias | `next@16.3.2` estaba afectado por dos avisos críticos de RCE (`GHSA-p293-qw3h-jr36` y `GHSA-2xp9-vwfh-vxw4`). | Upgrade puntual a `next@16.3.4` y alineación de `eslint-config-next@16.3.4`; sin `audit fix --force`. | Corregido; audit runtime y completo: 0 vulnerabilidades. |
| SHOULD FIX BEFORE PRODUCTION | Configuración | Las variables solo se comprobaban por presencia; una URL malformada fallaba tarde y de forma inconsistente. | Capa pura y tipada que exige los tres valores, normaliza orígenes, exige HTTPS salvo localhost controlado y rechaza ruta, query, fragmento, credenciales y claves Supabase privadas reconocibles. | Corregido y probado. |
| SHOULD FIX BEFORE PRODUCTION | REST | Los GET operativos no declaraban una política explícita de caché y una respuesta 2xx sin JSON podía cruzar el límite tipado como válida. | `cache: "no-store"` para todas las llamadas del cliente común; URL compuesta de forma segura y 2xx sin JSON convertido en error `unexpected`. | Corregido. |
| SHOULD FIX BEFORE PRODUCTION | Auth | Una caída transitoria durante `/auth/me` descartaba el estado UI y enviaba al login; además `ACCOUNT_INACTIVE` solo provocaba logout uniforme en Usuarios. | Estado de sesión temporalmente no disponible con reintento explícito, sin borrar la sesión local; invalidación central solo para 401 o `ACCOUNT_INACTIVE`, aplicada a todos los módulos. | Corregido. |
| SHOULD FIX BEFORE PRODUCTION | Recuperación global | No existían límites App Router para una excepción inesperada de render/runtime. | `error.tsx` y `global-error.tsx` con mensaje seguro y reintento manual usando el diseño existente. | Corregido. |
| SHOULD FIX BEFORE PRODUCTION | Seguridad HTTP | No había cabeceras frontend defensivas y se exponía `X-Powered-By`. | Cabeceras mínimas anti-frame/MIME/referrer/capabilities; `poweredByHeader: false`; `sw.js` con `no-store`. | Corregido; verificado con `next start`. |
| SHOULD FIX BEFORE PRODUCTION | PWA | El worker network-only interceptaba todo GET, incluidos orígenes externos y una posible ruta API same-origin. | Intercepción limitada a GET del mismo origen que no empiece por `/api/`; continúa sin Cache Storage, Sync, cola, `skipWaiting` ni `clients.claim`. | Corregido y probado. |
| BLOCKER DE CERTIFICACIÓN FÍSICA | Login móvil | `overflow: hidden` y breakpoints definidos solo por ancho mantenían el layout desktop/tablet de dos columnas en teléfonos landscape de más de 720 px pero muy poca altura. El formulario excedía el viewport sin un scroll útil. | El login es ahora un scroll container vertical seguro; se añadió composición compacta por landscape + pointer coarse + altura ≤ 520 px, conservando safe areas y targets de 44 px. | Corregido y confirmado en el teléfono Android afectado: portrait y landscape corto utilizables, sin clipping permanente y con submit alcanzable por scroll. |
| BLOCKER DE CERTIFICACIÓN FÍSICA | Cold relaunch Android | `id`, `start_url`, scope, guards y worker eran coherentes. El acoplamiento OS específico restante era `orientation: landscape`, una petición opcional aplicada al ciclo de la app instalada y redundante con `LandscapeGate`. | Se omitió `orientation` para permitir que Android abra en la orientación actual; login responde por sí mismo y las rutas protegidas conservan `LandscapeGate`. `id` y `start_url` no cambiaron. | Resuelto por evidencia física: instalación, launch desde icono, dos cold relaunch y restore autenticado PASS. |
| SHOULD FIX BEFORE PRODUCTION | Higiene | `tsc` producía `tsconfig.tsbuildinfo` no rastreado. | Artefacto retirado y patrón añadido al `.gitignore` raíz. | Corregido. |
| ACCEPTABLE / DOCUMENTED RISK | CSP | Un CSP estricto no fue diseñado ni probado contra scripts Next.js, Auth HTTPS y Realtime WebSocket. | Solo se aplica `frame-ancestors 'none'`; una CSP completa queda para hardening específico posterior, con pruebas reales. | Riesgo aceptado; no bloquea este smoke. |
| DEPLOYMENT-ONLY PREREQUISITE | CORS/dominio | El frontend necesitaba dominio canónico y contrato CORS exacto antes de certificar. | Se desplegó `https://kuchis-logistics.vercel.app`; backend Production quedó finalizado para ese origen exacto, con HTTPS activo. | Completado y verificado en Production. |
| ACCEPTABLE / DOCUMENTED RISK | Versiones | Hay versiones más nuevas no críticas de Supabase, React, tipos, ESLint y TypeScript. | Se evitó churn y upgrades mayores sin vulnerabilidad o bloqueo concreto. | Aceptado; `npm audit` está limpio. |
| NO ISSUE | Seguridad de mutaciones | No hay retry genérico, retry offline ni conversión de Realtime en autoridad; locks y reconciliaciones certificadas siguen presentes. | Sin cambios. | Verificado por código y suites. |
| NO ISSUE | Secretos | No se hallaron secretos, credenciales, tokens ni `.env.local` rastreados; el navegador solo usa contrato público. | Se reforzó `.env.example` sin valores reales. | Verificado. |
| NO ISSUE | Realtime / UX | Canales privados, validación, coalescing, cleanup, accesibilidad compartida y responsive certificado no mostraron defectos concretos. | Sin rediseño ni reimplementación. | Verificado. |

## Configuración de Production

Contrato público único:

- `NEXT_PUBLIC_LOGISTICS_API_URL`: origen HTTPS sin ruta/query/fragmento; en
  Production debe ser `https://kuchis-logistic-api.vercel.app`.
- `NEXT_PUBLIC_SUPABASE_URL`: origen HTTPS público del proyecto Supabase.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: clave publishable pública.

La aplicación falla de forma visible y segura cuando falta un valor o una URL
no es válida. HTTP solo se admite para `localhost`, `127.0.0.1` o `::1`, de modo
que un `next start` local controlado sigue siendo posible. El backend canónico no
se hardcodeó: el deployment continúa siendo configurable. Ningún código exige
`SUPABASE_SECRET_KEY` ni una clave service-role.

El frontend está desplegado en el dominio canónico
`https://kuchis-logistics.vercel.app`, con configuración Production y HTTPS
activos. El backend CORS ya está finalizado para ese origen exacto. Esta tarea de
cierre únicamente registra la evidencia aportada y no modificó CORS ni Vercel.

## API y seguridad de red

- El origen validado se concatena únicamente con rutas absolutas internas que
  empiezan por un solo `/`; no se aceptan rutas protocol-relative.
- El bearer existente solo se adjunta cuando el consumidor entrega un access
  token; login continúa sin bearer.
- Todas las solicitudes usan `Accept: application/json`; los cuerpos definidos
  usan JSON y su `Content-Type` correspondiente.
- Errores no JSON se convierten en el fallback seguro; JSON malformado no rompe
  el parser. Una respuesta exitosa sin JSON ya no se trata como un `T` válido.
- 400/401/403/404/409/429/5xx conservan su clasificación determinista.
- Todas las lecturas y escrituras declaran `cache: "no-store"`. No se introdujo
  timeout ni `AbortController`, evitando crear nueva ambigüedad de escrituras.
- No existe retry automático en el cliente. Los resultados ambiguos permanecen
  bajo los flujos de refetch/reconciliación autoritativa de cada feature.

## Auth y sesión

- Cold load sin sesión termina en login; una sesión válida restaura `/auth/me`.
- Un fallo transitorio de red durante restauración muestra recuperación manual y
  preserva la sesión Supabase local, en lugar de presentarla como inválida.
- 401 y el código backend `ACCOUNT_INACTIVE` cierran la sesión de forma uniforme.
  Un 403 normal de capacidad no se confunde con identidad inválida.
- Logout, refresh token administrado por Supabase, entrada directa protegida y
  redirección posterior a pérdida real de sesión mantienen el patrón existente.
- No se creó almacén secundario, persistencia de contraseña ni copia manual de
  refresh/access tokens.
- Realtime conserva su teardown/remount asociado al contexto autenticado.

## Seguridad frontend

Cabeceras configuradas para todas las rutas:

- `Content-Security-Policy: frame-ancestors 'none'`
- `Permissions-Policy: camera=(), geolocation=(), microphone=()`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`

`X-Powered-By` queda deshabilitado. Para `sw.js` se añade
`Cache-Control: no-cache, no-store, must-revalidate` y
`Service-Worker-Allowed: /`. La entrega efectiva de manifest y service worker
quedó confirmada también en Production.

No se encontró `dangerouslySetInnerHTML`, URL `javascript:`, logging de
credenciales/payloads, redirect externo inseguro, iframe, secreto en assets ni
enlace externo relevante sin protección. No se añadió CSP estricta especulativa.

## PWA

- Manifest válido: nombre KUCHI'S, `id` y `start_url: /home`, scope `/` y
  standalone. Se omite la orientación OS para mejorar compatibilidad de cold
  launch; `/home` permanece detrás del guard Auth.
- Iconos intencionales y accesibles; el mayor PNG pesa menos de 40 KiB.
- Registro solo en build Production, scope raíz y `updateViaCache: none`.
- Worker network-only limitado a navegación/recursos GET same-origin no API.
- Sin Cache Storage para API/Auth/estado operativo, Background Sync, cola de
  writes, `skipWaiting` ni `clients.claim`.
- El aviso offline no afirma autoridad. Al recuperar red, los hooks Realtime
  existentes solicitan refetch REST autoritativo.
- La omisión de `orientation` es deliberada: según la especificación es opcional
  y puede establecer la orientación por defecto durante la vida de la app
  instalada. La restricción efectiva de la UI operativa sigue en
  `LandscapeGate`, no en el WebAPK.

## Realtime

La inspección de integración confirmó canales privados, token de sesión, eventos
versionados/validados, scoping por topic, payload como señal y no como estado,
coalescing, cleanup, recuperación por reconnect/online/visibility y ausencia de
polling. No se detectó interferencia con locks/mutaciones ni un leak obvio de
canales/listeners. No se modificó la implementación certificada.

## Accesibilidad

El pase dirigido por componentes compartidos confirmó labels, nombres de botón,
mensajes live/status, semántica y foco de diálogos, Escape/focus return,
interacción teclado/touch del Select, foco visible, estados disabled/read-only,
target sizes y reduced motion. Los estados críticos conservan texto/etiquetas,
no solo color. Los nuevos fallbacks tienen heading, mensaje y botón nombrado.
No apareció un defecto compartido que justificara cambios adicionales.

## Responsive

Se preservaron shell desktop/tablet, shell compacto landscape-phone,
`LandscapeGate`, safe areas, geometría de mesas, layout de Comandar, scroll
interno de diálogos, acciones alcanzables y portal/`visualViewport` del Select.
No se introdujo overflow horizontal global ni cambio visual de diseño. El login
usa altura dinámica (`100dvh`), scroll vertical propio y una variante compacta
para landscape táctil de hasta 520 px de altura: reduce espacios, oculta copy no
esencial, mantiene la identidad KUCHI'S y prioriza inputs/error/submit. Portrait
phone mantiene su variante de una columna; desktop y tablet conservan su diseño.

## Performance

- Build optimizado PASS con Next.js 16.3.4.
- No hay asset local accidental grande; los iconos PWA están entre menos de 1
  KiB y menos de 40 KiB.
- No se añadió dependencia para la lógica nueva.
- No hay polling. El único intervalo relevante sigue siendo el reloj local de
  Preparación cada minuto y no genera tráfico.
- Las suscripciones no dependen de cada render y conservan cleanup/coalescing.
- `next/font` usa las fuentes declaradas; el build local requirió acceso de red
  a Google Fonts, requisito que el entorno de build debe permitir.

## Dependencias / npm audit

Estado inicial:

- `npm audit --omit=dev`: dos avisos críticos sobre `next@16.3.2`.
- Los avisos oficiales declaran parche desde Next.js 16.3.3.

Resolución mínima:

- `next`: 16.3.2 → 16.3.4.
- `eslint-config-next`: 16.3.2 → 16.3.4 para mantener alineación.
- React, React DOM, Supabase, TypeScript y el resto permanecieron sin upgrade.

Estado final:

- `npm audit --omit=dev`: PASS, 0 vulnerabilidades.
- `npm audit`: PASS, 0 vulnerabilidades.
- `npm outdated --json`: reportó versiones más recientes de Supabase, tipos,
  React, ESLint y TypeScript; no se actualizaron al no existir justificación de
  vulnerabilidad ni blocker.

## Higiene de repositorio y secretos

- `.env.local`, otros `.env` reales, `.next` y `tsconfig.tsbuildinfo` no están
  rastreados ni presentes en el diff.
- `tsconfig.tsbuildinfo` generado durante validación fue retirado y el patrón
  quedó cubierto por el `.gitignore` raíz.
- No se encontraron screenshots/dumps temporales, certificados, claves privadas,
  password de smoke, service-role, access token o refresh token en archivos
  rastreados o públicos.
- Los PNG/SVG del PWA y `sw.js` son assets intencionales.
- Este reporte y la entrega final no reproducen valores de variables locales.

## Archivos cambiados

- Configuración/dependencias: `.gitignore` raíz, `.env.example`,
  `next.config.ts`, `package.json`, `package-lock.json`.
- Readiness/API: `src/lib/config/public-config.ts`,
  `src/lib/api/api-error.ts`, `src/lib/api/client.ts`,
  `src/lib/supabase/client.ts`, `src/lib/readiness/**`.
- Auth/recuperación: `src/features/auth/auth-context.tsx`,
  `auth-guards.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`.
- Invalidación de sesión uniforme: vistas de Mesas, Comandar, Preparación,
  Estado de mesas, Checkout, Carta, Gastos, Turnos, Historial y Usuarios.
- PWA/móvil: `src/app/globals.css`, `src/features/pwa/pwa-model.ts` y
  `src/features/pwa/pwa-model.test.ts`; el worker network-only no cambió en este
  ajuste final.
- Runner: `package.json` añade el agregado `npm test` sobre las 16 suites
  existentes, sin modificar dependencias.
- Documentación de cierre: este reporte y `docs/agent-context/project-status.md`.

## Validación automatizada

Matriz estable completa:

| Comando | Resultado |
|---|---:|
| `npm run test:tables` | PASS — 5/5 |
| `npm run test:ordering` | PASS — 35/35 |
| `npm run test:preparation` | PASS — 34/34 |
| `npm run test:table-operations` | PASS — 20/20 |
| `npm run test:checkout` | PASS — 25/25 |
| `npm run test:catalog-availability` | PASS — 10/10 |
| `npm run test:navigation` | PASS — 6/6 |
| `npm run test:shifts` | PASS — 8/8 |
| `npm run test:expenses` | PASS — 13/13 |
| `npm run test:closeout` | PASS — 16/16 |
| `npm run test:history` | PASS — 7/7 |
| `npm run test:users` | PASS — 12/12 |
| `npm run test:select` | PASS — 4/4 |
| `npm run test:realtime` | PASS — 5/5 |
| `npm run test:pwa` | PASS — 4/4 |
| `npm run test:readiness` | PASS — 5/5 |

Total de la matriz: **209/209 casos PASS**, ejecutados mediante `npm test`.

Gates:

- `npm run lint`: PASS, 0 errores y 0 warnings.
- `npm run typecheck`: PASS, 0 errores.
- `npm run build`: PASS con Next.js 16.3.4; 16/16 páginas estáticas
  generadas. El sandbox sin red falló inicialmente al resolver Google Fonts;
  con acceso de build normal compiló correctamente.
- `npm audit`: PASS, 0 vulnerabilidades.
- Tras desactivar `X-Powered-By`, se repitieron `test:readiness` (5/5), lint,
  typecheck y build: todos PASS.
- `npm run start -- --hostname 127.0.0.1 --port 3214`: PASS breve. `/login`,
  `/manifest.webmanifest` y `/sw.js` respondieron 200; cabeceras presentes,
  worker `no-store` y `X-Powered-By` ausente.
- Verificación visual local de `/login`: a 780×360 no hubo overflow horizontal;
  el contenedor midió 360 px visibles sobre 514 px de contenido y permitió
  desplazar el submit hasta dejarlo visible. A 390×844 tampoco hubo overflow
  horizontal y el submit quedó visible. El navegador local no emuló
  `pointer: coarse`; esa media query y el teclado real quedan para el teléfono.
- `git diff --check`: PASS en el cierre documental final.

## Checklist de deploy y Production

- [x] Dominio canónico Production del frontend Logistics activo.
- [x] Configuración Production del frontend definida.
- [x] Ausencia de claves Supabase secret/service-role en el contrato frontend.
- [x] API canónica confirmada: `https://kuchis-logistic-api.vercel.app`.
- [x] Backend CORS finalizado para el origen exacto del frontend.
- [x] HTTPS activo.
- [x] Manifest y service worker alcanzables en Production.
- [x] `/manifest.webmanifest` sin restricción `orientation: landscape`.
- [x] Auth/login y restauración de sesión reales contra Production.
- [x] Suscripciones privadas Realtime confirmadas.
- [x] Instalación y relaunch PWA confirmados en Android físico.
- [x] GET operativos principales y mutaciones representativas confirmados.
- [x] Cleanup del smoke y estado operativo final completados.
- [x] Frontend sin errores runtime relevantes durante la validación final.

## Evidencia humana Production

El candidato Production anterior al presente cambio local pasó login, restore,
logout, redirect protegido, Mesas, apertura de turno, Realtime entre dos sesiones,
creación de comanda, transiciones de Preparación hasta Delivered, Checkout/pago
único, liberación automática, disponibilidad de Carta y restauración reflejada en
el cliente público, gasto y anulación, cierre, cuadre, Usuarios e Historial.
Desktop PWA y tablet Android instalada —incluidos cierre/relaunch, login y
operación— también pasaron.

En el teléfono Android físico afectado, el deployment Production final confirmó:

1. `/manifest.webmanifest` no fuerza `orientation: landscape`.
2. Login usable tanto en portrait como en landscape corto, sin clipping
   permanente y con scroll vertical capaz de alcanzar el submit.
3. Instalación PWA y launch directo desde el icono KUCHI'S: PASS.
4. Cierre completo y cold relaunch desde el icono, repetido dos veces: PASS.
5. Login autenticado: PASS.
6. Cierre completo, relaunch y restauración de la sesión autenticada: PASS.
7. `LandscapeGate` visible correctamente en la UI protegida con el teléfono en
   portrait; al volver a landscape se restauró la UI operativa normal.
8. Sin errores runtime relevantes del frontend durante la validación final.

Desktop y tablet conservaron el PASS del smoke previo. Los flujos operativos del
backend/API ya habían pasado el smoke Production amplio y el cleanup con estado
operativo final fue completado. La incidencia de relaunch Android anterior se
considera resuelta por evidencia física posterior a retirar la restricción de
orientación del manifest.

## Riesgos residuales

- La CSP completa se difiere; la protección anti-frame ya está aplicada sin
  arriesgar Next.js, Auth ni WebSocket de Realtime.
- La PWA sigue siendo deliberadamente network-only: no ofrece operación offline.
- Paquetes con versiones más nuevas pero sin vulnerabilidades permanecen fijados
  para evitar regresiones antes del smoke.
- El mecanismo interno exacto del WebAPK/OEM no es observable desde la aplicación,
  pero la incidencia operativa queda cerrada por dos cold relaunch físicos PASS
  tras retirar la restricción de orientación.

**Frontend Objetivo 14 — PASS CERTIFICADO.**
