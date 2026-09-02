# Reporte — Frontend Logistics Objetivo 1

## Resultado

La foundation de `apps/logistics` quedó implementada y validada técnicamente. El frontend compila, las rutas públicas/privadas están separadas, Auth usa la sesión persistida por Supabase y revalida al usuario mediante `/auth/me`, el Home se deriva exclusivamente de capabilities y la pantalla Mesas conserva la composición espacial del boceto. La revisión UX final añadió una composición operacional compacta específica para teléfonos en landscape sin alterar tablet/escritorio.

**Estado de certificación final: PASS.** La regresión técnica, el build Webpack, la auditoría de dependencias, los controles de secretos y el smoke Auth real contra Production pasaron. La evidencia de Auth real corresponde a un smoke manual humano: login, Home, usuario/capabilities, persistencia tras F5, restauración, `/auth/me`, navegación a Mesas, popover, logout y guard sin sesión se verificaron sin errores funcionales. Las credenciales se suministraron únicamente como variables temporales locales y no se registraron en código, Git ni este reporte.

## 1. Rama y punto de partida

- Rama: `feat/logistics-frontend-foundation`
- HEAD inicial: `68395bd84d3d906d767b47a318d8549275d5506c`
- Working tree inicial: limpio
- No se creó ni cambió de rama.

## 2. Scope implementado

- Aplicación independiente Next.js en `apps/logistics`.
- Design System operacional inicial.
- API client central con errores normalizados.
- Supabase Auth browser client.
- Login contra `POST /api/logistics/auth/login`.
- Persistencia/restauración de sesión con Supabase.
- Revalidación de identidad con `GET /api/logistics/auth/me`.
- Logout mediante `supabase.auth.signOut()`.
- Guards de sesión y capability.
- Home basado en capabilities reales del backend.
- Landscape gate para teléfono vertical.
- Mesas visual base con tabs Salón/Llevar.
- Placeholders mínimos para módulos posteriores.

No se implementó lógica operacional de mesas, Realtime, PWA ni módulos futuros.

## 3. Stack

- Next.js `16.3.2`
- React / React DOM `19.2.8`
- TypeScript `5.9.3`
- Tailwind CSS / PostCSS `4.3.3`
- ESLint `9.39.5`
- `@supabase/supabase-js` `2.112.3`, igual a la versión resuelta por el backend
- Node.js `24.18.0` utilizado para validación

Las versiones se fijaron en `package.json` y quedaron registradas en `package-lock.json`.

## 4. Archivos creados

### Configuración

- `apps/logistics/.env.example`
- `apps/logistics/package.json`
- `apps/logistics/package-lock.json`
- `apps/logistics/next.config.ts`
- `apps/logistics/next-env.d.ts`
- `apps/logistics/postcss.config.mjs`
- `apps/logistics/eslint.config.mjs`
- `apps/logistics/tsconfig.json`

### App Router

- `src/app/layout.tsx`, `page.tsx`, `globals.css`, `not-found.tsx`
- `src/app/login/page.tsx`
- Route group privado `(protected)` con Home, Mesas y placeholders de Estado de mesas, Pedidos, Carta, Apertura/Cierre de turno, Cuadre, Historial y Usuarios

### Componentes y features

- Layout: `AppShell`, `Brand`, `LandscapeGate`, `PageShell`
- UI: `Button`, `Input`, `Surface`, `LoadingState`, `ErrorState`, `Tabs`, `StatusBadge`, `Icon`
- Auth: `AuthProvider`, hooks y guards
- Home: configuración central de acciones y `ActionTile`
- Mesas: vista Salón/Llevar y service points visuales
- Módulos futuros: placeholder reutilizable

### Librerías y tipos

- `src/lib/api/client.ts`
- `src/lib/permissions/capabilities.ts`
- `src/lib/supabase/client.ts`
- `src/types/auth.ts`

Se retiró `apps/logistics/.gitkeep` porque el directorio ya contiene la aplicación.

## 5. Arquitectura

