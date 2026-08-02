# CLAUDE.md — FORGE v2

App de tracking de entrenamiento para gimnasio. Reemplaza Google Sheets con una interfaz mobile-first optimizada para usar en el gym.

---

## Stack

| Capa | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Lenguaje | JSX (sin TypeScript por ahora) |
| Estilos | CSS-in-JS embebido (string en constante `CSS`) |
| Persistencia | localStorage (`forge-v2`) — la capa Turso existe pero la UI todavia no la usa |
| Base de datos | Turso / libSQL — base `forge` (org `gabriellucci`), schema v01 + v02 aplicados |
| Auth | NextAuth v4 — Google OAuth + magic link por Resend |
| Deploy | Vercel (region `dub1`, junto a la base) |
| Linter | oxlint |

> Fue una SPA Vite en GitHub Pages hasta la Fase 4. La migracion a Next.js fue
> necesaria para tener route handlers: GitHub Pages es estatico y no puede servir
> ni NextAuth ni la API de sync.

---

## Estructura del proyecto

```
app-forge-v2/
├── app/                   # App Router
│   ├── layout.jsx         # shell HTML + metadata + viewport
│   ├── page.jsx           # monta <ForgeApp /> — la app del ATLETA
│   ├── entrenador/        # la app del ENTRENADOR (monta <CoachApp />)
│   ├── globals.css        # estilos globales minimos
│   ├── login/             # pantalla de acceso (page.jsx + login.css)
│   ├── invitacion/[token] # aceptar una invitacion de entrenador
│   └── api/               # auth, sync, profile, invitaciones,
│                          # coach/ (espacio), coach/alumno (ficha), coach/asignar
├── components/
│   ├── ForgeApp.jsx       # monolito del atleta (~1400 lineas, "use client")
│   ├── LoginForm.jsx      # formulario de acceso (client)
│   └── coach/             # la seccion de entrenador, con su propio CSS
│       ├── CoachApp.jsx        # shell + selector de alumno + invitar
│       ├── AlumnoFicha.jsx     # metricas de seguimiento
│       ├── AsignarPrograma.jsx # duplicar / asignar
│       └── coach.css           # responsive real, un breakpoint (900px)
├── lib/
│   ├── db.js              # cliente libSQL + uid/now/tx
│   ├── formulas.js        # brzycki, keyOf, isNum — fuente unica (UI y server)
│   ├── auth/              # options, adapter propio, envio Resend, interop v4
│   ├── coach/             # metrics.js (funciones puras) + invite-email.js
│   ├── sync/              # ids.js (prefijos), service.js, client.js
│   └── repo/              # users, programs, training, coaching
├── db/
│   ├── v01_init.sql       # dominio multi-tenant
│   ├── v02_auth.sql       # tablas de NextAuth
│   ├── v03_coach.sql      # catalogo con dueno + coach_invites
│   └── *.db               # bases locales (gitignored)
├── public/                # assets estaticos
├── scripts/               # utilidades node (no entran al bundle)
│   ├── gen-programa-xlsx.mjs  # genera el .xlsx del SEED para importar por el wizard
│   ├── migrate.mjs            # aplica db/*.sql en orden, idempotente
│   ├── seed-demo-coach.mjs    # base de demo con 2 usuarios + cookies de sesion
│   ├── verify-import.mjs      # round-trip del import, contra los helpers reales
│   ├── verify-export.mjs      # export del historial contra historial sintetico
│   ├── verify-schema.mjs      # invariantes del schema sobre base descartable
│   ├── verify-repo.mjs        # capa de datos real sobre base descartable
│   ├── verify-sync.mjs        # aislamiento entre usuarios + merge del cliente
│   ├── verify-coaching.mjs    # vinculo coach-alumno, cupos, baja
│   ├── verify-coach-metrics.mjs # metricas de la ficha + camino coach->alumno
│   ├── check_ui.py            # headless: falla si una ruta no hidrata
│   └── check_coach_ui.py      # headless: la seccion de entrenador, con 2 sesiones
├── data/                  # .xlsx generados (gitignored — datos personales)
├── forge-arquitectura.md  # documento de diseno tecnico completo
├── forge-mvp.jsx          # version anterior de referencia
├── next.config.mjs
├── vercel.json
└── package.json
```

