# CONTEXT.md — FORGE v2

Estado actual del proyecto y decisiones tomadas.

---

## Estado general

**Fase**: Fase 4 en curso — infraestructura lista, la UI todavia escribe en localStorage
**Deploy**: pendiente de conectar el repo a Vercel (GitHub Pages quedo atras con la migracion a Next.js)
**Ultima actualizacion**: 2026-08-01

> El deploy sale de `main`. Una feature no esta en produccion hasta que su rama se
> mergea a `main` y se pushea — verificar antes de dar una fase por cerrada.

---

## Features implementadas

- [x] Programa seed editable (Ciclo 2 DUP, 33 ejercicios, 3 sesiones)
- [x] Entrenamiento activo block-based (singles + superseries/tri-sets/giant sets)
- [x] Inputs KG/REPS/RIR con prefill desde refKg
- [x] Timer de descanso con vibracion (dispara al cerrar la vuelta)
- [x] Health check pre-sesion (sueno/estres/energia 1-5)
- [x] Semaforo de autorregulacion (verde/amarillo/rojo)
- [x] Referencia semana anterior (e1RM inline)
- [x] Historial de sesiones expandible con semaforo por ejercicio
- [x] Progreso: e1RM Brzycki por ejercicio + tonelaje semanal con deltas
- [x] Deload automatico (series - 1)
- [x] Sesiones editables (agregar, renombrar, eliminar)
- [x] Re-entry flow (revisar/editar o empezar de cero)
- [x] Programas multiples (crear vacio, desde plantilla predefinida, duplicar, eliminar)
- [x] Descripcion/notas por ejercicio (visible en editor, entrenamiento y programa)
- [x] Import Excel con wizard de 3 pasos (upload, mapeo columnas, preview)
- [x] Plantilla Excel descargable con formato correcto y ejemplos
- [x] Editar metadata del programa (nombre, semanas, deload)
- [x] Semanas y deload dinamicos por programa
- [x] Historial y progreso filtrados por programa activo
- [x] Migracion automatica de localStorage v1 a v2
- [x] Export del historial a Excel (hoja Sesiones + hoja Series, una fila por set)
- [x] Programa real del atleta (Ciclo 2) cargado en el SEED con refs post-24/06/2026

## Fidelidad con el programa real (2026-08-02)

Seis diferencias entre lo que hacia la app y lo que dice `rutina_gym.md`, todas cerradas:

- [x] **Progreso conservaba solo lo del programa actual.** Un ejercicio sustituido desaparecia
      con sus metricas y bajaba el tonelaje de semanas ya entrenadas. Ahora se recorren las
      metricas y los retirados se recuperan del snapshot del historial.
- [x] **Deload configurable** (`{pct, method, minSets}`, default -40% por series con piso de 2).
      `sets - 1` recortaba entre 25% y 50% segun el ejercicio y dejaba en 1 serie a los 6 que
      tienen 2 — incluido el protocolo ASIM-IZQ, que corrige asimetria con series de mas.
- [x] **Catalogo de ejercicios**: base de solo lectura + propios, con selector y alta al vuelo.
- [x] **Sustituir != renombrar**: cambiar el ejercicio con series registradas crea uno nuevo y
      archiva el anterior; sin series, edita en el lugar.
- [x] **Referencias por semana** (`refsByWeek`): subir la ref para Sem 4 ya no cambia las
      semanas entrenadas. Mapea sobre `assignment_refs.week`, que ya existia en el schema.
- [x] **Test de maximos** (`maxTest: {week, session}`): la Sem 4 · Sesion C es una sesion que
      no se autorregula y ahora esta marcada como tal.

**Lo que el programa NO tiene, y esta bien que no tenga**: progresion de carga prescrita de S1 a
S4. Es DUP — la ondulacion es entre sesiones (A volumen 8-15 RIR 2-3, B moderada, C intensidad
4-8 RIR 1-2), no entre semanas. En la Sheet 28 de 31 ejercicios tienen la misma referencia en las
cuatro semanas. La progresion sale de la autorregulacion, que es lo que hace el semaforo.

## Fase 4 — lo que ya esta

