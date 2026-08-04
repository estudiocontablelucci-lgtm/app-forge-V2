# CLAUDE.md — FORGE v2

App de tracking de entrenamiento para gimnasio. Reemplaza Google Sheets con una interfaz mobile-first optimizada para usar en el gym.

---

## Stack

| Capa | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Lenguaje | JSX (sin TypeScript por ahora) |
| Estilos | CSS-in-JS embebido (string en constante `CSS`) |
| Persistencia | localStorage (`forge-v2`) como fuente de verdad mientras se entrena, sincronizado con Turso |
| Base de datos | Turso / libSQL — base `forge` (org `gabriellucci`), schema v01–v06 aplicados |
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
│       ├── EditorPrograma.jsx  # adaptar el programa, edicion en linea
│       └── coach.css           # responsive real, un breakpoint (900px)
├── lib/
│   ├── db.js              # cliente libSQL + uid/now/tx
│   ├── formulas.js        # brzycki, keyOf, isNum — fuente unica (UI y server)
│   ├── auth/              # options, adapter propio, envio Resend, interop v4
│   ├── coach/             # metrics.js (funciones puras) + invite-email.js
│   ├── medidas.js         # medidas corporales: derivadas, proporciones, asimetrias
│   ├── asistencia.js      # dias de gimnasio por mes, promedios, racha
│   ├── sync/              # ids.js (prefijos), service.js, client.js
│   └── repo/              # users, programs, training, coaching, catalog, medidas, asistencia
├── db/
│   ├── v01_init.sql       # dominio multi-tenant
│   ├── v02_auth.sql       # tablas de NextAuth
│   ├── v03_coach.sql      # tabla exercises + program_exercises.exercise_id
│   ├── v04_catalogo_por_usuario.sql # el catalogo es del usuario, no del coach
│   ├── v05_email_canon.sql # la cuenta es la casilla, no la grafia
│   ├── v06_asistencia.sql # meses de asistencia anteriores a la app
│   └── *.db               # bases locales (gitignored)
├── public/                # assets estaticos
│   ├── sw.js              # service worker escrito a mano (leer sus reglas)
│   ├── manifest.webmanifest
│   └── icon-*.png         # generados con `npm run gen:iconos`
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
│   ├── verify-catalog-sync.mjs # identidad del ejercicio entre dispositivos
│   ├── verify-coach-editor.mjs # lo que el coach edita llega al alumno
│   ├── verify-medidas.mjs     # formulas contra los numeros reales de la planilla
│   ├── verify-asistencia.mjs  # promedios contra los de la planilla
│   ├── import-asistencia.mjs  # carga los meses viejos desde el .xlsx
│   ├── verify-coach-metrics.mjs # metricas de la ficha + camino coach->alumno
│   ├── check_ui.py            # headless: falla si una ruta no hidrata
│   ├── check_pwa.py           # headless: instalable y ABRE SIN RED (contra next start)
│   ├── gen_iconos.py          # rasteriza favicon.svg a los PNG del manifest
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

**Desde la v04 el catalogo se sincroniza entero** (`lib/repo/catalog.js`), incluidos los
ejercicios que todavia no estan en ningun programa. El dueno es el USUARIO
(`exercises.owner_user_id`), no el coach: un atleta que entrena solo no tiene fila en
`coaches`, y con el modelo anterior sus ejercicios propios solo podian guardarse como
catalogo base de todo el mundo.

Los ids del catalogo base (`base-<slug>`) son universales y **no se prefijan**: si cada
usuario subiera el suyo, el mismo ejercicio de siempre seria uno distinto por persona.
El resto lleva el prefijo del dueno, como todo lo demas.

### Capa de datos (Turso)
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

Una cuenta nueva arranca **sin ningun programa**. Hasta el 2026-08-02 se instalaba
el Ciclo 2 de Agustin en toda instalacion, asi que cualquiera que entraba veia el
mesociclo de otro —con sus kilos y sus notas de lesion— sin forma de saber que no
era suyo. Ahora la pantalla vacia ofrece: sincronizar (por si un entrenador ya le
asigno uno), crear, cargar un `lib/programa-basico.js` neutro, o importar Excel.

El Ciclo 2 vive en `lib/seed-ciclo2.js` y solo alimenta `npm run gen:programa`.
Fuente de verdad **externa** al repo:
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

## Medidas corporales

`body_measurements` guarda todo en `values_json`, asi que agregar una
circunferencia NO necesita migracion: el conjunto de campos lo define
`lib/medidas.js` y la base solo lo transporta.

Las formulas salen de la planilla original y estan verificadas contra sus
numeros, no reconstruidas de memoria. Dos que importan:

- **El FFMI es el NORMALIZADO** (corregido a 1.80 m): `magra/h² + 6.1 × (1.8 − h)`.
  El crudo da 21.12 donde la planilla dice 21.49.
- **La masa grasa MEDIDA le gana a la calculada.** La bascula la da; calcularla
  del porcentaje da 63.93 de masa magra donde la planilla dice 63.95.