---

## Arquitectura actual

### Archivo monolitico
Todo vive en `ForgeApp.jsx`:
- Constantes (`DEFAULT_SESSIONS`, `SEED`, `SEED_PROGRAM`)
- Helpers (`uid`, `brzycki`, `fmtTime`, `refLine`, `getBlocks`, etc.)
- Excel helpers (`matchColumn`, `parseExcelData`, `downloadTemplate`)
- Componente principal `ForgeApp` con todo el state
- Componentes: `ExerciseEditor`, `ImportWizard`
- Constante `CSS` con todos los estilos

### Modelo de datos (localStorage v2)
```js
{
  programs: [{
    id, name, weeks, hasDeload,
    sessions: [{ id: "A", name: "..." }],
    exercises: [{ id, session, order, name, group, sets, refKg, repsMin, repsMax, tempo, rest, rir, superset, unit, description }],
    status, createdAt
  }],
  activeProgramId: "...",
  logs: { "week|exId|setN": { kg, reps, rir, done } },
  history: [{ id, programId, week, session, sessionName, date, duration, health, exercises: [...] }]
}
```
Migracion automatica de v1 (flat program[]) a v2 (programs[]) en `migrateState()`.

### Catalogo de ejercicios
El nombre no es texto libre: `program.exercises[].exerciseId` referencia a `lib/catalog.js`
(base de solo lectura + propios). Los nombres se **resuelven** contra el catalogo al derivar
`program`, asi que el resto del componente sigue leyendo `ex.name` sin enterarse.

Cambiar `exerciseId` en un ejercicio **con series registradas es una sustitucion**: `saveExercise`
le da un id nuevo y saca el anterior del programa, para que los e1RM no se encadenen. Sin series
registradas, edita en el lugar. Esa distincion es el motivo de que exista el catalogo.

Vive solo en el cliente: falta el schema SQL. El pull igual lo mantiene al dia con
`absorberDeProgramas()`, que incorpora los ejercicios que llegan de otro dispositivo
respetando su id. Lo unico que no viaja es un ejercicio creado y nunca usado en un programa.

### Capa de datos (Turso) — existe, la UI todavia no la usa
`lib/repo/*` traduce entre la forma que usa la UI (la de arriba) y el schema SQL.
Ese mapeo vive solo ahi: la UI no conoce el schema y el schema no conoce los
nombres de la UI.

- `users.js` — `findOrCreate` por email (clave natural), perfil
- `programs.js` — programa completo (programa + sesiones + ejercicios) en un batch
- `training.js` — asignaciones, ciclos, refs por atleta, sesiones y series

`npm run verify:repo` los ejercita contra una base descartable. Correrlo despues
de tocar cualquier cosa de `lib/repo/` o de `db/`.

**La ref de kilos no vive en la plantilla**: `program_exercises.ref_kg` es una
sugerencia, la real esta en `assignment_refs` por atleta y por semana. Un programa
asignado a diez alumnos no les impone los mismos kilos.

### Auth
NextAuth v4 con adapter propio sobre la tabla `users` del dominio — no crea una
tabla de usuarios paralela. Sesion JWT (sin tabla de sesiones). El email es la
identidad: entrar por Google o por magic link cae en el mismo `users.id`.

`lib/auth/nextauth-interop.js` desenvuelve el default export de next-auth v4, que
bajo Next 15 llega con doble envoltura CJS/ESM. Sin eso: "X is not a function".
Importar los providers y el handler **desde ahi**, no desde `next-auth` directo.

### Dos gotchas de entorno que ya costaron tiempo

**No correr `npm run build` con `next dev` levantado.** Comparten `.next/` y el
manifest de client components queda desincronizado. Sintoma: *"Could not find the
module ...#default in the React Client Manifest"* al navegar. Se arregla parando
el server, borrando `.next` entero y levantando de nuevo.