- [x] Shell migrado de Vite/GitHub Pages a Next.js 15 App Router
- [x] Base `forge` creada en Turso (org `gabriellucci`, grupo `default`, aws-eu-west-1)
- [x] Schema v01 + v02 aplicados en la base local y en la remota
- [x] Capa de datos `lib/repo/*` (usuarios, programas, refs por atleta, logs) con 16 checks
- [x] `assignment_refs` operativo: dos atletas con el mismo programa tienen kilos distintos
- [x] NextAuth v4 con adapter propio sobre `users`, Google OAuth + magic link por Resend
- [x] Pantalla de login mobile-first

## Pendiente (futuro)

- [ ] `/api/sync` — push de la cola de mutaciones + pull incremental por `updated_at`
- [ ] Cablear la UI a la capa de datos (hoy `ForgeApp.jsx` sigue leyendo y escribiendo localStorage)
- [ ] Migrar el localStorage existente a la base la primera vez que el usuario entra
- [ ] **Sustituir ejercicio** como operacion distinta de renombrar — ver decision de 2026-08.
      Bloquea el rol entrenador: un coach editando el mesociclo en marcha reescribe el historial
      de sus alumnos sin darse cuenta
- [ ] Multi-device sync
- [ ] Roles coach/athlete + dashboard trainer
- [ ] Override de `ref_kg` por asignacion (bloqueante para el caso multi-alumno)
- [ ] Consentimiento explicito de datos de salud (Ley 25.326) antes de alumnos reales
- [ ] Plan / limite de alumnos por entrenador (patron `features` JSON, como Tesoreria)
- [ ] PWA con service worker
- [ ] Exportar programa a Excel (el historial ya se exporta)
- [ ] Campo `tecnica` en ejercicio (DS / ASIM-IZQ) — hoy viven como texto en `description`
- [ ] Prediccion de carga (regresion lineal e1RM)
- [ ] Medidas corporales + proporciones McCallum

---

## Decisiones tomadas

### 2026-07 — Arquitectura monolitica
**Decision**: mantener todo en `ForgeApp.jsx` como archivo unico.
**Motivo**: MVP rapido, menor friccion. Se fragmentara cuando la complejidad lo justifique (probablemente al agregar programas multiples).

### 2026-07 — localStorage como persistencia
**Decision**: localStorage con JSON serializado, sin IndexedDB.
**Motivo**: suficiente para un solo usuario, un solo dispositivo. Migracion a Turso planificada para fase 4.

### 2026-07 — CSS embebido
**Decision**: estilos como string en constante `CSS` inyectada via `<style>`.
**Motivo**: zero-config, sin build de CSS separado. Funciona bien para el tamano actual.

### 2026-07 — Vite + React (no Next.js)
**Decision**: SPA con Vite, deploy a GitHub Pages.
**Motivo**: no necesita SSR ni API routes por ahora. Migracion a Next.js planificada cuando se agregue auth y backend.

### 2026-07 — Superseries como bloques
**Decision**: agrupar ejercicios vinculados por `superset` en bloques que se muestran juntos en la pantalla de entrenamiento.
**Motivo**: UX natural — el atleta ve todos los ejercicios de la superserie en la misma pantalla y navega entre bloques.

### 2026-07 — Programa seed como template
**Decision**: programa Ciclo 2 DUP como constante `SEED_PROGRAM`, disponible como plantilla predefinida al crear programas.
**Motivo**: permite crear programas nuevos desde una base real. El seed original se mantiene para usuarios nuevos.

### 2026-07 — Programas multiples con migracion automatica
**Decision**: migrar de flat `program[]` a `programs[]` con `activeProgramId`. Funcion `migrateState()` detecta formato v1 y convierte automaticamente.
**Motivo**: retrocompatibilidad con datos existentes en localStorage.

### 2026-07 — Import Excel client-side con SheetJS
**Decision**: parseo de Excel 100% en el browser con `xlsx` (SheetJS). Wizard de 3 pasos.
**Motivo**: funciona offline, no requiere backend. El server solo recibira JSON normalizado cuando se implemente sync.