La asimetria entre lados es `(I − D) / D`. No es un adorno: da -4.8% en el brazo,
que es exactamente el numero que motiva el protocolo ASIM-IZQ del SEED. La
planilla medía el problema y el programa tenia la solucion, pero nada los unia.

## Asistencia

Dos preguntas distintas que la planilla tenia y conviene no mezclar:

- **Adherencia** (`lib/coach/metrics.js`): sesiones hechas contra programadas en
  los ultimos 7 dias. Es la de la ficha del entrenador.
- **Asistencia** (`lib/asistencia.js`): dias de gimnasio por mes, con promedio
  historico y promedio desde un corte. Es la larga, la que dice si el habito se
  sostiene.

**DIAS, no sesiones.** Entrenar dos veces un martes es un dia de gimnasio.

Se combinan dos fuentes: lo que la app registro se calcula del historial y NO se
guarda, y los meses previos se cargan a mano (`attendance_months`). Lo manual
manda sobre lo calculado —el mes en que se empezo a usar la app tiene tres
sesiones y nueve dias reales— y no se toma el maximo, porque corregir hacia
abajo tiene que ser posible.

Un mes sin entrenar es un CERO y no un hueco; el mes en curso queda fuera de los
promedios. Las dos cosas mueven el promedio para arriba si se hacen mal.

## PWA (fase 6)

`public/sw.js` esta escrito a mano y sus reglas estan en su encabezado. Las dos
que no se negocian:

- **`/api/**` NUNCA se cachea.** Ahi vive la sesion y los datos de otras
  personas; una respuesta de sesion cacheada es la app mintiendo sobre quien sos.
- **No se llama a `skipWaiting()`.** Tomar el control de una pestaña abierta
  puede hacer que React pida un chunk que la version nueva ya no tiene — y eso
  pasaria a mitad de una serie. Un dia de demora en actualizar es barato;
  perder una sesion registrada no.

La navegacion es RED-primero (un deploy se ve enseguida, y el cache es el
respaldo sin señal) y los estaticos son CACHE-primero (Next les pone hash: una
version nueva es una URL nueva).

**Interceptar los estaticos NO alcanza, y esto ya rompio la app instalada.** En
la PRIMERA visita el service worker se activa DESPUES de que la pagina pidio sus
scripts, asi que no los ve pasar y no los guarda: quedaba el HTML cacheado y
cero JavaScript, y la app instalada se quedaba en el splash para siempre. Por
eso la pagina, al terminar de cargar, le MANDA al service worker la lista de lo
que uso (`performance.getEntriesByType('resource')`) y recien ahi se guarda. La
lista sale de lo que el navegador pidio de verdad, no de una escrita a mano que
se desactualiza en el proximo build.

**Probar el modo offline recargando una pagina ya cargada no prueba nada.** Dos
trampas que dejaron pasar ese bug: Next pre-renderiza `/`, asi que el texto de la
pantalla esta en el HTML cacheado aunque el JS no cargue nunca —hay que
comprobar que la app REACCIONE—; y Chrome sirve los scripts de SU cache HTTP
aunque el service worker no tenga nada, asi que hay que vaciarlo
(`Network.clearBrowserCache` por CDP) antes de cortar la red. `check_pwa.py`
hace las dos cosas.

**En desarrollo el service worker NO se registra**, y si quedo uno de una prueba
anterior se desregistra solo. Es el gotcha de "un puerto, un proyecto" elevado:
un SW sirve assets viejos y la app compila, responde 200 y muestra otra cosa.
Para probarlo: `?sw=1` en dev, o `npm run build && npm start` (que es lo que
verifica `npm run verify:pwa`).

**La URL de produccion es `https://forge-v2-five.vercel.app`** (alias del proyecto
`forge-v2` en Vercel). La CLI esta autenticada: `npx vercel ls` lista los deploys
y `npx vercel inspect <url>` muestra los alias. Vale verificar contra ESA url
antes de dar por bueno un arreglo — `check_pwa.py --base <url>` corre entero
contra produccion.

**Sin `skipWaiting`, la version nueva queda ESPERANDO y su cache arranca vacio.**
Por eso la pagina le manda la lista de archivos al que controla Y al que espera:
comparten cache, asi que el que espera puede dejarlo listo antes de tomar el
control. Sin eso, la primera apertura despues de una actualizacion era en blanco
— justo lo que le paso a la app ya instalada al recibir el arreglo anterior.

**El Perfil muestra el estado del modo offline** (sin registrar / esperando /
listo, con el conteo de archivos). Diagnosticar esto en un telefono sin devtools
es imposible, y "no abre sin conexion" son tres problemas distintos con tres
arreglos distintos.

**La navegacion tiene RELOJ.** Sin señal `fetch` no falla rapido —el sistema
tarda en darse por vencido— y mientras tanto la app instalada se queda en el
splash. Se veia como "abre en blanco, salgo, vuelvo a entrar y ahora si". Si
`navigator.onLine` dice que no hay red se va derecho al cache; si dice que si
pero no contesta en 2 segundos, tambien.

