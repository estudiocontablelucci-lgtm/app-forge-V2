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
│   ├── Ayuda.jsx          # el "?" que explica, en la pantalla donde nace la duda
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
│   ├── anterior.js        # la vez pasada: la ultima semana CON DATOS, una sola
│   ├── medidas.js         # medidas corporales: derivadas, proporciones, asimetrias
│   ├── asistencia.js      # dias de gimnasio por mes, promedios, racha
│   ├── descanso.js        # el descanso como VENCIMIENTO + las preferencias
│   ├── aviso.js           # beep agendado en el grafo de audio, vibracion, notificacion
│   ├── sync/              # ids.js (prefijos), service.js, client.js
│   └── repo/              # users, programs, training, coaching, catalog, medidas, asistencia
├── db/
│   ├── v01_init.sql       # dominio multi-tenant
│   ├── v02_auth.sql       # tablas de NextAuth
│   ├── v03_coach.sql      # tabla exercises + program_exercises.exercise_id
│   ├── v04_catalogo_por_usuario.sql # el catalogo es del usuario, no del coach
│   ├── v05_email_canon.sql # la cuenta es la casilla, no la grafia
│   ├── v06_asistencia.sql # meses de asistencia anteriores a la app
│   ├── v07_dropset.sql    # escalones de la serie (set_logs.steps_json)
│   ├── v08_notas_vistas.sql # cuando el coach leyo las notas de cada alumno
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
│   ├── check_coach_ui.py      # headless: la seccion de entrenador, con 2 sesiones
│   ├── check_programa_ui.py   # headless: solo lectura, la ficha y los borrados
│   ├── verify-anterior.mjs    # la vez pasada, contra una reproduccion del bug viejo
│   ├── check_anterior_ui.py   # headless: se muestra y NO prellena, dentro del deload
│   ├── verify-descanso.mjs    # el vencimiento, la restauracion y las preferencias
│   ├── check_descanso_ui.py   # headless: el cronometro, con el reloj adelantado
│   └── check_perfil_ui.py     # headless: orden, secciones plegadas y renglones
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

**Mover un ejercicio de dia o de posicion NO es una sustitucion** — es la misma maquina otro dia,
asi que conserva su id y con el sus series y su e1RM. El editor lo pregunta con dos selects
(`.ed-donde`): el dia, y **"va despues de"** en vez de un numero de orden, porque el numero
obliga a contar filas para responder algo que la pantalla de al lado ya muestra ordenado.
`reubicar()` renumera `order` 1..n en TODOS los dias despues de mover: dos ejercicios con el
mismo numero quedan en un orden que nadie eligio, y mudar uno deja el dia viejo con un salto.

Dos cosas que se van con la mudanza: **la superserie se suelta en los dos sentidos** (agrupa
ejercicios que se hacen uno atras del otro; en otro dia no significa nada) y **la app avisa a
donde se fue**, porque el ejercicio desaparece de la pantalla que se esta mirando y sin el aviso
guardar se ve igual que borrar. Hasta la fase 8 esto solo se podia haciendo `npm run gen:programa`
y reimportando el Excel.

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

**La fuente de verdad es EXTERNA al repo y se queda afuera.** Este repo es
PUBLICO y ahi hay datos de salud —diagnosticos, restricciones medicas— que bajo
la Ley 25.326 son dato sensible. Un `.gitignore` es una convencion, no una
proteccion: un `git add -f` distraido publica para siempre.

Viven en `OneDrive/Documentos/Organizacion Personal/Salud/Sistema cronobiologico/Claude/`.
**Reorganizada el 2026-08-08** en tres niveles con precedencia explicita:

| Ruta | Que es |
|---|---|
| **`00-indice.md`** | **Se lee primero.** Mapa, precedencia y las cuatro reglas de la carpeta |
| `criterios/` | **ESTABLE, gobierna todo lo demas.** `criterios-programa.md` (C1-C9: seleccion, orden, escalera, cobertura, tecnica), `criterios-progresion.md`, `contexto-medico.md`, `protocolo-medicion.md` |
| `programa/programa-vigente.md` | **Manda sobre toda decision actual:** slots, refs, orden, tecnicas |
| `registro/` | **Historico. No se consulta para decidir.** Auditorias, ciclos cerrados |
| `CAMBIOS.md` | Changelog unico, una linea por decision |

**Ningun archivo vigente lleva numero de ciclo en el nombre.** `programa-vigente.md` siempre
apunta al actual; los archivados llevan fecha. Es la regla que evita lo del 04/08/2026, cuando
habia tres copias de `programa_tecnicas_ciclo2` y una compartia nombre exacto con la vigente.

**Vigente desde el 2026-08-08: Ciclo 3** — 4 dias (A/B/C fullbody DUP + D de especializacion),
36 ejercicios, 111 series semanales. `ASIM-IZQ` esta **suspendido** por no haberse ejecutado
nunca (0 series en 8 sesiones del Ciclo 2).

**El programa NO vive en el repo y `npm run gen:programa` lo lee de afuera.** La ruta esta en
`scripts/rutas.mjs` y en ningun otro lado, escrita y no derivada de `__dirname`; los datos, en
`programa/programa-vigente.mjs` de la carpeta de Salud — mismo nombre base que el `.md`, que es
la regla 4 de esa carpeta. `lib/seed-ciclo2.js` se queda como historia y como fuente del
verificador de import, que ya no depende de `data/`.

**El generador valida y ademas hace round-trip.** Valida lo que el archivo puede contradecir de
si mismo (superseries mutuas y dentro de la sesion, ordenes 1..n, tecnicas que existen) y
despues **relee el .xlsx que acaba de escribir con los helpers de import reales** de
`ForgeApp.jsx`. Sin eso, una columna que el auto-mapeo no reconoce se pierde en silencio y el
programa importado se ve perfecto: las tecnicas y las superseries son justo lo que no se nota
que falta hasta estar en el gimnasio.