El root layout mantiene metadata, fuentes y el `AuthProvider`. Las rutas privadas viven en un route group que no altera las URLs y aplica, en este orden:

1. `AuthenticatedGuard`.
2. `LandscapeGate`.
3. `AppShell` con identidad, usuario y logout.
4. Guard específico de capability cuando el módulo lo requiere.

Las páginas permanecen pequeñas; la lógica interactiva está en features/client components y la configuración permanece fuera del árbol de rutas.

## 6. Variables de entorno

Contrato creado, únicamente con placeholders:

```env
NEXT_PUBLIC_LOGISTICS_API_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

No se usa ni expone `SUPABASE_SECRET_KEY`, service role, JWT, refresh tokens ni passwords. La base API se lee una sola vez desde `NEXT_PUBLIC_LOGISTICS_API_URL`; no quedó repetida ni hardcodeada en los consumidores.

## 7. API client y errores

`apiRequest` centraliza:

- base URL normalizada;
- JSON request/response;
- Bearer token cuando corresponde;
- errores 400, 401, 403, 404, 409, 429, 5xx, red, configuración e inesperados;
- respuestas sin JSON o JSON inválido de forma segura.

No existen retries automáticos de writes.

## 8. Auth y ciclo de sesión Supabase

### Login

1. El formulario envía username/password al backend Logistics.
2. El backend devuelve usuario y sesión pública.
3. El frontend entrega `access_token` y `refresh_token` a `supabase.auth.setSession()`.
4. Supabase persiste y renueva la sesión; no existe almacenamiento manual de tokens.
5. El access token vigente se usa para `/auth/me`.
6. Solo después de `/auth/me` el contexto queda autenticado.

### Restauración

1. `supabase.auth.getSession()` recupera la sesión persistida en browser.
2. Si hay access token, `/auth/me` vuelve a construir el usuario y capabilities.
3. `TOKEN_REFRESHED` provoca una nueva revalidación.
4. Un 401/403 limpia Supabase y el estado frontend.

### Logout

`supabase.auth.signOut()` limpia la sesión administrada por Supabase; el contexto se limpia incluso si el cierre remoto falla y el guard devuelve al Login.

No se registran tokens, no se colocan en URLs y no hay loops de refresh/retry.

## 9. Capabilities y guards

El union `Capability` replica exactamente las 19 capabilities declaradas por el backend. `can`, `canAny` y `canAll` concentran la evaluación; ninguna opción del Home depende del nombre del role.

Reglas relevantes:

- Mesas: `tables.view` o `tables.operate`.
- Estado de mesas: `tables.operate`.
- Pedidos: cualquier permiso kitchen/drinks view/manage.
- Carta, turnos, caja, historial y usuarios: capability específica.
- Cada URL privada repite su guard, por lo que ocultar el tile no es la única protección frontend.

El backend continúa siendo la autoridad final.

## 10. Home

Mantiene el título central `¿Qué haremos?`, opciones directas en una matriz de dos columnas y Usuarios separado como acción administrativa. Un usuario Cocina con las capabilities reales del backend recibe únicamente `Mesas` y `Pedidos`; ADMIN/MANAGER reciben el conjunto completo.

## 11. Design System e identidad KUCHI'S

Se inspeccionó `apps/client` antes de diseñar. Se reutilizaron:

- fondo crema `#faf7f1`;
- naranja primario `#f66b0e` y hover `#df5700`;
- acento rojo `#d94232`;
- superficies blancas y crema suave;
- bordes cálidos, sombras discretas y radios amplios;
- Fredoka para display y Nunito Sans para cuerpo;
- marca `K`, focus naranja, botones táctiles y lenguaje de cards.

La app Logistics elimina el tema oscuro y decoraciones comerciales innecesarias para mantener velocidad y claridad operacional.

## 12. Diferencias justificadas respecto al boceto

- Login: conserva composición centrada y campos grandes, pero se divide en bienvenida de marca + card para mejorar jerarquía en landscape.
- Home: mantiene título y acciones centrales; se añadió un header global con identidad, usuario y logout para navegación consistente.
- Mesas: se añadió un encabezado de contexto, superficie de plano y leyenda de estados; la ubicación relativa del mobiliario no cambió.
- En tamaños pequeños el plano permite scroll interno horizontal/vertical sin deformar la distribución.

