# KUCHI'S — Carta Digital y Sistema Logístico

## 1. Visión del proyecto

**KUCHI'S** será un ecosistema web para digitalizar progresivamente la experiencia del cliente y la operación interna del negocio.

El proyecto estará dividido en **dos aplicaciones web independientes**, con experiencias y objetivos distintos:

1. **KUCHI'S Clientes**
   - Aplicación pública.
   - No requiere inicio de sesión.
   - Orientada completamente al cliente.
   - Carta virtual.
   - Simulador de pedido.
   - Simulación de pago con tarjeta.
   - Acceso mediante enlace o código QR.

2. **KUCHI'S Logístico**
   - Aplicación privada.
   - Requiere autenticación.
   - Orientada al funcionamiento interno del negocio.
   - Mesas y barra.
   - Comandas.
   - Salón.
   - Parrilla.
   - Caja.
   - Turnos.
   - Usuarios.
   - Roles y permisos.
   - Administración.

Ambas aplicaciones compartirán un mismo backend y una misma infraestructura de datos.

---

# 2. Objetivo general

Construir una solución web sencilla, rápida, segura y escalable que permita:

- ofrecer una carta digital accesible desde cualquier celular;
- facilitar que el cliente calcule cuánto consumiría;
- mostrar el total estimado según el método de pago;
- reducir el uso de cartas físicas;
- reemplazar gradualmente las comandas en papel;
- mejorar la comunicación entre salón, parrilla y caja;
- facilitar el cierre de caja;
- mantener una fuente única de productos, precios y disponibilidad;
- gestionar usuarios internos mediante roles;
- centralizar la información del negocio;
- mantener control de versiones mediante GitHub.

---

# 3. Arquitectura general

```text
                         KUCHI'S
                            |
          +-----------------+-----------------+
          |                                   |
          v                                   v
  KUCHI'S CLIENTES                    KUCHI'S LOGÍSTICO
   Aplicación pública                  Aplicación privada
          |                                   |
          |                                   |
          +-----------------+-----------------+
                            |
                            v
                     BACKEND / API
                            |
          +-----------------+-----------------+
          |                 |                 |
          v                 v                 v
      PostgreSQL           Auth            Storage
          |                 |                 |
          +----------- SUPABASE -------------+
                            |
                            v
                         Realtime
```

La separación principal será:

```text
Frontend público     -> KUCHI'S Clientes
Frontend privado     -> KUCHI'S Logístico
Backend compartido   -> API y reglas de negocio
Base de datos        -> PostgreSQL en Supabase
Autenticación        -> Supabase Auth
Permisos             -> Backend + RLS
Imágenes             -> Supabase Storage
Tiempo real          -> Supabase Realtime
Versionado           -> Git + GitHub
```

---

# 4. KUCHI'S Clientes

## 4.1. Objetivo

Crear una experiencia pública extremadamente sencilla.

Cuando una persona escanee un QR o abra el enlace, debe entrar directamente a la carta.

No debe encontrar:

- login;
- panel administrativo;
- opciones internas;
- caja;
- parrilla;
- usuarios;
- mensajes que le hagan preguntarse qué debe hacer.

La experiencia debe ser:

```text
Escanear QR
     |
     v
Ver carta
     |
     v
Elegir productos
     |
     v
Simular consumo
     |
     v
Ver total estimado
```

---

# 5. MVP — KUCHI'S Clientes

La primera versión pública deberá permitir:

- abrir la carta sin autenticación;
- visualizar categorías;
- visualizar productos;
- mostrar fotografía;
- mostrar nombre;
- mostrar descripción;
- mostrar precio;
- mostrar disponibilidad;
- agregar productos a una simulación;
- incrementar cantidad;
- disminuir cantidad;
- eliminar productos;
- vaciar simulación;
- calcular subtotal;
- seleccionar un método de pago estimado;
- calcular el posible recargo por tarjeta;
- mostrar el total estimado;
- funcionar correctamente en celular.

La aplicación debe indicar siempre que se trata de una simulación.

Ejemplo:

> **Simulación de pedido**  
> Este pedido es referencial y no ha sido enviado a KUCHI'S.

---

# 6. Simulación de pago

Métodos iniciales:

- Efectivo.
- Yape / billetera digital.
- Tarjeta.

Ejemplo:

```text
Consumo:                 S/ 40.00

Efectivo / Yape:
Total estimado:          S/ 40.00

Tarjeta:
Consumo:                 S/ 40.00
Recargo POS (5 %):       S/  2.00
Total estimado:          S/ 42.00
```