**Al transcribir el `.md`, las cuentas del original no cerraban por uno** y se resolvio a favor
del detalle: las cuatro tablas de sesion suman 111 y la tabla de volumen por grupo tambien,
contra un titular que decia 110. El generador imprime el volumen por grupo justamente para
poder cruzarlo contra el documento.

**Restriccion medica que condiciona la seleccion de ejercicios:** discopatias lumbares
incipientes L3-S1. Lo que gobierna es la **flexion lumbar bajo carga, no la carga axial en si**
— el informe del radiologo no contiene la palabra "axial" ni menciona ejercicios, y por eso
conviven trap bar a 115 kg y prensa a 140 con la lista de prohibidos.

**Nunca** proponer back squat, front squat, peso muerto convencional ni good mornings pesados.
Sustitutos validos en uso: sentadilla pendular, prensa 45, trap bar, hip thrust, hack squat,
extension lumbar liviana.

**Isotretinoina activa hasta ~28/02/2027:** sin test de maximos ni PRs. Ver
`criterios/contexto-medico.md`.

`npm run gen:programa` genera `data/*.xlsx` para importar por el wizard (el SEED solo aplica a
instalaciones nuevas). `npm run verify` corre las suites sin navegador (255 checks).

Para lo que el verify no ve, que es donde aparecieron los ultimos bugs, hay tres
verificadores con navegador: `npm run verify:ui` (generico),
`npm run verify:programa-ui` (la pantalla Programa: que deja tocar un programa
asignado, que contesta la ficha de un ejercicio y con que se pregunta antes de
borrar — sin cuenta ni base) y `scripts/check_coach_ui.py` (la seccion de
entrenador, con dos sesiones reales). Ver `docs/e4-seccion-entrenador.md` para
como levantarlos.

Los datos de salud (lesiones en `description` y `note`) son **dato sensible** bajo la Ley 25.326
cuando son de terceros. Antes de onboardear un alumno real hace falta consentimiento expreso —
la tabla `health_consents` existe para registrarlo, pero todavia no hay UI que lo pida.

---

## Medidas corporales

`body_measurements` guarda todo en `values_json`, asi que agregar una
circunferencia NO necesita migracion: el conjunto de campos lo define
`lib/medidas.js` y la base solo lo transporta.

**El peso corporal se carga CON las medidas y no en el Perfil.** Ahi vivio como un
numero suelto en `users.body_weight_kg`: sin fecha, y al corregirlo no quedaba
rastro del anterior — o sea, ninguna evolucion posible — mientras
`body_measurements` guardaba una toma por fecha desde el primer dia. Dos lugares
para el mismo dato, y el que servia estaba escondido detras de "Ver mis medidas".
El Perfil ahora lo MUESTRA (ultimo valor y su fecha) y lleva a cargarlo.

**El peso corporal ES la carga en dominadas y fondos.** En un ejercicio con
`refKg: "BW"` el campo de kilos es el LASTRE —la pantalla de Entrenar lo rotula
"+KG"— asi que ocho dominadas se registraban con `kg` vacio y valian CERO: fuera
del tonelaje y sin e1RM. La app decia que no habias movido nada mientras te
levantabas ochenta kilos ocho veces. `cargaEfectiva()` en `lib/formulas.js` suma
las dos cosas; sin peso conocido devuelve null y el ejercicio queda afuera, que
es el comportamiento de siempre.

**Y el peso que entra es el VIGENTE A ESA FECHA** (`pesoVigente()` en
`lib/medidas.js`), no el de hoy. Es la razon por la que el peso tuvo que dejar de
ser un numero suelto: con uno solo, bajar tres kilos reescribia hacia atras el
e1RM de cada dominada que hiciste en tu vida. Entrenar antes de haberse medido
usa la primera medicion que exista — aproximar es mejor que dejar las primeras
semanas sin e1RM.

Va en las dos puntas: la pantalla de Progreso del atleta y la ficha del
entrenador (`cargaConPeso` en `lib/coach/metrics.js`, con las medidas del
alumno). Si estuviera en una sola, los dos verian un e1RM distinto del mismo
ejercicio, que es justo lo que ese modulo existe para evitar. `set_logs.e1rm`
sigue guardando el de la carga EXTERNA: nadie lo lee para mostrar —las dos
pantallas recalculan— pero conviene saberlo antes de usarlo.

`npm run verify:bodyweight` cubre las dos funciones y el camino del coach.

**La evolucion se ve en Progreso** (`components/EvolucionMedidas.jsx`), que es
donde uno va a preguntarse si algo cambio; cargar sigue en su pantalla. **UNA
metrica por vez, con selector**: peso (kg), grasa (%) y cintura (cm) no comparten
escala, y meterlas en el mismo grafico obliga a dos ejes — que es la trampa mas
comun de un grafico y hace que dos series se crucen donde el dato no se cruza.

**Y sobre el PESO la app no opina.** El color del cambio dice "fue para donde
queria ir": abajo en grasa y cintura, arriba en masa magra y FFMI. El peso no
tiene direccion buena —en una recomposicion ese mismo −2 kg es exactamente el
plan— asi que va en gris. `npm run verify:medidas-ui` lo cubre.

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

**"Hay red ahora" y "el modo offline esta listo" son dos cosas distintas.** El
Perfil decia "Modo sin conexión: listo" y se leia como "estas sin conexion": con
la red ya de vuelta, la app parecia trabada. Ahora el estado real va primero y
aparte ("Ahora mismo: con conexión") y la capacidad se llama "Funciona sin
conexión". El aviso de que falta la red aparece en Entrenar, no escondido en el
Perfil.