### 2026-07 — FORGE deja de ser una herramienta personal: es un SaaS para entrenadores
**Decision**: el producto apunta a entrenadores con muchos alumnos. El entrenador carga el programa,
define las referencias por alumno y analiza las metricas; el alumno registra el entrenamiento.
Agustin sigue siendo ademas usuario individual (atleta sin coach) — ese caso NO se bifurca:
un atleta independiente es un usuario sin `coach_id`, como ya plantea `forge-arquitectura.md`.

**Consecuencias que no estaban contempladas:**
1. `ref_kg` NO puede vivir en la plantilla (`program_exercises`) — la referencia es por atleta.
   Hace falta una tabla de override por asignacion. Ver propuesta en la seccion de schema.
2. Pasan a almacenarse datos de salud de terceros (lesiones en campos de texto libre, hoy usados
   para el protocolo L3-S1). Ley 25.326: dato sensible, requiere consentimiento expreso.
   Decidir antes de onboardear alumnos reales, no despues.
3. El entrenador es la unidad que paga y los alumnos son la metrica que se cobra → tiene que ser
   entidad de primera clase en el schema, no un `coach_id` colgado de `users`.

**Resuelto el 2026-07-30 en `forge-arquitectura.md` seccion 2**: Turso + Next.js, no FastAPI +
Postgres. Menos infra que mantener mientras se valida si el producto se vende, y coherente con
Tesoreria, que ya corre sobre `@libsql/client`. Agregaciones en memoria; migrar a Postgres solo
si el dashboard del coach pide queries analiticas de verdad.

### 2026-07 — Export a Excel si, API no (todavia)
**Decision**: el historial se exporta a .xlsx desde el cliente (2 hojas: Sesiones y Series, una fila por set).
No se expone API.
**Motivo**: FORGE v2 es una SPA estatica en GitHub Pages — no hay servidor desde el cual exponer nada.
Una API real es exactamente el trabajo de Fase 4 (Turso + backend); construirla antes obligaria a levantar
un backend solo para eso. El .xlsx cubre el caso de analisis externo hoy, sin infraestructura.

### 2026-07 — Datos del atleta: fuente de verdad externa
**Decision**: el SEED refleja el Ciclo 2 real (refs post-ajustes 24/06/2026). La fuente de verdad sigue
siendo `OneDrive/.../Sistema cronobiologico/Claude/rutina_gym.md` + `programa_tecnicas_ciclo2.md`.
**Motivo**: el SEED solo aplica a instalaciones nuevas — `migrateState()` conserva el localStorage
existente. Para cargar el programa en un navegador con datos, se genera un .xlsx con
`npm run gen:programa` y se importa por el wizard. El .xlsx queda en `data/` (gitignored: son datos
personales de salud y el repo es publico).
**Tecnicas (DS, ASIM-IZQ)**: no hay campo `tecnica` en el modelo — van como texto en `description`,
visibles con el badge "i" durante el entrenamiento. Suficiente para operar; el campo propio queda pendiente.

### 2026-07 — Timer de descanso: trigger explicito
**Decision**: el descanso arranca cuando se escribe el primer caracter en REPS (transicion vacio -> con dato).
En superserie no arranca hasta cerrar la serie N de **todos** los ejercicios del bloque; usa el `rest` mas
alto del bloque.
**Motivo**: el timer habia quedado huerfano tras el commit `8e10b6e` (simplify workout UX) — el state, el
countdown y la barra seguian en el codigo pero nada llamaba a `setTimer` con una duracion. Se elige REPS
como senal de cierre (no KG) porque es el ultimo dato significativo y funciona con BW y con unit `pasos`.
Solo dispara en la transicion, asi editar una sesion vieja en modo revision no relanza el countdown.

### 2026-07 — Descripciones en ejercicios
**Decision**: campo `description` (texto libre) en cada ejercicio. Visible como modal en entrenamiento (tap en nombre) y como badge `i` en programa.
**Motivo**: permite al entrenador agregar indicaciones de postura, agarre, etc. que el atleta consulta durante el entrenamiento.

### 2026-08 — Next.js + Vercel, se abandona GitHub Pages
**Decision**: migrar el shell de Vite a Next.js 15 (App Router) y el deploy a Vercel.
**Motivo**: no es una preferencia de framework — GitHub Pages sirve archivos estaticos y no puede
correr NextAuth ni `/api/sync`. Sin route handlers no hay fase 4. Se hace de una sola vez, al
principio, para no escribir codigo que despues haya que reescribir al mudarlo.
**Costo asumido**: se pierde la URL de GitHub Pages. El workflow `deploy.yml` se elimino porque
corria `vite build` y habria fallado en el primer push a `main`.