El recargo será informativo para el cliente.

En el sistema interno, dicho recargo no se considerará ingreso propio de KUCHI'S si el operador del POS lo retiene directamente.

---

# 7. Uso mediante QR

La carta deberá estar preparada para ser utilizada mediante códigos QR.

Ejemplo de experiencia:

```text
Mesa
  |
  v
Código QR
  |
  v
KUCHI'S Clientes
  |
  v
Carta virtual
```

El mismo enlace podrá utilizarse:

- dentro del local;
- desde redes sociales;
- desde WhatsApp;
- desde Google Business;
- desde la casa del cliente.

---

# 8. KUCHI'S Logístico

## 8.1. Objetivo

Crear una aplicación privada para gestionar el funcionamiento interno de KUCHI'S.

Esta aplicación estará completamente separada de la experiencia del cliente.

Su pantalla inicial será únicamente de autenticación.

```text
KUCHI'S LOGÍSTICO

Correo
[________________]

Contraseña
[________________]

[ INICIAR SESIÓN ]
```

No habrá registro público.

---

# 9. Usuarios y autenticación

Se utilizará:

- Supabase Auth;
- sesiones autenticadas;
- roles;
- permisos;
- validaciones en backend;
- Row Level Security cuando corresponda.

El registro público deberá estar deshabilitado.

Solo un usuario administrador podrá crear nuevas cuentas.

Flujo:

```text
Administrador
     |
     v
Crear usuario
     |
     +--> Salón
     +--> Parrilla
     +--> Caja
     +--> Administrador
```

---

# 10. Roles

## 10.1. Salón

Puede:

- ver mesas y barra;
- abrir una mesa;
- consultar la carta;
- agregar productos;
- crear comandas;
- enviar comandas;
- agregar consumos posteriores;
- consultar estado de preparación;
- revisar el total actual.

No puede:

- crear usuarios;
- modificar precios;
- modificar productos;
- administrar caja;
- cerrar turnos;
- acceder a configuraciones sensibles.

---

## 10.2. Parrilla

Puede:

- recibir comandas;
- ver mesa o barra;
- ver productos;
- ver cantidades;
- ver hora de envío;
- cambiar estados:

```text
PENDIENTE
   |
   v
PREPARANDO
   |
   v
LISTO
```

No necesita acceso a:

- caja;
- precios administrativos;
- reportes;
- usuarios.

---

## 10.3. Caja

Puede:

- consultar mesas abiertas;
- revisar consumos;
- cobrar;
- registrar método de pago;
- cerrar una mesa;
- cancelar una mesa según reglas;
- consultar ventas del turno;
- cerrar turno;
- revisar resumen de caja.

---

## 10.4. Administrador

Puede:

- realizar operaciones de salón;
- realizar operaciones de parrilla;
- realizar operaciones de caja;
- crear usuarios;
- cambiar roles;
- gestionar productos;
- gestionar categorías;
- cambiar precios;
- cambiar disponibilidad;
- consultar historial;
- revisar reportes;
- realizar configuraciones administrativas.

---

# 11. Distribución física inicial

El sistema contemplará inicialmente:

```text
7 mesas
4 posiciones de barra
---------------------
11 puntos de atención
```

Cada punto tendrá estado operativo propio en la interfaz.

> **Importante:** el campo `is_active` de `service_points` no indicará si una mesa está ocupada.  
> `is_active` indicará si ese punto de servicio está habilitado para utilizarse en el sistema.  
> La ocupación real se determinará mediante la existencia de una `service_session` abierta.

Ejemplo:

```text
Mesa 1      LIBRE
Mesa 2      OCUPADA
Mesa 3      LIBRE
Mesa 4      POR COBRAR
...
Barra 1     OCUPADA
Barra 2     LIBRE
```

---

# 12. Flujo de una mesa

```text
LIBRE
  |
  v
ABIERTA
  |
  +--> agregar productos
  |
  +--> generar comanda
  |
  +--> enviar a parrilla
  |
  +--> agregar nuevos consumos
  |
  v
POR COBRAR
  |
  v
PAGADA
  |
  v
LIBRE
```

Caso alternativo:

```text
ABIERTA
  |
  v
CANCELADA
```

Motivos iniciales:

- mesa abierta por error;
- cliente se retiró sin consumir.

---

# 13. Comandas

Una mesa podrá tener varias comandas durante una misma atención.

Ejemplo:

```text
Mesa 7

Comanda #001
17:40

- 1 Salchipapa clásica
- 1 Chicha morada
```

Más tarde:

```text
Comanda #002
18:03

- 1 Hamburguesa
```

La cuenta consolidada será:

```text
Mesa 7

- 1 Salchipapa clásica
- 1 Chicha morada
- 1 Hamburguesa
```

Las comandas se mantendrán separadas para conservar:

- momento del pedido;
- productos enviados;
- estado de preparación;
- trazabilidad.

---

# 14. Caja

Métodos de pago iniciales:

- efectivo;
- Yape;
- tarjeta.

Ejemplo de tarjeta:

```text
Consumo KUCHI'S:        S/ 40.00
Recargo POS (5 %):      S/  2.00
Cliente paga:           S/ 42.00
Ingreso KUCHI'S:        S/ 40.00
```

El recargo puede almacenarse como dato referencial.

No deberá incrementar el ingreso real de KUCHI'S si es retenido directamente por el operador del POS.

---

# 15. Turnos

El sistema deberá registrar turnos.

Información inicial:

```text
Turno
|
+--> fecha y hora de apertura
+--> usuario que abrió
+--> estado
+--> ventas
+--> pagos
+--> fecha y hora de cierre
+--> usuario que cerró
```

Al cerrar turno se generará un resumen.

Ejemplo:

```text
Ventas del turno:       S/ XXX.XX

Efectivo:                S/ XXX.XX
Yape:                    S/ XXX.XX
Tarjeta:                 S/ XXX.XX

Mesas atendidas:         XX
Mesas canceladas:        XX
```

---

# 16. Backend

El proyecto tendrá un backend propio.

Responsabilidades:

- exponer la API;
- validar datos;
- aplicar reglas de negocio;
- autenticar solicitudes;
- comprobar permisos;
- realizar operaciones administrativas;
- ocultar credenciales sensibles;
- coordinar operaciones con Supabase;
- centralizar lógica reutilizable;
- permitir futuras integraciones.

El frontend no deberá contener lógica sensible ni credenciales administrativas.

---

# 17. Frontends

Existirán dos aplicaciones frontend.

## 17.1. Frontend Cliente

Responsabilidades:

- carta pública;
- categorías;
- productos;
- imágenes;
- simulador;
- cálculo estimado;
- experiencia mobile-first.

## 17.2. Frontend Logístico

Responsabilidades:

- login;
- dashboard;
- mesas;
- comandas;
- parrilla;
- caja;
- administración;
- usuarios;
- turnos.

---

# 18. Base de datos

Se utilizará PostgreSQL desplegado mediante Supabase.

La base de datos será una fuente central para ambas aplicaciones.

Ejemplo:

```text
Administrador cambia precio
           |
           v
      PostgreSQL
           |
     +-----+------+
     |            |
     v            v
Clientes       Logístico
S/ 12.00       S/ 12.00
```

No habrá dos listas independientes de productos.

---

# 19. Entidades preliminares

El modelo definitivo se diseñará mediante un ERD antes de crear tablas.

Entidades esperadas en el ERD v1:

```text
profiles

categories
products

service_points
service_sessions

orders
order_items

payments

shifts

audit_logs
```

### Decisiones del modelo v1

- **`service_points`** representa cualquier punto físico de atención de KUCHI'S, no solamente mesas.
  - `TABLE` = mesa.
  - `BAR` = posición de barra.
- **`service_sessions`** representa una atención concreta ocurrida en un punto de servicio.
  - Ejemplo: la ocupación de la Mesa 7 entre las 20:10 y las 21:05.
- Los roles iniciales (`ADMIN`, `CASHIER`, `HALL`, `GRILL`) se almacenarán en el perfil del usuario; no se necesita una tabla `roles` durante el MVP.
- Las simulaciones realizadas en KUCHI'S Clientes no se almacenarán en PostgreSQL durante el MVP.
- Los precios históricos de una venta se conservarán dentro de `order_items` para que una modificación futura del precio de un producto no cambie ventas antiguas.
- Los productos y puntos de servicio se desactivarán mediante **soft delete** (`is_active = false`) en lugar de eliminar registros históricos.

Podrán agregarse entidades adicionales después del modelado.

---

# 20. Imágenes

Las imágenes no se almacenarán dentro de PostgreSQL como archivos binarios.

Se utilizará Supabase Storage.

Ejemplo:

```text
products/
|
+-- salchipapa-clasica.webp
+-- salchipapa-especial.webp
+-- hamburguesa.webp
+-- chicha-morada.webp
```

La base de datos guardará únicamente:

- ruta;
- URL;
- identificador de archivo.

Las imágenes deberán optimizarse mediante:

- WebP o AVIF;
- dimensiones razonables;
- compresión;
- carga eficiente.

---

# 21. Tiempo real

Supabase Realtime se evaluará principalmente para KUCHI'S Logístico.

Casos de uso:

```text
Salón
  |
  | nueva comanda
  v
Backend / Supabase
  |
  v
Parrilla
```

También podrá utilizarse para:

- cambios de estado;
- actualización de mesas;
- sincronización entre dispositivos;
- avisos de pedidos listos.

---

# 22. Tecnologías iniciales

## Frontend

- React.
- Next.js.
- TypeScript.
- Diseño responsive.
- Enfoque mobile-first.
- Figma / Figma AI.

## Backend

- Node.js.
- Express.
- TypeScript.
- API REST.

## Datos

- PostgreSQL.
- Supabase.

## Autenticación

- Supabase Auth.

## Seguridad

- Backend authorization.
- Supabase RLS.
- Roles.

## Archivos

- Supabase Storage.

## Tiempo real

- Supabase Realtime.

## Versionado

- Git.
- GitHub.

---

# 23. Estructura del repositorio

Se utilizará inicialmente un monorepo.

```text
kuchis/
|
+-- apps/
|   |
|   +-- client/
|   |   +-- KUCHI'S Clientes
|   |
|   +-- logistics/
|   |   +-- KUCHI'S Logístico
|   |
|   +-- api/
|       +-- Backend
|
+-- packages/
|   +-- shared/
|
+-- docs/
|   +-- architecture/
|   +-- database/
|   +-- flows/
|   +-- mockups/
|
+-- supabase/
|   +-- migrations/
|   +-- seeds/
|
+-- .github/
|   +-- workflows/
|
+-- .gitignore
+-- README.md
+-- LICENSE
```

---

# 24. Estrategia de desarrollo

El proyecto avanzará de forma incremental.

## Fase 0 — Planeamiento técnico

Objetivo:

Definir correctamente el sistema antes de implementar.

Trabajo:

- cerrar alcance;
- definir flujos;
- diseñar ERD;
- definir reglas de negocio;
- establecer arquitectura;
- crear repositorio;
- crear estructura inicial.

Entregable:

Arquitectura y modelo de datos listos para comenzar.

---

# 25. Fase 1 — KUCHI'S Clientes

## Objetivo

Lanzar primero la experiencia pública.

Trabajo:

- diseño en Figma;
- identidad visual;
- frontend;
- backend base;
- categorías;
- productos;
- conexión a PostgreSQL;
- imágenes en Storage;
- simulador de pedido;
- simulación de tarjeta;
- responsive;
- códigos QR;
- despliegue inicial.

Entregable:

```text
QR
 |
 v
Carta virtual
 |
 v
Simulador funcional
```

Esta será la primera versión visible del proyecto.

---

# 26. Fase 2 — Base de KUCHI'S Logístico

## Objetivo

Crear la infraestructura privada.

Trabajo:

- Supabase Auth;
- login;
- deshabilitar registro público;
- perfiles;
- roles;
- permisos;
- middleware;
- RLS;
- creación de usuarios por administrador;
- dashboards por rol.

Entregable:

Usuarios autenticados accediendo únicamente a las funciones permitidas.

---

# 27. Fase 3 — Puntos de servicio y comandas

## Objetivo

Digitalizar el flujo de salón.

Trabajo:

- configurar 11 puntos de servicio;
  - 7 de tipo `TABLE`;
  - 4 de tipo `BAR`;
- estados;
- apertura;
- sesiones de atención (`service_sessions`);
- selección de productos;
- creación de comandas;
- consumos adicionales;
- consulta de cuenta.

Entregable:

```text
Salón
  |
  v
Punto de servicio
  |
  v
Pedido
  |
  v
Comanda
```

---

# 28. Fase 4 — Parrilla y Realtime

## Objetivo

Digitalizar la recepción y preparación de pedidos.

Trabajo:

- vista de parrilla;
- comandas entrantes;
- estado pendiente;
- estado preparando;
- estado listo;
- actualizaciones en tiempo real.

Entregable:

```text
Salón -> Comanda -> Parrilla -> Listo
```

---

# 29. Fase 5 — Caja y turnos

## Objetivo