## 13. Landscape gate

Se activa únicamente con media query de orientación vertical + puntero coarse + ancho máximo de teléfono. No intenta forzar orientación y no bloquea desktop/tablet por una ventana estrecha. El cambio de orientación se observa en vivo con `matchMedia`.

## 14. Mesas visual base

### Salón

- Fila superior: 6, 5, 4, 3, 2, 1.
- Mesa 7 aislada debajo de Mesa 6.
- Barra inferior/central: B4, B3, B2, B1.
- Mesas rectangulares y barra circular, según el wireframe.

### Llevar

LL1–LL7 se presentan como tarjetas verticales en una línea horizontal equilibrada. La superficie mantiene el orden y permite scroll interno cuando el ancho físico no alcanza.

Los service points usan estado neutral `Sin sincronizar`; no simulan datos productivos. El `StatusBadge` ya soporta Libre, Abierta y Pendiente de pago para Objetivo 2.

## 15. Accesibilidad, UX y performance

- Labels reales, autocomplete correcto y password oculto por defecto.
- Focus visible, botones semánticos y targets de 44–56 px.
- `role`, `aria-live`, `aria-selected`, `aria-invalid` y mensajes de error donde corresponde.
- Preferencia `prefers-reduced-motion` respetada.
- Sin librerías UI, state managers, Realtime ni animaciones pesadas.
- Componentes client acotados a interacción, sesión y browser APIs.

## 16. Validación técnica

- `npm install`: PASS; 367 paquetes instalados, 0 vulnerabilidades reportadas.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS con Next.js 16.3.2 / Webpack; 14 páginas estáticas generadas.

El script de build usa Webpack porque Turbopack intentó abrir un puerto interno durante PostCSS y el sandbox lo bloqueó. Webpack es un bundler soportado por Next.js y el cambio deja `npm run build` reproducible en este entorno.

La revisión final fijó `experimental.useTypeScriptCli: false`: el checker CLI de Next 16.3.2 no pudo parsear su propia captura de `tsc --showConfig` en este host, aunque `tsc --showConfig` y `npm run typecheck` devolvieron salida válida. El fallback documentado usa la Compiler API de TypeScript 5 durante `next build`; las mismas reglas estrictas permanecen activas y el build generó nuevamente las 14 páginas.

## 17. Validación funcional y visual

Se usó Chrome headless contra un servidor local efímero sin secretos ni datos reales.

- Login renderizado a 1440×900: PASS.
- Home ADMIN con 9 acciones: PASS.
- Home KITCHEN únicamente con Mesas/Pedidos: PASS.
- Salón a 1024×768: orden `6,5,4,3,2,1,7,B4,B3,B2,B1`, PASS.
- Llevar a 1024×768: orden `LL1–LL7`, PASS.
- Teléfono landscape 844×390: interfaz visible y operable, PASS.
- Teléfono portrait 390×844: rotation gate visible, PASS.
- Error overlay: ausente.
- Excepciones/errores de consola de aplicación: ninguno.
- Overflow global en tablet: ausente.

La restauración y `/auth/me` se verificaron primero con sesión Supabase-compatible y endpoint local efímero. Posteriormente, el smoke manual humano real contra Production confirmó login, persistencia/restauración tras F5, `/auth/me`, navegación autenticada y logout. Esta evidencia manual no se presenta como prueba automatizada de Codex.

## 18. Revisión UX mobile landscape

### Criterio de activación

La composición compacta se activa únicamente con la combinación:

```css
@media (orientation: landscape) and (pointer: coarse) and (max-height: 520px)
```

No se decide por ancho aislado. Una tablet táctil de 1024×768 conserva el shell estándar y una ventana desktop baja con puntero preciso tampoco recibe estilos de teléfono.

### Shell operacional compacto