**Un puerto, un proyecto.** Los service workers se registran por **origen**, no por
proyecto: si otra app PWA uso `localhost:3000`, su SW intercepta lo de FORGE y
sirve assets cacheados ajenos — la app compila, responde 200 y se ve en blanco.
FORGE se queda en el 3000 porque tiene el puerto atado a `NEXTAUTH_URL` y a los
redirect URIs de Google; lo demas se mueve. `npm run verify:ui` detecta el sintoma.

### Dependencias
- `xlsx` (SheetJS) — parseo client-side de Excel para import/export
- `@libsql/client` — acceso a Turso
- `next-auth` v4 — autenticacion

### Tabs
- **Entrenar**: selector semana x sesion -> health check -> entrenamiento activo (block-based con superseries)
- **Programa**: lista de programas / detalle de programa activo con ejercicios por sesion
- **Historial**: sesiones completadas con detalle expandible (filtrado por programa activo)
- **Progreso**: e1RM por ejercicio + tonelaje semanal (dinamico segun semanas del programa)

---

## Convenciones

### Codigo
- Archivo monolitico por ahora — no fragmentar sin razon
- Helpers como funciones puras fuera del componente
- State centralizado en ForgeApp con useState
- Persistencia con debounce (500ms) a localStorage
- IDs generados con `uid()` (random base36)
- CSS embebido como template string en constante `CSS`

### Formulas
- Viven en `lib/formulas.js`, importadas tanto por la UI como por el server —
  el e1RM que se persiste en `set_logs` tiene que ser el mismo que muestra la pantalla
- e1RM: Brzycki `kg * 36 / (37 - reps)`
- Deload: configurable por programa (`{pct, method, minSets}`), default -40% por series con
  piso de 2. El piso protege al protocolo ASIM-IZQ, que corrige asimetria con series de mas
- Ref de kilos: `refFor(ex, week)` — `refsByWeek` pisa a `refKg`. Subir la ref a mitad de
  ciclo no puede cambiar las semanas ya entrenadas
- Semaforo: verde (subir) / amarillo (mantener) / rojo (revisar) basado en reps vs guia y RIR
- Descanso: dispara en la transicion vacio -> con dato del campo REPS. En superserie espera a que la
  serie N este cerrada en todos los ejercicios del bloque y usa el `rest` mas alto (`maybeStartRest`)

### UI
- Mobile-first, max-width 430px
- Font: Inter (UI) + DM Mono (numeros)
- Color primario: #2C6BED
- Border radius: 12-16px en cards, 999px en chips/badges
- Inputs grandes (50px height) para uso con una mano

### Git
- Rama nueva antes de implementar: `git checkout -b feat/descripcion`
- Mensajes en ingles: `feat:`, `fix:`, `refactor:`, `chore:`
- No commitear a main directamente
- El deploy sale de `main` por la integracion Git de Vercel — una rama feature commiteada
  **no** esta en produccion. Mergear a main antes de dar una fase por cerrada

---

## Datos del atleta

El SEED es el programa real (Ciclo 2, fullbody 3x DUP). Fuente de verdad **externa** al repo:
`OneDrive/Documentos/Organizacion Personal/Salud/Sistema cronobiologico/Claude/rutina_gym.md`
y `programa_tecnicas_ciclo2 sin belt quat.md`. Antes de tocar refs o ejercicios, leer esos archivos.

Restriccion medica que condiciona la seleccion de ejercicios: discopatias lumbares incipientes L3-S1.
**Nunca** proponer back squat, front squat, peso muerto convencional ni good mornings pesados.
Sustitutos validos en uso: sentadilla pendular, prensa horizontal, prensa 45, trap bar, hip thrust.

`npm run gen:programa` genera `data/*.xlsx` para importar por el wizard (el SEED solo aplica a
instalaciones nuevas). `npm run verify` corre las 8 suites (120 checks, sin navegador).

Para lo que el verify no ve, que es donde aparecieron los ultimos bugs, hay dos
verificadores con navegador: `npm run verify:ui` (generico) y
`scripts/check_coach_ui.py` (la seccion de entrenador, con dos sesiones reales).
Ver `docs/e4-seccion-entrenador.md` para como levantarlos.