**Al volver la red la app se pone al dia sola** (`online` en ForgeApp: refresca
la sesion y sincroniza). El pull automatico corre UNA vez al abrir; si esa vez no
habia señal, nadie lo reintentaba y la app se quedaba con lo local hasta
reiniciar del todo.

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
Entrenar, y recien ahi pregunta si se quiere salir.

**La cadena tiene que incluir TODAS las superpuestas, y en orden de arriba hacia
abajo.** Faltaban la ficha de descripcion, la confirmacion y los tres editores:
el atras las salteaba y movia la app de ABAJO, asi que la caja quedaba flotando
sobre otra pantalla y el gesto parecia no hacer nada cuando en realidad hacia de
mas. Al agregar una pantalla superpuesta, agregarla tambien ahi. Una PWA instalada no tiene
barra de navegacion, asi que por defecto el atras salia de la app — a mitad de
un entrenamiento eso es perder la sesion por un gesto reflejo.

**`navigator.onLine` dice si hay INTERFAZ de red, no si se llega a internet.**
Con wifi sin salida contesta que si. Sirve para enterarse de los CAMBIOS y para
el CORTE (si dice que no hay interfaz, no hay red y punto: falsos negativos no
existen). Para la vuelta hay que PREGUNTAR: `hayServidor()` consulta
`/api/ping` con reloj de 2,5s.

**Esperar a que algo falle no es enterarse.** Sin senal `fetch` no falla
rapido, asi que la app afirmaba "con conexión" varios segundos con el telefono
en modo avion. Todo lo que informa estado de red lleva reloj: el ping, el
pedido del Perfil y `pullAll`. Los PUSH no: abandonar una escritura que el
servidor quiza acepto es otra cosa.

**Cortar la red en un test no reproduce estar sin senal.** `set_offline` hace
fallar los pedidos al instante; el telefono los deja COLGADOS y
`navigator.onLine` sigue diciendo que hay wifi. Por eso este bug pasaba los
tests. `check_pwa.py` simula el caso real reteniendo las rutas de `/api/` sin
contestarlas nunca.

**El boton de cuenta no puede esperar a que next-auth resuelva.** Tenia
`if (status === "loading") return null` para evitar un parpadeo, y sin red esa
consulta se cuelga: el boton desaparecia hasta minimizar la app y volver. Con un
perfil conocido no hay parpadeo posible, asi que se dibuja de una.

**Ojo con `get_by_text` en los tests de navegador.** "Como llegaste a entrenar"
contiene "entrenar", asi que `get_by_text("Entrenar").first` dejo de ser la
pestaña y varias suites se rompieron a la vez. Las pestañas se tocan por
`.tabbar button` y su indice.

**Si el service worker rompe algo en produccion**, el escape es deployar un
`sw.js` cuyo unico contenido sea `self.registration.unregister()`: los
navegadores revalidan ese archivo en cada navegacion y se despublica solo.

**Cerrar sesion tiene que OLVIDAR el perfil, y esto dejo el programa de una persona en la
cuenta de otra.** `perfilLocal` existe para que sin señal la app no le diga "Entrar" a quien
tiene cuenta. Pero al cerrar sesion el servidor responde EXACTAMENTE lo mismo que sin red —"no
autenticado"— asi que la app no podia distinguir *me fui* de *no hay señal*: seguia mostrando al
usuario adentro, con el cartel de "Sin conexión", para siempre. Lo que las separa no es una
respuesta del servidor sino que **cerrar sesion es un acto deliberado**: estar sin red nunca
borra el perfil, tocar el boton siempre lo borra. Mismo error de forma que el del beep — una
señal con dos significados.

`cerrarSesion` limpia ademas **programas, historial y catalogo**: son de la cuenta que se va, y
si quedan, la cuenta siguiente los MERGEA y los sube como propios. El servidor ya los tiene.
`limpiarEstado()` cancela el guardado con debounce de `saveState`, o el estado de la cuenta
vieja se re-escribe 500 ms despues de haberlo borrado.

**El test de esto pasaba sin el arreglo.** `signOut` redirige a `NEXTAUTH_URL`, que en
desarrollo es otro puerto: otro ORIGEN, con otro `localStorage`, vacio. Leerlo ahi da "olvidó el
perfil" siempre. Hay que volver a `--base` antes de mirar.

**Sin red, `/api/auth/session` falla y next-auth responde "no autenticado".** Es
correcto como estado momentaneo y falso como conclusion. La app guarda el ultimo
perfil conocido (`perfilLocal`) y lo usa para dos cosas: no decir "Entrar" a
alguien que tiene cuenta, y marcar como pendiente de subir la sesion que se
termino sin señal — que era justo el caso para el que se escribio ese aviso.

## El descanso entre series (fase 8)

**El descanso se guarda como VENCIMIENTO, no como cuenta regresiva.**
`lib/descanso.js` guarda `fin` (milisegundos de reloj) y lo que queda se DERIVA
cada vez que se mira. La version anterior restaba 1 por segundo dentro de un
`setInterval`, y un intervalo se congela con la pagina: al volver de bloquear el
telefono, el descanso "de 2 minutos" seguia marcando 1:47 porque los 40 segundos
que la app estuvo dormida no los conto nadie. Sale gratis que sobreviva a que el
sistema mate la app: guardado como vencimiento, restaurarlo es leerlo.

**Cambiar de pestaña NO lo cancela.** Lo cancelaba a proposito una linea en la
tabbar. El descanso es tiempo real: sigue corriendo aunque uno mire el
historial. La barra se dibuja fuera de las pestañas.