- Header único de 58 px con marca `K`, título contextual, controles del módulo y avatar inicial.
- Los títulos se resuelven centralmente desde la ruta en `AppShell`.
- `CompactToolbarControls` crea un carril reutilizable para que próximos módulos aporten controles contextuales sin acoplarlos al shell.
- Desktop/tablet conservan el header completo, nombre, role y botón de logout originales.

### Usuario compacto

El avatar de 44×44 abre un popover accesible con nombre completo, role y `Cerrar sesión`. El trigger expone `aria-haspopup`, `aria-expanded` y `aria-controls`; el menú recibe foco al abrir, cierra con Escape devolviendo el foco, cierra con interacción exterior y mantiene el mismo `logout()` de Auth. No se duplicó lógica de sesión.

### Home y Mesas

- Home oculta únicamente su heading redundante en compact; conserva tiles grandes, dos columnas y scroll vertical natural.
- Mesas integra Salón/Llevar en el toolbar y oculta eyebrow, título interno, descripción y metadata redundante del plano.
- El plano usa todo el alto operativo restante y conserva targets, números y geometría legibles.
- Salón mantiene exactamente `6,5,4,3,2,1` y debajo `7,B4,B3,B2,B1`.
- Llevar mantiene `LL1–LL7` en tarjetas verticales.
- A 844×390 el plano cabe sin overflow global. A 667×375 se mantiene el ancho operacional de 780 px y el scroll horizontal queda localizado dentro de `.floor-scroll`; el documento permanece en 667 px.
- La leyenda compacta mantiene punto de color + texto y abrevia únicamente `Pendiente de pago` como `Pend. pago`; se retira el rótulo redundante `Estados preparados`.
- Portrait conserva el `LandscapeGate` y no renderiza el shell operacional detrás.

### Validación final de la revisión

Se usó un entorno local aislado con sesión visual efímera y sin secretos. El bypass de prueba se retiró antes de las validaciones técnicas finales.

- 1440×900, puntero preciso: shell estándar, plano completo y etiqueta `Pendiente de pago`, PASS.
- 1024×768, puntero coarse: shell estándar y plano sin overflow global, PASS.
- 844×390, puntero coarse: shell compacto, Salón completo, Llevar `LL1–LL7`, Home en dos columnas, PASS.
- 667×375, puntero coarse: shell compacto y scroll horizontal únicamente dentro del plano (`655 px` visibles / `780 px` de contenido), PASS.
- 390×844, puntero coarse: `LandscapeGate` visible; headers y plano no renderizados, PASS.
- Popover: apertura, foco inicial en logout, identidad/role, Escape con retorno de foco y clic exterior, PASS.
- Logout desde el popover: navegación a `/login` y formulario visible, PASS.
- Excepciones de runtime durante la batería: ninguna.

### Límites deliberados

No se modificaron Auth, capabilities, guards, contrato de API, persistencia Supabase, módulos operacionales, Realtime, PWA ni backend. El breakpoint compacto y el carril de controles son foundation de presentación; no anticipan lógica de Objetivo 2.

## 19. Riesgos y pendientes

- Configurar las tres variables públicas en cada entorno.
- Retirar manualmente de CORS de Production la autorización temporal para `http://localhost:3000` usada por el smoke y confirmar que el dominio final de Logistics esté permitido antes del deploy.
- Ejecutar un smoke test con una cuenta real de cada role antes de deploy.
- Los guards frontend mejoran UX, pero no sustituyen autorización backend.
- Los estados de mesa permanecen neutrales hasta integrar endpoints en Objetivo 2.

## 20. Explícitamente no implementado

- Apertura/cierre/liberación/transferencia de mesas.
- Service sessions, comandas, cancelaciones, checkout y pagos.
- Cocina/Bebidas funcionales.
- Turnos, caja, historial, carta o usuarios funcionales.
- Realtime y SQL relacionado.
- PWA, manifest, service worker, instalación o deploy.
- Cambios en backend, base de datos, Supabase remoto, Vercel, `apps/client` o `packages/shared`.

## Cierre final del Objetivo 1

### Identificación y scope