Los datos de salud (lesiones en `description` y `note`) son **dato sensible** bajo la Ley 25.326
cuando son de terceros. Antes de onboardear un alumno real hace falta consentimiento expreso —
la tabla `health_consents` existe para registrarlo, pero todavia no hay UI que lo pida.

---

## Zonas protegidas

- Logica de `brzycki` (en `lib/formulas.js`) y semaforo — no modificar sin consulta
- Estructura de `logs` (key format `week|exId|setN`) — migrar con cuidado
- Flujo de entrenamiento activo (health check -> blocks -> finish) — es el core UX
- Migraciones ya aplicadas (`db/v01_init.sql`, `db/v02_auth.sql`) — para cambiar algo
  se agrega una `v03`, nunca se edita una aplicada

---

## Rol entrenador (fase 5)

E1-E4 hechas. Ver `docs/e4-seccion-entrenador.md` para el detalle, lo que quedo
pendiente y los errores que ya mordieron.

**Son dos apps con dos formas distintas y no se mezclan.** La del atleta vive en
`/` y esta clavada a 430px porque se usa con una mano en el gimnasio. La del
entrenador vive en `/entrenador` (`components/coach/`), es responsive de verdad y
tiene su propio `coach.css` — un archivo CSS normal, no la constante `CSS`.
Cambiar una no deberia tocar a la otra.

Tres reglas que valen mas que su implementacion:
- **Un programa por alumno**, no una plantilla calibrada. Por eso duplicar y
  asignar son un solo movimiento: asignar el mismo programa a dos personas las
  deja compartiendo la prescripcion.
- La ficha del alumno muestra **como le esta yendo**, no con que kilos entrena.
  `assignment_refs` sigue existiendo y verificado, pero no es el camino principal.
- Los ids llevan el prefijo del usuario que los subio; uno que **ya viene prefijado no se
  vuelve a prefijar**. En un programa asignado el id del servidor es el canonico. Ver
  `lib/sync/ids.js`. Vale tambien para los ids que genera el SERVIDOR (duplicar un
  programa): si nacen pelados, el push siguiente los prefija y duplica el programa.

## Roadmap

1. ~~MVP: programa seed, entrenamiento, timer, superseries, e1RM~~ Done
2. ~~Health check, historial, semaforo, superset blocks~~ Done
3. ~~Programas multiples: crear, predefinido, importar Excel, descripciones~~ Done
4. ~~Persistencia real (Turso) + auth + multi-device: `/api/sync`, UI cableada,
   merge con el localStorage existente~~ Done
5. ~~Roles coach/atleta: invitaciones, asignacion y seccion de entrenador con
   metricas (E1-E4)~~ Done
6. PWA offline

### Deuda conocida

- **El catalogo de ejercicios no tiene schema SQL.** Vive en el cliente; el pull
  lo mantiene al dia con `absorberDeProgramas()`, pero un `exerciseId` no
  sobrevive el viaje al servidor (`program_exercises` no tiene esa columna). Un
  programa creado del lado del servidor se ve bien pero cae al nombre
  denormalizado.
- **Un ejercicio borrado no viaja por el pull.** `saveProgram` borra con DELETE
  duro y el pull no lo propaga: hay que resolverlo cuando entre el sync
  incremental. Ver el comentario en `lib/repo/programs.js`.
- **`health_consents` se graba pero no hay UI que lo pida ni que lo revoque.**
- **Adaptar un programa se hace en la pestana Programa del atleta**, no en la
  seccion de entrenador.

---

## Documento de referencia

`forge-arquitectura.md` contiene el diseno tecnico completo:
- Schema Dexie/PostgreSQL target
- Modelo coach/athlete
- Import Excel (SheetJS)
- Wireframes de todas las pantallas
- Formulas y reglas de negocio

Usarlo como guia para decisiones de arquitectura, pero la implementacion actual es MVP simplificado (localStorage, sin auth, sin sync).