**El beep se AGENDA en el grafo de audio, no se dispara con un `setTimeout`.**
Con la pantalla apagada el navegador congela la pagina: los temporizadores no
corren, `navigator.vibrate` no dispara y no hay API de notificacion programada
que sirva (Notification Triggers quedo en experimento). El grafo de audio corre
en su propio hilo, asi que `osc.start(t)` en tiempo absoluto suena aunque nadie
vuelva a ejecutar una linea de JS.

**"No sono" y "ya sono" NO son la misma respuesta, y confundirlas dejaba el descanso mudo.**
`beepPendiente()` daba false en dos situaciones distintas —el agendado ya salio, y nunca hubo
agendado— y `sonarAhora` trataba las dos como "listo, no hago nada". Cualquier descanso que
llegara sin beep agendado vencia en silencio, sin aviso y sin senal de que el aviso no estaba
armado. Ahora existe `beepArmado()` y la regla es: **ante la duda suena.** Un aviso de mas se
ignora; uno de menos deja a alguien parado al lado de la maquina mirando el telefono.

**El camino que llegaba sin agendar es el descanso RESTAURADO.** Si el sistema mata la app a
mitad de serie —pantalla apagada, telefono en el banco, o sea el caso normal— al volver el
cronometro se lee del disco y cuenta bien, pero el grafo de audio arranco de cero. `agendarBeep`
solo se llamaba al CREAR el descanso. Y no se puede agendar al restaurar: hace falta un gesto
del usuario y al abrir la app no hubo ninguno, asi que ForgeApp se engancha al primero que
venga. Los dos defectos se tapaban entre si, que es por lo que el sintoma era "a veces no suena".

`npm run verify:aviso` cubre el modulo entero con un doble del grafo de audio: **no tenia una
sola verificacion**, siendo el unico canal que viene prendido por defecto. Y
`npm run verify:aviso-ui` prueba el camino que el nodo no alcanza —el descanso restaurado— en
un navegador real: **un beep se MIRA espiando el grafo**, no se escucha. Un `AudioContext`
instrumentado antes de que cargue la app anota cada oscilador con su frecuencia y su hora, y
ahi 30 Hz sin hora es el tono de sosten y 880/1175 con hora futura son los pulsos agendados.

**Preguntar si el audio esta vivo NO puede ser un intento de despertarlo.** El primer arreglo
usaba `despertarAudio()` al montar, y sin gesto el navegador deja la promesa de `resume()`
PENDIENTE en vez de rechazarla: quedaba un intento colgado que revivia junto con el del gesto y
agendaba dos veces. Taparlo con un flag "estoy armando" fue peor —el flag quedaba trabado en el
intento que nunca resolvia y bloqueaba el del gesto, que es el unico que importa: cero beeps.
Por eso existe `audioVivo()`, que mira `ctx.state` y no toca nada.

**Y para que el grafo no se suspenda, suena un tono de 30 Hz a volumen 0,0015.**
Ningun parlante de telefono reproduce 30 Hz, pero para el navegador la pagina
esta emitiendo audio y no la congela. Si igual se congela, `beepPendiente()` lo
delata —el reloj del AudioContext se paro con la pagina— y el beep se toca al
volver en vez de tragarse el aviso.

**Preferencias en el Perfil** (`prefs` en el localStorage): cronometro, sonido,
vibracion, notificacion y ayudas. La notificacion arranca APAGADA y el permiso se
pide al prenderla: un pedido que aparece sin que nadie lo haya buscado se rechaza
de un dedo, y un `denied` no se puede volver a preguntar nunca mas.

**`Page.setWebLifecycleState: frozen` por CDP no reproduce el congelamiento.** En
Chromium headless los intervalos siguen corriendo, asi que el check pasaba
tambien con el bug puesto — confianza falsa, que es peor que no tener check. Lo
que si lo reproduce es el reloj de Playwright: `pause_at` deja los temporizadores
quietos y `set_system_time` adelanta la hora sin dispararlos. **Los dos reciben
SEGUNDOS**; pasarles un `Date.now()` crudo manda el reloj al año 58.000.
`npm run verify:descanso-ui` lo corre entero, sin cuenta ni base de datos.

**Los avisos de la app no son `alert()`.** En el telefono un `alert()` es una caja
del sistema operativo: bloquea la app, no se parece en nada al resto y hay que
tocarla para seguir. El candado del programa usa `.toast`, que flota sobre la
tabbar y se va solo. Para lo que SI es una decision esta `confirm-box`.

**Y los borrados tampoco son `confirm()`.** Borrar una sesion y borrar un programa
eran las dos ultimas cajas del sistema que quedaban, justo en las dos decisiones
destructivas — en una PWA instalada eso delata que abajo hay un navegador. Van por
`confirmarBorrado` (`{ mensaje, detalle, textoOk, onOk }`), que ademas dice **que
se lleva puesto**: "se van con ella 2 ejercicios" es lo que hace falta para
decidir, y `window.confirm` no tiene donde ponerlo. Dos cosas al agregar otro:
la caja se dibuja **al final del JSX** —todos los `.overlay` comparten z-index,
gana el ultimo del DOM y esta se abre desde adentro de otro editor— y va **primera
en la cadena del boton atras**, por lo mismo.

**El Perfil se lee de un vistazo o no se lee.** Paso de tres tarjetas a seis y
para llegar a "Entrenar a otros" habia que bajar por veinte lineas de
preferencias. Orden: Perfil → puerta al entrenador → **Configuración** →
**Conexión y sincronización**, las dos ultimas plegables (`.sec`) y plegadas por
defecto. **Cada una lleva un resumen en el encabezado**: sin eso, plegar la de
conexion escondia el unico diagnostico que hay para "no abre sin señal" en un
telefono sin devtools, y el arreglo habria sido peor que el problema.