- Fecha de cierre: 2026-09-02.
- Rama: `feat/logistics-frontend-foundation`.
- HEAD inicial y final de la revisión: `68395bd84d3d906d767b47a318d8549275d5506c`.
- Cambios revisados: únicamente `apps/logistics`, este reporte y la eliminación esperada de `apps/logistics/.gitkeep`.
- Sin cambios en `apps/api`, `apps/client`, `packages/shared`, `supabase/`, SQL, migrations, RPC, RLS, Vercel remoto o Supabase remoto.

### Auth real y Production

- Backend Production consultado: `https://kuchis-logistic-api.vercel.app`, exclusivamente mediante el contrato existente durante el smoke manual real y la prueba inválida controlada previa; no se hardcodeó en componentes.
- `NEXT_PUBLIC_LOGISTICS_API_URL`: configurada localmente.
- `NEXT_PUBLIC_SUPABASE_URL`: configurada localmente.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: configurada localmente.
- `apps/logistics/.env.local`: presente e ignorado por Git mediante el patrón `.env.*`; `.env.example` queda expresamente permitido.
- Credenciales reales: suministradas únicamente como variables temporales locales, sin imprimirlas ni persistirlas en código o reporte.
- Login válido real: PASS.
- `supabase.auth.setSession()` con los tokens reales devueltos por el contrato: PASS.
- `GET /api/logistics/auth/me` real autenticado: PASS.
- Usuario y capabilities reales renderizados en Home: PASS.
- Persistencia de sesión tras refresh/F5: PASS.
- Restauración de sesión real: PASS.
- Navegación autenticada a Mesas: PASS.
- Avatar/popover con nombre y rol: PASS.
- Logout contra Supabase real y retorno a `/login`: PASS.
- Guard sin sesión: PASS; tras logout, abrir manualmente `/home` terminó en `/login` sin mostrar contenido privado.
- Refresh automático forzado: no ejecutado y no observado naturalmente durante el smoke. No es blocker según el criterio acordado; el SDK conserva `autoRefreshToken`, la restauración usa `getSession()` y `TOKEN_REFRESHED` está manejado para revalidar `/auth/me`.
- No se ejecutó una matriz manual adicional con múltiples roles o capabilities; el usuario real del smoke expuso correctamente sus capabilities y las opciones derivadas.

Para habilitar el smoke desde localhost se autorizó temporalmente `http://localhost:3000` en CORS de Production. El preflight devolvió HTTP `204` con `Access-Control-Allow-Origin: http://localhost:3000`. Esta autorización será retirada manualmente después de la certificación; no se modificó CORS desde esta ejecución de cierre.

La revisión de Supabase confirmó que `setSession()` sigue siendo la API oficial para establecer access/refresh tokens, `getSession()` restaura y refresca cuando corresponde, y `onAuthStateChange()` expone `TOKEN_REFRESHED` y `SIGNED_OUT`. Los breaking changes vigentes revisados no afectan este flujo de Auth alojado.

### Login inválido real

Se realizó una única petición con identidad y password aleatorios efímeros contra el endpoint de login de Production. Resultado:

- HTTP `401`.
- JSON con estructura pública `error.code` / `error.message`.
- Mensaje genérico, sin enumeración del username enviado.
- Sin stack trace, password, access token ni refresh token.
- No se intentó provocar rate limiting.

La prueba inválida previa permanece como evidencia del contrato de error. El smoke manual final se concentró en el recorrido válido real y no repitió este caso dentro del formulario; esto no bloquea el cierre.

### Revisión de seguridad y arquitectura

- No hay secrets, passwords, JWT, refresh tokens, service role ni `SUPABASE_SECRET_KEY` hardcodeados o impresos.
- No existe acceso directo desde el frontend a tablas operativas de Supabase.
- No hay retries automáticos de writes.
- Home y rutas siguen evaluando `capabilities`; el role sólo se usa como etiqueta visual.
- Los guards frontend no sustituyen la autorización del backend, que continúa siendo la autoridad final.
- El callback de `onAuthStateChange` permanece síncrono y difiere la revalidación de `TOKEN_REFRESHED` con `setTimeout`, conforme al patrón seguro del SDK.

