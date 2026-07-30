# CONTEXT.md — FORGE v2

Estado actual del proyecto y decisiones tomadas.

---

## Estado general

**Fase**: Fase 3 completada (programas multiples + descripciones + import Excel)
**Deploy**: https://estudiocontablelucci-lgtm.github.io/app-forge-V2/
**Ultima actualizacion**: 2026-07-30

> El deploy sale de `main` via GitHub Actions. Una feature no esta en produccion
> hasta que su rama se mergea a `main` y se pushea — verificar antes de dar una fase por cerrada.

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

## Pendiente (futuro)

- [ ] Persistencia con Turso + auth NextAuth
- [ ] Multi-device sync
- [ ] Roles coach/athlete + dashboard trainer
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

### Target futuro (Turso/Dexie)
Ver `forge-arquitectura.md` para schema completo con cycles, assignments, body_measurements, outbox.