Corolario para los tests: **"Sincronizar ahora" ya no esta suelto**, vive dentro
de esa seccion. `check_coach_ui.py` la abre con `sincronizar_a_mano()`.

**Un titulo y su explicacion en dos `<span>` es una sola linea.** Se leia
"Cronómetro de descansoArranca solo al cerrar cada serie". Un `<span>` es en
linea: para que sean dos renglones hace falta `display: block`. `check_perfil_ui.py`
lo vigila comparando la POSICION en pantalla de los dos, no el CSS.

**EL TITULO es el selector de programa.** Paso por tres formas y las dos primeras
fallaron por lo mismo: un hamburguesa suelto significa "el menu de la app", y un
boton rotulado al lado del titulo le disputa el ancho justo a lo unico que la
pantalla existe para mostrar — con el avatar de cuenta reservando 46px arriba a la
derecha, quedaba flotando contra el segundo renglon del nombre. Tocar el nombre
para cambiar de programa es el patron de mobile, no cuesta ancho, y el `▾` es lo
que lo delata. El nombre se parte en TRES renglones antes que cortarse: "Hipertrofia
…" no identifica a un programa, y es el dato que esa pantalla existe para mostrar.

**La lista de programas pliega por grupo**, y arranca abierto el del programa que
se esta entrenando. Con un solo grupo no se dibujan encabezados. Ojo con el
atributo `hidden` para esto: pone `display: none` con la especificidad del
navegador y `.prog-list` lo pisa con su `display: flex` — los grupos se veian
"cerrados" con todas las tarjetas a la vista. Se resuelve no renderizando.

**El Historial se agrupa por semana y cada sesion dice como fue sin abrirla**:
duracion, tonelaje, cuantos ejercicios, y **cuantos quedaron en cada color del
semaforo**. El semaforo ya existia adentro y habia que desplegar la sesion para
verlo ejercicio por ejercicio. Adentro, **cada serie es una pastilla**: corridas
en una linea monoespaciada —"120×10 @4 130×10 @3"— hay que contar donde termina
cada una. Y la **nota que se escribe al cerrar la sesion** ahora se ve ahi: se
guardaba, viajaba al entrenador y el propio autor no la volvia a leer nunca.

**El boton de Excel esta al PIE.** Arriba le disputaba el lugar al titulo, igual
que el selector de programa: exportar es lo ultimo que se hace en esa pantalla.

**Los catorce campos del editor de ejercicio estan en tres secciones plegables**
(`EdSec`). Arriba queda lo que se cambia seguido —que ejercicio, donde va, series,
reps, ref, RIR—; abajo, plegado, lo que se define una vez al escribir el programa:
"Cómo se ejecuta" (descanso, tempo, unidad, superserie, tecnica), "Referencias por
semana" y "Notas". **Cerrada, cada seccion muestra un RESUMEN de lo que tiene**, y
se abre sola si hay algo cargado: sin eso plegar no ordena, esconde — y quien busca
por que ese ejercicio tiene dropset no encontraria nada. Es la misma regla que el
Perfil. Las tres se ven IGUAL: tres plegables con estilos distintos entre si es
otra vez el problema que esto vino a resolver.

**MIRAR un programa y ENTRENARLO son dos cosas distintas, y eran la misma
variable.** Abrir uno de la lista para ver que tenia lo dejaba activo, y el activo
gobierna Entrenar, Historial y Progreso: revisar la rutina que le escribiste a un
alumno te cambiaba la tuya, sin haber tocado nada mas que una tarjeta.
`activeProgramId` es EL QUE SE ENTRENA y no lo cambia nadie sin pedirlo; `vistoId`
es lo que muestra la pestaña Programa (en null mira al activo, que es el caso de
siempre). El detalle y sus editores trabajan sobre las derivadas del visto
—`programaVisto`, `sesionesVistas`, `ejerciciosVistos`, `semanasVistas`,
`deloadVisto`, `esAsignadoVisto`— y `updateProgramaVisto` reemplaza a
`updateActiveProgram`: un programa que se puede abrir sin activarlo tambien se
tiene que poder corregir sin activarlo. Entrenar, Historial y Progreso siguen
leyendo el activo y no se tocaron.

Se activa a pedido: el boton de la barra amarilla (`.prog-revisando`), que ademas
dice cual seguis entrenando. Crear, importar y duplicar ABREN el programa nuevo y
solo lo activan **si no habia ninguno** — en una cuenta vacia no hay nada que
proteger. Y "Entrenar <dia>" al pie aparece solo en el activo: entrenar un dia de
otro programa seria cambiarse de programa sin decirlo.

**El atras, en Programa, vuelve a la LISTA.** El detalle esta un nivel adentro de
ella; saltar directo a Entrenar obliga a rehacer el camino entero para mirar el
programa siguiente. Va en la cadena de `popstate` justo antes del `setTab`.

**Y un lapiz suelto es el mismo error.** El de las sesiones vivia entre los chips
de dia —tercera fila, cuando el programa tiene cuatro— sin decir que abria. Ahora
"Editar programa" y "Editar días" son dos botones rotulados juntos (`.prog-acciones`),
debajo de los dias porque son lo secundario: primero se lee el plan.

**Los dias van en UN selector** (`.dia-sel`), no en chips. Con nombres de verdad
—"Volumen & Tempo", "Moderada & Variación"— entraba uno por fila y tres dias se
comian media pantalla antes del primer ejercicio; en una linea deslizable el
tercero quedaba fuera de la vista, que es lo mismo que no estar. Desplegado se leen
los tres enteros con su conteo, y **tocar afuera cierra** (`.dia-backdrop`): sin
eso la unica salida es volver a tocar el selector, que en un telefono nadie prueba.
Va tambien en la cadena del boton atras. Las SEMANAS de Entrenar siguen siendo
chips: son cortas y conviene verlas todas juntas.