### Veredicto de configuración de build

**Webpack: mantener.** El build estándar de Next 16.3.2 se probó de forma controlada. Dentro del sandbox falló primero al descargar Google Fonts; con red permitida avanzó y reprodujo el panic de Turbopack/PostCSS al intentar crear un proceso y enlazar un puerto (`Operation not permitted`). `next build --webpack` compiló correctamente y no cambia el runtime de Production. El override es un workaround del entorno de construcción actual, soportado y razonable.

**`experimental.useTypeScriptCli: false`: mantener.** Se retiró temporalmente y `next build --webpack` volvió a fallar antes de compilar con `Could not parse output from TypeScript's --showConfig`. La configuración se restauró. De forma independiente, `npx tsc --showConfig` produjo JSON válido con `strict: true`, `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes` y el resto de subchecks estrictos; `npm run typecheck` pasó. El fallback usa la Compiler API de TypeScript 5 y no degrada el tipado.

### Regresión técnica

- `npx tsc --showConfig`: PASS; configuración estricta confirmada.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS con Webpack y acceso de red para obtener las fuentes; 14 páginas estáticas generadas.
- `npm audit`: PASS; 0 vulnerabilidades.

### Regresión visual y runtime

La matriz visual obligatoria anterior corresponde a la misma implementación de UI y no se modificó ningún componente visual durante esta certificación:

- 1440×900: Standard Operational Shell, PASS previo vigente.
- 1024×768: Standard Operational Shell, PASS previo vigente.
- 844×390: Compact Operational Shell, Mesas/B1–B4/LL1–LL7 y popover, PASS previo vigente.
- 667×375: Compact Operational Shell con scroll localizado y sin overflow global, PASS previo vigente.
- 390×844: `LandscapeGate`, PASS previo vigente.

Adicionalmente, el artefacto productivo se abrió previamente a 1440×900 sin variables: Login, labels, formulario, mensaje seguro de configuración y ausencia de overflow global, PASS. La ruta privada redirigió a Login y la consola del navegador registró 0 errores/warnings de aplicación.

El smoke manual humano real posterior confirmó login, Home, identidad/capabilities, persistencia y restauración tras F5, `/auth/me`, navegación a Mesas, popover, logout y redirección de `/home` a `/login` después de cerrar sesión: PASS. No se observaron errores funcionales. Esta evidencia se registra como `MANUAL REAL PRODUCTION SMOKE`, no como automatización de Codex.

### Git, secretos y riesgos residuales

- `git diff --check`: PASS.
- La implementación continúa sin commit, como se esperaba; `git status --short` es el inventario autoritativo porque la mayoría de archivos son untracked.
- `.env.local` existe para el smoke, está ignorado por Git y no aparece en `git status`.
- No se ejecutó `git add`, commit, push, merge, cambio de rama ni deploy.
- No quedan riesgos bloqueantes para el Objetivo 1.
- Pendiente operacional no bloqueante: retirar manualmente el origen temporal `http://localhost:3000` de CORS de Production después de esta certificación.
- Refresh automático forzado no se ejecutó ni ocurrió naturalmente durante el smoke; la persistencia/restauración reales sí pasaron y el SDK mantiene `autoRefreshToken` y el manejo de `TOKEN_REFRESHED`.

### Conclusión

**FRONTEND OBJETIVO 1 — PASS.**

**FOUNDATION + AUTH + HOME + DESIGN SYSTEM — CERTIFICADO.**

La implementación técnica, el control de secretos y el smoke manual humano Auth real contra Production pasaron sin bugs nuevos. El objetivo queda listo para revisión humana final, commit, push, PR y merge. Esta certificación no inicia el Objetivo 2.

## 21. Siguiente objetivo

`FRONTEND OBJETIVO 2 — MESAS FUNCIONALES + SESIONES`: integrar service points/sessions reales, transiciones de estado, apertura, operación y liberación manteniendo la distribución visual creada aquí.