### 2026-08 — Las funciones se deployan en Dublin, no en Sao Paulo
**Decision**: `vercel.json` fija `regions: ["dub1"]`.
**Motivo**: la base quedo en `aws-eu-west-1` (el plan starter de Turso permite un solo grupo y ahi
viven las otras bases). Una request resuelve varias queries, asi que la latencia funcion↔base pesa
mas que la del usuario↔funcion, que se paga una sola vez. `gru1` estaria mas cerca de Argentina
pero cada query cruzaria el Atlantico. Si algun dia la base se muda a `sa-east-1`, mover esto tambien.

### 2026-08 — Renombrar un ejercicio reescribe el pasado (RESUELTO)

> **Estado: implementado el 2026-08-02.** Existe el catalogo (`lib/catalog.js`), el selector
> reemplazo al texto libre, y cambiar el ejercicio de uno que ya tiene series registradas es una
> sustitucion: entra con id propio y el anterior sale del programa, con su historial y su e1RM
> aparte. Progreso conserva los retirados (marcados "fuera") y sigue contandolos en el tonelaje.
> Queda pendiente el schema SQL del catalogo (se disena en fase 5 junto con `coach_id`, para
> migrarlo una sola vez). El pull absorbe los ejercicios que llegan de otro dispositivo, asi
> que en la practica el catalogo se mantiene al dia entre celular y computadora.
>
> El analisis original queda abajo porque explica el porque del diseno.


**Detectado en uso real**: el programa traia "Prensa horizontal" en la sesion C. Al probarla no
convencio y se hizo Prensa 45° en su lugar. Se edito el **nombre** del ejercicio y aparecieron dos
filas "Prensa 45°" en Progreso — una por cada id, porque Progreso agrupa por id y muestra el nombre.

**El sintoma visible ya esta corregido** (la fila lleva un badge con la sesion cuando el nombre se
repite).

**Alcance real del problema — verificado en el navegador, no deducido:**

| Pantalla | Tras renombrar muestra | |
|---|---|---|
| Historial | el nombre **viejo** | correcto |
| Progreso | el nombre **nuevo** | reescribe |

El historial guarda un snapshot del nombre al cerrar la sesion (`handleConfirmOk`) y `set_logs.
exercise_name` hace lo mismo del lado del servidor: **el registro de lo que se hizo esta intacto**.
Lo que se reescribe es solo la etiqueta de Progreso, que agrupa por id y toma el nombre del
programa actual.

Que Progreso quede mal no se arregla eligiendo "el otro nombre": depende de que fue el cambio.

**La causa es que hoy hay una sola operacion para dos cosas distintas:**
- *Corregir* el nombre (un typo) → tiene que aplicar hacia atras. Es lo que hace hoy.
- *Sustituir* el ejercicio (cambie la maquina) → es un ejercicio nuevo desde esa fecha. El
  historial anterior pertenece al viejo y **el e1RM no se hereda**.

Lo segundo no es una opinion: el propio SEED lo dice en la descripcion de la Sentadilla pendular
—"Reemplaza al belt squat (tope mecanico 120kg). NO heredar esos kilos: la pendular mueve mas por
mecanica de la maquina, no por mas fuerza. Su e1RM arranca como serie nueva"—. La regla de negocio
ya esta escrita en el programa; la app todavia no la implementa.

**Diseno propuesto: catalogo de ejercicios** (idea de Agustin, 2026-08). El nombre deja de ser
texto libre en `program_exercises` y pasa a ser una referencia a una tabla de ejercicios. Al armar
el programa se elige de una lista o se agrega uno nuevo.

Lo que resuelve, y por que es la solucion correcta y no un parche:
- **Typos y duplicados por nombre**: dejan de ser posibles. "Prensa 45°" es una fila, no un string
  que se escribe dos veces distinto.