**Lo que la pantalla Programa tiene que contestar sin abrir nada:** cuantos
ejercicios tiene cada dia (el numero estaba en el editor de sesiones, no donde se
elige), y por cada ejercicio el **RIR y el descanso** — el RIR es contra lo que el
semaforo juzga la serie y el descanso es lo que se mira ANTES de empezar; los dos
vivian solo adentro de Entrenar. El chip de tecnica usa `corto` de `TECNICAS`
("Isométrica"), no `nombre`: "Isométrica en estiramiento" entero ocupaba dos
renglones adentro de la fila.

**Y lo que sigue despues de leerla es entrenar ese dia**, asi que el boton esta ahi
(`.prog-entrenar-btn`, tambien en un programa asignado) y pasa por el mismo
`startSession` — si esa sesion ya tiene series cargadas, pregunta igual. Antes habia
que ir a Entrenar y volver a elegir el mismo dia. Un dia SIN ejercicios no lo ofrece
y dice por que: la lista vacia con un boton se veia como una pantalla rota.

**"sin ref" y no "máquina"** cuando el ejercicio no tiene referencia de carga. Leido
en la fila, al lado de un "140kg", "máquina" se lee como una unidad de peso — y
ademas no es lo que pasa: no hay ref cargada, que es distinto de que el ejercicio
sea en maquina.

**Las ayudas viven donde nace la duda, no en un tour.** Un tour explica todo el
primer dia, cuando todavia no hay ninguna pregunta, y no esta el dia que la
pregunta aparece. El punto de color del semaforo existia desde la primera version
sin una sola pantalla que dijera que significa: `SEM_LABELS` solo se usaba para
el export a Excel.

## Tecnicas de ejecucion (fase 7)

Hay DOS ejes y la app los venia mezclando. Confundirlos lleva a modelar el
dropset como ejercicios sueltos, que encadena el e1RM de dos cosas distintas:

- Lo que **agrupa ejercicios** (superserie, tri-set) es una relacion entre
  filas: FK `superset_with`. Ya existia.
- Lo que pasa **adentro de una serie** (dropset y familia) no tiene a quien
  apuntar: es un nivel mas de registro. Eso es `lib/tecnicas.js`.

**La columna `program_exercises.technique` existe desde la v01** con el
comentario `'DS' | 'ASIM-IZQ'`, y el repo ya la leia y la escribia — nunca la
escribio nadie. Guarda JSON (`{tipo, pasos, aplica}`) y tolera el string suelto,
para que una base vieja no quede ilegible. Agregar rest-pause o myo-reps es
agregar una entrada a `TECNICAS`, no una migracion.

**Los escalones viven DENTRO de la serie** (`set_logs.steps_json`, v07). Como
series aparte romperian el conteo, el tonelaje por serie y el e1RM. Mismo
criterio que `body_measurements.values_json`: el conjunto de campos lo define la
app y la base solo lo transporta.

**Suman en el tonelaje y NO entran al e1RM**, que sale solo de la serie
principal. "El maximo no puede bajar" mira media pregunta: no puede bajar, pero
puede SUBIR sin que haya mas fuerza. Con las refs reales, el gemelo sentado
(50x15 = 81.8) queda por debajo de su propio descuelgue a 38.8kg apenas pasa de
20 reps, y a 25 reps daria 116 — un +42% que se leeria como una mejora enorme.
Veinte reps en un descuelgue de gemelos es lo normal, no el caso raro. Y el
semaforo lee ese numero para decidir si subir carga.

**Entre escalones NO hay descanso**, ese es el punto. `serieCerrada()` decide
cuando arranca el timer: con la serie principal cargada pero escalones
pendientes, no arranca. Sin eso, sonaba justo cuando hay que bajar el peso y
seguir.

**El color codifica la FAMILIA, no la tecnica.** Teal `#0E8F9E` agrupa
ejercicios, violeta `#7A3FD4` pasa adentro de la serie, y cual es exactamente lo
dice el chip con el nombre — que ademas es lo que hace que no dependa solo del
color. Ninguno puede salir de la familia del semaforo (verde/amarillo/rojo): el
semaforo dice COMO TE FUE y la tecnica dice COMO SE HACE. La superserie era
naranja `#F5A623`, a un paso del amarillo del semaforo, y por eso cambio.

**El simbolo del chip sale de `TECNICAS`, no de la UI.** Estaba escrito a mano —una flecha
para abajo, "bajá el peso"— y con una sola tecnica pasaba por adorno. Con dos deja de serlo:
una flecha hacia abajo sobre una isometrica dice justo lo contrario de lo que hay que hacer.

**`ISO-EST` lleva `pasos: 0` y eso NO es un detalle.** No agrega nada que registrar, que es lo
que la separa del dropset. Con `pasos` en 1, `serieCerrada()` espera un escalon que nadie va a
cargar y **el descanso no arranca nunca** en ese ejercicio — comprobado poniendolo en 1 a
proposito. El clamp de `normalizar()` es por tecnica: aflojar el piso para la isometrica no
puede permitir un dropset de cero bajadas.

**Reimportar un programa que ya existe lo ACTUALIZA, no lo duplica** (`lib/importar.js`). Lo que
se protege no es la copia: los logs son `week|exId|setN`, asi que con ids nuevos las series
registradas quedan colgando del programa viejo y **desaparecen de la pantalla**, porque el activo
pasa a ser la copia. Es el flujo normal de este repo —editar `programa-vigente.mjs`,
`npm run gen:programa`, reimportar— asi que pasaria en cada revision del ciclo.