Digitalizar cobros y cierre de turno.

Trabajo:

- cuentas;
- pagos;
- efectivo;
- Yape;
- tarjeta;
- recargo POS;
- cierre de mesa;
- cancelaciones;
- apertura de turno;
- cierre de turno;
- resumen de caja.

Entregable:

Flujo financiero básico digitalizado.

---

# 30. Fase 6 — Administración

## Objetivo

Centralizar el mantenimiento del sistema.

Trabajo:

- productos;
- categorías;
- precios;
- disponibilidad;
- usuarios;
- roles;
- historial;
- auditoría;
- reportes básicos.

---

# 31. Experiencia de usuario

## KUCHI'S Clientes

Debe ser:

- atractivo;
- directo;
- visual;
- rápido;
- fácil;
- mobile-first;
- sin elementos administrativos.

Regla principal:

> El cliente debe entender qué hacer sin recibir instrucciones.

## KUCHI'S Logístico

Debe ser:

- rápido;
- funcional;
- claro;
- botones grandes;
- pocos pasos;
- usable desde celular y tablet;
- adaptado al rol.

---

# 32. Seguridad

Principios:

1. Nunca confiar solamente en el frontend.
2. Nunca exponer claves administrativas.
3. Validar operaciones en backend.
4. Aplicar permisos por rol.
5. Utilizar RLS cuando corresponda.
6. Mantener registro de operaciones sensibles.
7. No permitir registro público.
8. Separar experiencia pública y sistema privado.

---

# 33. Git y GitHub

El proyecto tendrá control de versiones desde el comienzo.

Ramas iniciales:

```text
main
  |
  +-- develop
       |
       +-- feature/client-menu
       +-- feature/client-simulator
       +-- feature/api
       +-- feature/auth
       +-- feature/tables
       +-- feature/orders
       +-- feature/kitchen
       +-- feature/cashier
```

`main` representará una versión estable.

---

# 34. Pruebas

Antes de utilizar KUCHI'S Logístico como sistema habitual del negocio, deberá probarse con usuarios reales.

Usuarios de prueba:

- propietarios;
- salón;
- parrilla;
- caja.

Se evaluará:

- facilidad;
- velocidad;
- claridad;
- número de pasos;
- errores frecuentes;
- funcionamiento en celular;
- funcionamiento en tablet;
- estabilidad;
- precisión de cuentas;
- precisión de cierre.

---

# 35. Fuera del MVP

No serán prioridad inicial:

- pedidos online reales;
- delivery;
- pagos online;
- facturación electrónica;
- reservas;
- programa de puntos;
- inventario avanzado;
- app móvil nativa;
- integración con plataformas de delivery;
- inteligencia artificial;
- analítica avanzada.

Podrán añadirse en futuras versiones.

---

# 36. Roadmap general

```text
[0] Planeamiento
      |
      v
[1] ERD y reglas de negocio
      |
      v
[2] Repo + estructura
      |
      v
[3] Supabase + PostgreSQL
      |
      v
[4] Backend base
      |
      v
[5] KUCHI'S Clientes
      |
      v
[6] Despliegue Cliente + QR
      |
      v
[7] Auth + Roles
      |
      v
[8] KUCHI'S Logístico base
      |
      v
[9] Mesas + Comandas
      |
      v
[10] Parrilla + Realtime
      |
      v
[11] Caja + Turnos
      |
      v
[12] Administración
      |
      v
[13] Pruebas reales
      |
      v
[14] Versión estable
```

---

# 37. Primer paso de desarrollo real

Con este README definido, el primer paso será:

## Diseñar el modelo de datos y el ERD de KUCHI'S.

Se deberá definir:

- tablas;
- columnas;
- tipos de datos;
- claves primarias;
- claves foráneas;
- estados;
- restricciones;
- relaciones;
- reglas de eliminación;
- auditoría;
- historial;
- índices importantes.

El modelo deberá soportar desde el comienzo:

```text
KUCHI'S Clientes
        +
KUCHI'S Logístico
        +
Backend compartido
        +
Supabase
```

---

# 38. Principio central del proyecto

KUCHI'S no debe construirse como un sistema enorme desde el primer día.

La prioridad será:

```text
resolver un problema real
        |
        v
probarlo con usuarios reales
        |
        v
corregir
        |
        v
recién después ampliar
```

La experiencia del cliente debe ser simple.

La experiencia del trabajador debe ser rápida.

La arquitectura debe permitir crecer sin rehacer todo el proyecto.
