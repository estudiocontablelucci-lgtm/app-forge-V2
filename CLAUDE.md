# CLAUDE.md — FORGE v2

App de tracking de entrenamiento para gimnasio. Reemplaza Google Sheets con una interfaz mobile-first optimizada para usar en el gym.

---

## Stack

| Capa | Tecnologia |
|---|---|
| Framework | React 19 + Vite 8 |
| Lenguaje | JSX (sin TypeScript por ahora) |
| Estilos | CSS-in-JS embebido (string en constante `CSS`) |
| Persistencia | localStorage (`forge-v2`) |
| Deploy | GitHub Pages (CI/CD via GitHub Actions) |
| Linter | oxlint |

---

## Estructura del proyecto

```
app-forge-v2/
├── src/
│   ├── main.jsx          # entry point (React root)
│   ├── App.jsx            # wrapper que importa ForgeApp
│   ├── ForgeApp.jsx       # archivo monolitico principal (~1100 lineas)
│   ├── index.css          # estilos globales minimos
│   └── assets/            # imagenes (hero.png, iconos)
├── public/                # assets estaticos
├── dist/                  # build output (GitHub Pages)
├── forge-arquitectura.md  # documento de diseno tecnico completo
├── forge-mvp.jsx          # version anterior de referencia
├── index.html             # HTML shell
├── vite.config.js         # config Vite (base path para GH Pages)
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

### Dependencias
- `xlsx` (SheetJS) — parseo client-side de Excel para import/export

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
- e1RM: Brzycki `kg * 36 / (37 - reps)`
- Deload: `sets - 1` automatico
- Semaforo: verde (subir) / amarillo (mantener) / rojo (revisar) basado en reps vs guia y RIR

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

---

## Zonas protegidas

- Logica de `brzycki` y semaforo — no modificar sin consulta
- Estructura de `logs` (key format `week|exId|setN`) — migrar con cuidado
- Flujo de entrenamiento activo (health check -> blocks -> finish) — es el core UX

---

## Roadmap

1. ~~MVP: programa seed, entrenamiento, timer, superseries, e1RM~~ Done
2. ~~Health check, historial, semaforo, superset blocks~~ Done
3. ~~Programas multiples: crear, predefinido, importar Excel, descripciones~~ Done
4. Persistencia real (Turso) + auth + multi-device
5. Roles (trainer/athlete) + dashboard trainer
6. PWA offline

---

## Documento de referencia

`forge-arquitectura.md` contiene el diseno tecnico completo:
- Schema Dexie/PostgreSQL target
- Modelo coach/athlete
- Import Excel (SheetJS)
- Wireframes de todas las pantallas
- Formulas y reglas de negocio

Usarlo como guia para decisiones de arquitectura, pero la implementacion actual es MVP simplificado (localStorage, sin auth, sin sync).