Se empareja por **sesion + nombre normalizado**, nunca por posicion: el orden es una de las cosas
que se reordenan al revisar un programa (el trap bar paso de cuarto a primero). Del ejercicio que
ya estaba se conservan tres cosas y solo tres: `id` (de el cuelgan los logs), `exerciseId` y
`refsByWeek` —las refs ya entrenadas son un HECHO, no una prescripcion—. Todo lo demas viene del
archivo. **Un nombre distinto es una SUSTITUCION y recibe id nuevo**, que es la misma regla que
ya aplica el editor para no encadenar el e1RM de dos maquinas distintas.

**La plantilla de import lleva `Programa` y `Nombre sesion`, repetidas en cada fila.** Sin esas
columnas el programa se llamaba como el ARCHIVO —de ahi salio un "forge-programa-vigente"— y las
sesiones quedaban "Sesion A", "Sesion B", que es lo unico que se ve al elegir que entrenar. En
`FIELD_ALIASES` van PRIMERAS: `matchColumn` se queda con el primer alias CONTENIDO en el
encabezado, y "Nombre sesion" contiene tanto "sesion" como "nombre".

**La tecnica no puede ser texto libre.** En el Excel entra por alias
(`porAlias`), igual que `superset: ["superserie","superset","ss"]`. Lo que no se
reconoce entra como nada: pintar de violeta algo que nadie sabe ejecutar es peor
que no pintarlo.

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

**La nota del alumno ya llegaba; lo que faltaba era que alguien AVISARA.** Se
escribe al cerrar la sesion, viaja con ella y se muestra en la ficha — pero el
entrenador se enteraba al entrar por otro motivo, que puede ser nunca, y la nota
tipica ("me molesto el hombro") caduca. Ahora hay dos senales:

- **La lista de alumnos** dice cuando entreno cada uno, cuantas sesiones lleva en
  7 dias, y marca las **notas sin leer**. Antes decia inicial, nombre y mail: para
  saber si a alguien le estaba pasando algo habia que entrar a cada ficha.
- **Un mail al entrenador** (`lib/coach/nota-email.js`, mismo camino que la
  invitacion) cuando el alumno cierra una sesion CON nota. Solo con nota: un mail
  por sesion terminada es ruido, y el ruido se filtra — en dos semanas la carpeta
  va a spam y el aviso que importa se pierde con el resto. Sale despues de guardar
  y sin bloquear: que Resend tarde no puede demorar el telefono de alguien que
  acaba de terminar de entrenar.

**El mail NO transcribe la nota, y eso es a proposito.** Bajo la Ley 25.326 "me
molesto el hombro" es dato sensible de un tercero: copiarlo al mail lo saca del
unico lugar donde el acceso esta controlado —la ficha, detras del vinculo
activo— para dejarlo en una casilla, en el proveedor de correo y en cualquier
reenvio. El aviso dice QUE hay una nota y de quien; leerla es entrar.

**"Leido" vive en el VINCULO** (`coach_athletes.notes_seen_at`, v08), no en el
usuario ni en el localStorage del coach: es una propiedad del PAR —dos
entrenadores del mismo alumno lo leen cada uno por su lado— y tiene que
sobrevivir al cambio de dispositivo, que es justo lo que un flag local no hace.
Se marca al ABRIR la ficha: verlas es leerlas, y un boton "marcar como leido"
aparte seria una tarea nueva para el mismo hecho.

**"Solo lectura" se verifica puerta por puerta, no boton por boton.** En el lado del
atleta un programa asignado ocultaba "+ Agregar ejercicio" y "Editar programa" pero
dejaba el **lapiz de sesiones**, que ademas de renombrar BORRA la sesion con sus
ejercicios. Renombrar era inocuo —el pull siguiente reemplaza el programa entero y lo
deshace—, pero el borrado no: los logs son `week|exId|setN`, asi que las series ya
registradas quedan colgando de ejercicios que no existen mas y eso no lo deshace
ningun pull. Al agregar cualquier control de edicion a la pantalla Programa,
preguntarse `esAsignado`.

**Y la contracara: en un programa asignado, tocar una fila es lo UNICO que devuelve
la app**, porque no abre el editor sino la ficha (`descModal`). Esa ficha dibujaba
solo `description`, asi que los ejercicios sin nota —la mayoria— abrian una caja con
el nombre y un OK. Ahora lo primero es la **prescripcion**, que existe siempre
(series × reps, carga, RIR, descanso, tempo, y la tecnica con su ayuda); la nota del
entrenador se suma cuando la hay. `npm run verify:programa-ui` cubre las dos reglas.

## Roadmap

1. ~~MVP: programa seed, entrenamiento, timer, superseries, e1RM~~ Done
2. ~~Health check, historial, semaforo, superset blocks~~ Done
3. ~~Programas multiples: crear, predefinido, importar Excel, descripciones~~ Done
4. ~~Persistencia real (Turso) + auth + multi-device: `/api/sync`, UI cableada,
   merge con el localStorage existente~~ Done
5. ~~Roles coach/atleta: invitaciones, asignacion y seccion de entrenador con
   metricas (E1-E4)~~ Done
6. ~~PWA offline: instalable, abre sin red, sin romper el deploy~~ Done
7. ~~Tecnicas de ejecucion: dropset en el programa y en Entrenar, con escalones
   que suman al tonelaje y al e1RM~~ Done
8. ~~El descanso como vencimiento (sobrevive a la pestaña, al segundo plano y a
   que se cierre la app), aviso que suena con la pantalla apagada, preferencias
   y ayudas contextuales~~ Done

