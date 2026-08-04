# CONTEXT.md — FORGE v2

Estado actual del proyecto y decisiones tomadas.

---

## Estado general

**Fase**: fases 1 a 7 cerradas. Sin fase 8 definida.
**Deploy**: https://forge-v2-five.vercel.app — push a `main` deploya solo
**Ultima actualizacion**: 2026-08-04

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
- [x] Deload configurable por programa (porcentaje, metodo y piso de series)
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

## Fase 4 — cerrada

- [x] Shell migrado de Vite/GitHub Pages a Next.js 15 App Router
- [x] Base `forge` creada en Turso (org `gabriellucci`, grupo `default`, aws-eu-west-1)
- [x] Schema v01 + v02 aplicados en la base local y en la remota
- [x] Capa de datos `lib/repo/*` (usuarios, programas, refs por atleta, logs) con 16 checks
- [x] `assignment_refs` operativo: dos atletas con el mismo programa tienen kilos distintos
- [x] NextAuth v4 con adapter propio sobre `users`, Google OAuth + magic link por Resend
- [x] Pantalla de login mobile-first
- [x] `/api/sync`: push de la sesion al terminar, pull al abrir, boton manual bidireccional
- [x] UI cableada a la base con la regla "si hay sesion sincroniza, si no sigue local"
- [x] Perfil (nombre, peso corporal) y punto de entrada a la cuenta
- [x] Historial real importado: 175 series del Ciclo 2 (semanas 1 y 2)

## Fase 5 — rol entrenador

| Etapa | Estado |
|---|---|
| E1 · Schema v03 + capa de datos | Hecha |
| E2 · Invitar, aceptar con consentimiento, lista de alumnos | Hecha |
| E3 · Asignar programa y calibrar kilos por alumno | Hecha |
| E4 · Seccion de entrenador con metricas | Hecha |

### 2026-08-02 — Un programa por alumno, no una plantilla calibrada
**Decision**: en entrenamiento 1:1 cada alumno tiene su propio programa. El entrenador duplica
uno existente, lo adapta y lo asigna. **No** se calibran kilos desde la ficha del alumno.

**Motivo (de Agustin)**: personalizar es el trabajo del entrenador personalizado, no una excepcion
a una plantilla. Los alumnos no comparten programa con otros kilos: tienen ejercicios distintos,
series distintas y sustituciones por lesion. `assignment_refs` resuelve el caso de UNA plantilla
en varias personas, que no es este.

**Consecuencia**: la lista de 33 inputs de kilos sale de la ficha del alumno. `assignment_refs`
**no se elimina** — funciona, esta verificado y sirve el dia que se comparta una plantilla entre
varios — pero deja de ser el camino principal.

**Convencion de nombres**: los programas se nombran por contenido ("Hipertrofia 4 sem"), no por
alumno. El alumno ve ese nombre en su app, y la lista del entrenador ya muestra a quien esta
asignado cada uno.

### 2026-08-02 — La seccion de entrenador no vive en el Perfil
**Decision**: seccion propia, no un desplegable dentro del modal de Perfil.
**Motivo**: con varios alumnos hay que elegir con cual trabajar y ver su historial y sus metricas.
Eso no entra en un modal pensado para editar el nombre y el peso corporal.
**Formato**: responsive real — una columna en el celular, aprovechando el ancho en la computadora.
La app del ATLETA sigue siendo mobile-first a 430px; la del entrenador es otra cosa.

## Fase 6 — PWA offline (cerrada)

- [x] Instalable, con manifest e iconos maskable
- [x] Abre SIN RED: navegacion red-primero con reloj, estaticos cache-primero
- [x] `/api/**` nunca se cachea y no se llama a `skipWaiting()` — las dos reglas duras
- [x] El estado del modo offline es visible en el Perfil (diagnosticar esto en un
      telefono sin devtools es imposible)
- [x] Boton atras de Android: cierra pantallas, vuelve a Entrenar, y recien ahi pregunta
- [x] `check_pwa.py` corta la red DE VERDAD, y ademas simula la red que solo CUELGA

## Fase 7 — tecnicas de ejecucion (cerrada)

- [x] `lib/tecnicas.js` como fuente unica: familia, color, alias de import, escalones
- [x] Dropset en el programa, en el editor del entrenador, en el Excel y en Entrenar
- [x] Escalones dentro de la serie (`set_logs.steps_json`, v07) — no como series aparte
- [x] Suman al tonelaje y entran al e1RM
- [x] El descanso espera al ultimo escalon
- [x] Los tres dropsets que la planilla ya prescribia, cargados en el Ciclo 2 real

## Pendiente (futuro)

- [ ] **Conflicto abierto: el e1RM del dropset.** La app incluye los escalones (indicacion
      en sesion del 2026-08-04). `programa_tecnicas_ciclo2.md`, seccion 9, dice lo
      contrario: "suma al tonelaje pero el e1RM se calcula solo con el primer segmento —
      si no, el descuelgue a carga baja con muchas reps ensucia la estimacion hacia
      arriba". Ese documento es la fuente de verdad externa segun `CLAUDE.md`. Hoy la app
      hace lo primero. Cambiarlo es acotado: `metrics` en ForgeApp y el pie de la tarjeta