**Cada navegacion se guarda bajo SU url ademas de como shell.** Sin lo primero,
`/entrenador` sin red caia al shell de `/` y dibujaba la app del atleta con la
direccion del entrenador en la barra: peor que un error, porque no se nota.

**El boton atras de Android** se maneja apilando estado en el historial
(`popstate` en ForgeApp): cierra pantallas superpuestas, despues vuelve a
Entrenar, y recien ahi pregunta si se quiere salir. Una PWA instalada no tiene
barra de navegacion, asi que por defecto el atras salia de la app — a mitad de
un entrenamiento eso es perder la sesion por un gesto reflejo.

**Ojo con `get_by_text` en los tests de navegador.** "Como llegaste a entrenar"
contiene "entrenar", asi que `get_by_text("Entrenar").first` dejo de ser la
pestaña y varias suites se rompieron a la vez. Las pestañas se tocan por
`.tabbar button` y su indice.

**Si el service worker rompe algo en produccion**, el escape es deployar un
`sw.js` cuyo unico contenido sea `self.registration.unregister()`: los
navegadores revalidan ese archivo en cada navegacion y se despublica solo.

**Sin red, `/api/auth/session` falla y next-auth responde "no autenticado".** Es
correcto como estado momentaneo y falso como conclusion. La app guarda el ultimo
perfil conocido (`perfilLocal`) y lo usa para dos cosas: no decir "Entrar" a
alguien que tiene cuenta, y marcar como pendiente de subir la sesion que se
termino sin señal — que era justo el caso para el que se escribio ese aviso.

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

El circuito completo vive en `/entrenador`: duplicar, adaptar y asignar. El editor
escribe DIRECTO en el servidor (`PUT /api/coach/programa`), no pasa por el
localStorage del atleta, y lo que guarda le llega al alumno al sincronizar porque
un programa asignado se reemplaza entero. Cambiar el ejercicio de una fila que ya
tiene series es una SUSTITUCION tambien aca: id nuevo, para que el e1RM no
encadene dos maquinas distintas.

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
6. ~~PWA offline: instalable, abre sin red, sin romper el deploy~~ Done

### Dos cosas del sync que ya rompieron

**Entre dos versiones de un programa gana la editada DESPUES, salvo si es
asignado.** Lo decide `mergePrograms` con `updatedAt`, que es la marca de cuando
lo toco el USUARIO y no de cuando se subio. Un programa asignado se reemplaza
siempre: el alumno no pudo haberlo tocado, y no reemplazarlo significaba que una
correccion del entrenador no llegaba nunca.

La regla anterior era "lo local gana siempre", para no pisar algo que se
estuviera editando durante el pull. Esa proteccion sigue en pie —lo que se acaba
de tocar es lo mas nuevo— pero como regla absoluta hacia algo peor que el
problema: el dispositivo desactualizado volvia a subir su copia vieja y DESHACIA
en el servidor lo recien editado. `saveProgram` ademas rechaza toda escritura
mas vieja que la guardada, asi que el orden de sincronizacion ya no decide nada.

**Borrar un programa necesita una lapida.** El pull manda lo que existe, y de una
lista no se deduce que falta por borrado y que falta porque el otro dispositivo
no subio todavia. El cliente guarda los ids borrados y los avisa al sincronizar;
la lapida se suelta cuando el servidor deja de devolver ese programa.

**Los emails se comparan CANONICAMENTE, no como texto.** En Gmail los puntos del
nombre de usuario no cuentan: invitar a `abc@gmail.com` y registrarse como
`a.bc@gmail.com` es la misma persona y el mail llega igual. Ver `lib/email-id.js`.
La canonicalizacion es por dominio a proposito: sacar los puntos en un dominio
cualquiera uniria a dos personas distintas. Desde la v05 aplica tambien a `users`: `email_canon` es la clave de
comparacion y `email` sigue siendo lo que la persona escribio. Las dos puertas
que resuelven o crean usuarios —`findOrCreate` y el adapter de NextAuth—
preguntan por casilla y preguntan ANTES de insertar, porque `ON CONFLICT (email)`
solo protege contra la misma grafia y esa nunca fue la que fallaba.

El fallback exacto se queda: sin el, una cuenta anterior al backfill dejaria de
encontrarse y su dueno entraria a una nueva y vacia. El backfill
(`npm run backfill:email`) se niega a fusionar — si dos cuentas resultan la misma
casilla lo informa y no escribe nada, porque unir dos historiales es una decision
de producto.

### Deuda conocida

- **`health_consents` se graba pero no hay UI que lo pida ni que lo revoque.**
  Postergado por decision explicita (2026-08-02): el trato con los alumnos es
  personal y la app es una herramienta, no el vinculo.

---

## Documento de referencia

`forge-arquitectura.md` contiene el diseno tecnico completo:
- Schema Dexie/PostgreSQL target
- Modelo coach/athlete
- Import Excel (SheetJS)
- Wireframes de todas las pantallas
- Formulas y reglas de negocio

Usarlo como guia para decisiones de arquitectura, pero la implementacion actual es MVP simplificado (localStorage, sin auth, sin sync).