9. ~~La vez pasada: lo que se hizo la ultima vez, bajo su columna en Entrenar~~ Done

**Lo que sigue sale de `docs/benchmark-apps-2026-08.md`** (relevamiento contra
MyFitCoach, RP Hypertrophy, Liftosaur y Hevy). Ninguno agrega una pregunta al
usuario — muestran algo que la app YA sabe y no dice: el volumen semanal por
grupo muscular (el grupo esta en `lib/catalog.js` y hoy solo lo imprime
`gen:programa`) y el veredicto del semaforo, que se calcula y se descarta sin
que nadie lo ejecute.

## La vez pasada (fase 9)

Entrenar mostraba `Ref: 140kg × 8-10`, que es la PRESCRIPCION, y nada de lo que
se hizo de verdad. El dato estaba guardado desde el primer dia —`logs` es
`week|exId|setN` y conserva todas las semanas— pero para verlo habia que salir a
Historial, que es lo que nadie hace a mitad de serie: se decidia de memoria.
Ahora va bajo cada serie, **cada valor debajo de su columna** (`lib/anterior.js`).

**Se MUESTRA, no prellena.** El campo se sigue llenando desde el programa
(`refFor`, con `refsByWeek` sobre `refKg`). Hevy prellena con lo ultimo porque es
un LOG y no hay programa que mande; FORGE es un programa EJECUTADO. Con el
prefill de la vez pasada el mesociclo deriva solo a repetir carga y **el deload
se anula sin que nadie lo note** —es -40% a proposito—. Ademas es la ref lo que
hay que cambiar para que "subir carga" se materialice, que es lo que el resumen
de progreso va a proponer. `verify:anterior-ui` lo prueba dentro del deload, que
es donde los dos numeros son distintos y confundirlos se ve.

**Es la ultima semana CON DATOS, no la literal anterior.** Lo que habia
(`prevWeekSummary`) hacia `week === "DL" ? 4 : week - 1` y fallaba de dos formas:
un ejercicio que esa semana no se entreno no tenia comparacion aunque hubiera
datos mas atras, y ese **`4` escrito a mano** hacia que el deload de un programa
de 6 semanas mirara la 4. Las semanas son dinamicas por programa desde la fase 3.

**El deload nunca es FUENTE de comparacion**, en los dos sentidos: ni desde una
semana normal ni desde el propio deload, que se compara contra la ultima normal.
Mismo criterio que `deltaE1rm`.

**UNA sola semana para todo el ejercicio, no una por serie.** Buscar cada serie
por su cuenta parece mas completo y miente: la S1 saldria de la semana pasada y
la S4 de hace un mes sin que la pantalla diga que son dias distintos. Si la
ultima vez se hicieron tres series y hoy tocan cuatro, la cuarta no tiene
comparacion — y eso es la verdad.

**No trae los escalones del dropset**: `logsFromHistory` no los reconstruye, asi
que estarian en el dispositivo que los cargo y no en el que sincronizo. Un dato
que aparece segun el telefono es peor que no mostrarlo.

**La semana iba en un `title`.** El e1RM de la cabecera ya existia y decia de
cuando era con un atributo `title` — en un telefono no hay hover, asi que el
numero aparecia sin fecha. Va escrito.

`npm run verify:anterior` (14 checks, incluye una reproduccion del comportamiento
viejo para que cada caso pruebe la diferencia) y `npm run verify:anterior-ui`
(navegador, sin cuenta ni base).

### Dos cosas del sync que ya rompieron

**Un programa que NO sube se dice, con su nombre.** `sincronizar` recorria los programas,
contaba los que subian y **descartaba el resultado de los que no**: un 500 del servidor salia por
pantalla como "Sincronizado · 4 programas". El 2026-08-09 un programa no subio en NINGUNA
sincronizacion y solo se detecto leyendo los logs de Vercel — en un telefono no hay logs.
Anunciar exito con algo afuera es el peor de los dos estados: el usuario cree que su programa
esta en la nube.

**La causa raiz era el guard de la migracion al cargar.** Habia DOS formas de que una
referencia al catalogo estuviera mal y `migrarCatalogo` solo miraba una:

```js
const faltaMigrar = programs.some(p => p.exercises.some(e => !e.exerciseId));
if (state.catalog && !faltaMigrar) return state;
```

Preguntaba si el id **falta**, nunca si **apunta a algo que existe**. Un programa que llega de
otra cuenta, otro navegador o un respaldo trae sus `exerciseId` puestos: `faltaMigrar` da false,
el estado se devuelve tal cual, y nadie lo repara jamas. Ahora esa rama absorbe al catalogo lo
que falta y sanea el resto. Se repara **al cargar** y no solo antes de subir: un estado
incoherente en memoria rompe tambien lo que se muestra, no solo lo que viaja.

`npm run verify:huerfanos-ui` lo reproduce entero — con los dos arreglos desactivados da
3 huerfanas al cargar, 3 despues de sincronizar y **0 copias en el servidor**.

**Una referencia huerfana al catalogo bloquea el push del programa ENTERO, para siempre.**
`program_exercises.exercise_id` es una FK a `exercises`: un solo ejercicio apuntando a una
entrada que no esta hace fallar el INSERT completo con `FOREIGN KEY constraint failed`, y como
el push se reintenta en cada sincronizacion, falla siempre igual. Paso con 16 de 36 ejercicios.
Antes de subir, `sincronizar` **absorbe** al catalogo lo que falta y despues
`sinReferenciasHuerfanas` resuelve el resto: repunta por NOMBRE si el ejercicio existe con otro
id, y si no hay a quien apuntar **suelta la referencia a null**. El programa sigue funcionando
—`name` viaja denormalizado— y entra. Una referencia rota no vale mas que ninguna.

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