- **Convierte el rename en sustitucion sin pedirle nada al usuario**: cambiar de "Prensa
  horizontal" a "Prensa 45°" deja de ser editar un texto y pasa a ser *apuntar a otro ejercicio*.
  La app puede distinguir por fin las dos operaciones que hoy se confunden — corregir el nombre de
  un ejercicio (aplica hacia atras) contra cambiar de ejercicio (empieza una serie nueva).
- **Progreso puede cortar la serie de e1RM** cuando cambia la referencia, en vez de encadenar dos
  maquinas distintas.

Que el e1RM no se herede entre ejercicios distintos no es una opinion: el propio SEED lo dice en la
descripcion de la Sentadilla pendular —"Reemplaza al belt squat (tope mecanico 120kg). NO heredar
esos kilos: la pendular mueve mas por mecanica de la maquina, no por mas fuerza. Su e1RM arranca
como serie nueva"—. La regla ya esta escrita en el programa; falta implementarla.

Schema: tabla `exercises` (catalogo, global + por coach) y `program_exercises.exercise_id` como FK.
`set_logs` ya guarda el snapshot del nombre, asi que el historial sigue anclado a lo que se hizo.
Migracion: los nombres actuales se vuelcan al catalogo deduplicando por nombre normalizado.

**Requisito que hay que arreglar con esto — verificado en el navegador:** un ejercicio que sale del
programa desaparece de Progreso **con sus metricas**, aunque sus series sigan registradas.
`metrics` hace `program.find(...)` y si no lo encuentra descarta el log. Medido: dos ejercicios con
series en la semana 1 (720 kg + 650 kg = 1.4t); al sacar uno, esa semana pasa a mostrar 0.7t.

O sea que sustituir un ejercicio en la semana 3 **baja el tonelaje de las semanas 1 y 2**, que ya
estaban entrenadas. Los datos estan, la metrica miente.

Lo correcto es lo que pide Agustin: el ejercicio anterior sigue figurando en Progreso con las
semanas que efectivamente se hizo, aunque sea una sola, y sin encadenarse con el que lo reemplazo.
Implica que Progreso itere sobre las metricas y no sobre el programa, resolviendo el nombre desde
el programa si el ejercicio sigue ahi y desde el snapshot del historial si ya no.

**Urgencia**: con un solo atleta es una molestia que se corrige a mano. Con entrenadores editando
el mesociclo en marcha de varios alumnos, las metricas de todos dejan de significar lo que dicen.

### 2026-08 — Adapter de NextAuth propio en vez de uno de libreria
**Decision**: `lib/auth/adapter.js` escrito a mano sobre la tabla `users` del dominio.
**Motivo**: los adapters genericos crean su propia tabla de usuarios. Tendriamos la identidad
partida entre esa tabla y `users` (que ya tiene `role`, `body_weight_kg`, `deleted_at` y de la que
cuelgan programas y logs). Sesion JWT: no hace falta tabla de sesiones.
**Gotcha que costo encontrar**: next-auth v4 es CommonJS y bajo Next 15 llega con doble envoltura
(`mod.default.default`). Importarlo derecho da "NextAuth is not a function", y lo mismo cada
provider. Se desenvuelve en `lib/auth/nextauth-interop.js` — importar desde ahi, no de `next-auth`.

---

## Modelo de datos — estado actual

### Actual (localStorage v2)
```
programs[]          → array de { id, name, weeks, hasDeload, sessions[], exercises[], status, createdAt }
activeProgramId     → id del programa seleccionado
logs{}              → hash de sets registrados por key compuesta (week|exId|setN)
history[]           → array de sesiones completadas con programId
```
Ejercicios incluyen campo `description` (texto libre).
Migracion automatica de v1 en `migrateState()`.

### Remoto (Turso) — aplicado, todavia sin datos
16 tablas: las 13 del dominio (v01) + `auth_accounts` y `auth_verification_tokens` (v02) +
`schema_migrations`. El SQL vive en `db/`; la base es `forge` en la org `gabriellucci`.

La traduccion entre las dos formas vive en `lib/repo/*` y en ningun otro lado.

**Las dos no estan conectadas todavia**: la UI sigue leyendo y escribiendo localStorage. El puente
(`/api/sync` + migracion inicial del localStorage existente) es lo que falta de la fase 4.

Ver `forge-arquitectura.md` para el diseno del sync engine y el outbox.