- [ ] **Decidir si el dropset se desactiva en deload.** Se acordo que si y quedo sin
      implementar; hoy aplica a la ultima serie que exista, tambien en descarga. La
      planilla lo marca en el deload, pero la anotacion se repite mecanicamente en las
      cinco filas de cada ejercicio, asi que no es evidencia de una decision
- [ ] Rest-pause, myo-reps y cluster: la planilla los tiene como "disponibles, no
      aplicados". Son entradas en `TECNICAS`, no una migracion
- [ ] Consentimiento explicito de datos de salud (Ley 25.326) antes de alumnos reales —
      postergado por decision explicita: el trato con los alumnos es personal
- [ ] Plan / limite de alumnos por entrenador (patron `features` JSON, como Tesoreria)
- [ ] Borrar un ejercicio no viaja entre dispositivos del mismo usuario (el programa si)
- [ ] Exportar programa a Excel (el historial ya se exporta)
- [ ] Prediccion de carga (regresion lineal e1RM)
- [ ] Dos diferencias de reps entre la planilla y la app, detectadas al cargar los
      dropsets y sin tocar: gemelo prensa 45 (planilla 8-10, app 12-15) y apertura
      maquina (planilla 12-15, app 10-12). Las refs coinciden

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
**Tecnicas (DS, ASIM-IZQ)**: iban como texto en `description`. El dropset dejo de ser texto
en la fase 7 (ver mas abajo); ASIM-IZQ sigue siendo una nota, porque no cambia como se
registra la serie sino cuantas series lleva un lado.

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
                      cada set puede llevar `pasos[]` — los escalones de un dropset,
                      que viven DENTRO de la serie y no son series nuevas
history[]           → array de sesiones completadas con programId
```
Ejercicios incluyen campo `description` (texto libre).
Migracion automatica de v1 en `migrateState()`.

### Remoto (Turso) — en produccion, con datos reales
19 tablas, migraciones v01 a v07 aplicadas. El SQL vive en `db/`; la base es `forge` en la
org `gabriellucci`.

La traduccion entre las dos formas vive en `lib/repo/*` y en ningun otro lado.

**Las dos estan conectadas desde la fase 4**: `/api/sync` sube al terminar cada sesion y
baja al abrir. El atleta sigue siendo offline-first (localStorage manda mientras entrena);
el entrenador trabaja online contra el servidor.

Ver `forge-arquitectura.md` para el diseno del sync engine y el outbox.

### 2026-08-04 — Un dropset no es otra superserie

**Decision**: dos mecanismos distintos, no uno generalizado. Lo que AGRUPA ejercicios
(superserie, tri-set) es una relacion entre filas y ya se modelaba con la FK
`superset_with`. Lo que pasa ADENTRO de una serie (dropset y familia) no tiene a quien
apuntar: es un nivel mas de registro, `set_logs.steps_json` (v07).

**Motivo**: confundirlos lleva a modelar el dropset como ejercicios sueltos o como series
aparte. Lo primero encadena el e1RM de dos cosas distintas; lo segundo rompe el conteo de
series y el tonelaje por serie. Las dos formas de equivocarse tienen el mismo origen.

**Lo que ya estaba**: `program_exercises.technique` existe desde la v01 con el comentario
`'DS' | 'ASIM-IZQ'`, y el repo la leia y la escribia. Nunca la escribio nadie. Ahora
guarda JSON y tolera el string suelto, para que una fila vieja no quede ilegible.

**Tonelaje y e1RM: los escalones cuentan.** El tonelaje suma —es trabajo real que no se
contaba—. El e1RM tambien, y eso es seguro por construccion y no por criterio: la semana
toma el MAXIMO y un escalon lleva menos peso, asi que no puede bajar el numero. Si alguna
vez gana, fue el mejor esfuerzo de la semana. (Brzycki pierde precision arriba de ~12
reps, pero eso ya valia para cualquier serie.)

**Entre escalones no hay descanso**, ese es el punto de la tecnica. El timer arrancaba al
cargar las reps de la serie, que con un dropset es exactamente cuando hay que bajar el
peso y seguir.

### 2026-08-04 — El color codifica la familia, no la tecnica

**Decision**: teal `#0E8F9E` para lo que agrupa ejercicios, violeta `#7A3FD4` para lo que
pasa adentro de la serie. Cual es exactamente lo dice el chip con el nombre.

**Motivo**: con siete tecnicas posibles, un color por tecnica no se recuerda. Y el chip es
lo que hace que la distincion no dependa solo del color.

**Restriccion dura**: ningun color de estructura puede salir de la familia del semaforo
(verde `#34C759` / amarillo `#FF9500` / rojo `#FF3B30`). El semaforo dice COMO TE FUE y la
tecnica dice COMO SE HACE. La superserie era naranja `#F5A623`, a un paso del amarillo del
semaforo, y por eso cambio.

**Corolario**: la tecnica no puede ser texto libre. En el Excel entra por alias, como ya
hacia `superset`. Lo que no se reconoce entra como nada — pintar de violeta algo que nadie
sabe ejecutar es peor que no pintarlo.
