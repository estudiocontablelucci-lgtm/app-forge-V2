# Forge — Arquitectura de la app de tracking de entrenamiento

Documento de diseño técnico. Cubre arquitectura general, modelo de datos, schema local y remoto, estrategia offline-first, modelo de roles (entrenador/alumno), importación desde Excel y wireframes de las pantallas principales.

---

## 1. Visión y roles

La app replica el sistema actual de Google Sheets (Programa → Semanas de tracking → Mesociclo → Dashboard → Historial → Medidas) y agrega un modelo multi-usuario inspirado en Hevy Coach / TrueCoach:

**Atleta independiente** — crea su propio programa (desde la app o importando Excel), entrena, ve su progresión. Es el caso de uso actual tuyo. Un solo usuario, todos los permisos.

**Instructor + alumnos** — el instructor crea programas y los asigna a uno o más alumnos. El alumno ve el programa asignado en modo lectura (no edita la prescripción), registra sus entrenamientos, y el instructor ve el tracking de todos sus alumnos: adherencia (sesiones completadas vs. programadas), e1RM trends, RIR reportado vs. objetivo, comentarios por sesión.

El modelo de datos soporta ambos casos con la misma estructura: un atleta independiente es simplemente un usuario cuyo `coach_id` es él mismo (o null). Esto evita bifurcar el código.

```
Usuario (rol: coach | athlete | both)
   │
   ├── crea → Programa (plantilla, versionable)
   │              │
   │              └── se asigna → Asignación (programa × atleta × fecha inicio)
   │                                   │
   │                                   └── genera → Ciclo activo del atleta
   │                                                    │
   │                                                    └── Logs de series
```

Distinción clave que en Sheets no existe: **el Programa es una plantilla reutilizable**, separada del **Ciclo** (una instancia del programa ejecutada por un atleta en fechas concretas). Esto permite que un instructor asigne el mismo programa a 10 alumnos, y que vos archives C1 y arranques C2 con la misma plantilla ajustada. El Historial plano de tu Sheet pasa a ser la tabla de logs con `cycle_id`.

---

## 2. Arquitectura general

Coherente con tu stack acordado (Next.js en Vercel + FastAPI en Hetzner):

```
┌─────────────────────────────────────────────┐
│  PWA Next.js (App Router) — Vercel          │
│  ├── UI React + Tailwind                    │
│  ├── Service Worker (Serwist) → cache shell │
│  ├── Dexie.js (IndexedDB) → datos locales   │
│  └── Sync engine (cola de mutaciones)       │
└──────────────┬──────────────────────────────┘
               │ HTTPS JSON (cuando hay red)
┌──────────────▼──────────────────────────────┐
│  FastAPI — Hetzner VPS                      │
│  ├── Auth (JWT + refresh, roles)            │
│  ├── /sync (push/pull incremental)          │
│  ├── /import/excel (parseo openpyxl)        │
│  └── PostgreSQL (fuente de verdad remota)   │
└─────────────────────────────────────────────┘
```

Por qué IndexedDB vía Dexie y no SQLite/OPFS: Dexie es maduro, funciona en Safari iOS (crítico: la app se usa desde el celular en el gimnasio), tiene `dexie-observable` para reactividad y el bundle es chico. SQLite-WASM sobre OPFS es más potente para queries analíticas, pero el volumen de datos (150 filas de programa + ~2.000 logs por ciclo) no lo justifica. Las agregaciones del Dashboard se resuelven en memoria sin problema.

**Offline-first real**: la app funciona 100% sin red. Toda escritura va primero a IndexedDB y a una cola de mutaciones (`outbox`). Cuando hay conexión, el sync engine hace push de la cola y pull incremental (`updated_since` con timestamp por tabla). Resolución de conflictos: last-write-wins por campo a nivel de serie registrada — el conflicto real es casi imposible (un atleta no registra la misma serie desde dos dispositivos a la vez), y para la edición de programas del coach se usa versionado optimista (`version` int, si el server tiene versión mayor, se notifica y se ofrece merge manual).

---

## 3. Schema de base de datos

### 3.1 Local (Dexie / IndexedDB)

```ts
// db.ts
import Dexie, { Table } from 'dexie';

export interface Program {
  id: string;              // uuid
  ownerId: string;
  name: string;            // "Mesociclo Hipertrofia DUP v3"
  weeks: number;           // semanas normales (4)
  hasDeload: boolean;
  sessions: string[];      // ["A","B","C"]
  status: 'draft' | 'active' | 'archived';
  version: number;
  updatedAt: number;
}

export interface ProgramExercise {
  id: string;
  programId: string;
  week: number | 'deload';
  session: string;          // "A" | "B" | "C"
  order: number;            // posición dentro de la sesión
  name: string;
  muscleGroup: string;      // "Cuádriceps", "Pecho", ...
  sets: number;
  refKg: number | 'BW' | null | string;  // null = máquina variable; "25kg/m" = carga por lado/implemento
  repsMin: number;
  repsMax: number;
  repUnit: 'reps' | 'pasos';
  tempo: string;            // "2-0-1-0"
  restSec: number;          // 150 (parseado de "2'30\"")
  rirTarget: string;        // "2-3"
  supersetWith: string | null;  // id (no nombre) del partner
  updatedAt: number;
}

export interface Cycle {
  id: string;
  programId: string;
  athleteId: string;
  label: string;            // "C1", "C2"
  startedAt: number;
  archivedAt: number | null;
}

export interface SetLog {
  id: string;
  cycleId: string;
  programExerciseId: string;
  week: number | 'deload';
  session: string;
  exerciseName: string;     // denormalizado para el Historial
  setNumber: number;
  kg: number | null;        // null si BW puro
  reps: number;
  rir: number | null;
  e1rm: number | null;      // calculado al guardar (Brzycki)
  loggedAt: number;
  note: string | null;
}

export interface BodyMeasurement {
  id: string;
  athleteId: string;
  period: string;           // "Inicio C1", "Fin C1"
  date: number;
  values: Record<string, number>;  // { cuello: 38, pecho: 104, brazoDer: 38.5, ... }
  wristCm: number | null;   // base para proporciones McCallum
}

export interface OutboxMutation {
  id?: number;              // autoincrement
  table: string;
  op: 'put' | 'delete';
  payload: unknown;
  ts: number;
}

class ForgeDB extends Dexie {
  programs!: Table<Program>;
  programExercises!: Table<ProgramExercise>;
  cycles!: Table<Cycle>;
  setLogs!: Table<SetLog>;
  measurements!: Table<BodyMeasurement>;
  outbox!: Table<OutboxMutation>;

  constructor() {
    super('forge');
    this.version(1).stores({
      programs: 'id, ownerId, status, updatedAt',
      programExercises: 'id, programId, [programId+week+session], updatedAt',
      cycles: 'id, athleteId, programId, archivedAt',
      setLogs: 'id, cycleId, [cycleId+week+session], programExerciseId, loggedAt',
      measurements: 'id, athleteId, date',
      outbox: '++id, ts',
    });
  }
}
export const db = new ForgeDB();
```

### 3.2 Remoto (PostgreSQL)

Espejo del schema local más las tablas de identidad y asignación:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coach','athlete','both')),
  coach_id UUID REFERENCES users(id),   -- null = independiente
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE programs (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  weeks INT NOT NULL DEFAULT 4,
  has_deload BOOLEAN NOT NULL DEFAULT true,
  sessions TEXT[] NOT NULL DEFAULT '{A,B,C}',
  status TEXT NOT NULL DEFAULT 'draft',
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE program_exercises (
  id UUID PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  week TEXT NOT NULL,                -- '1'..'4' | 'deload'
  session TEXT NOT NULL,
  "order" INT NOT NULL,
  name TEXT NOT NULL,
  muscle_group TEXT,
  sets INT NOT NULL,
  ref_kg TEXT,                       -- '120' | 'BW' | NULL | '25kg/m'
  reps_min INT, reps_max INT,
  rep_unit TEXT NOT NULL DEFAULT 'reps',
  tempo TEXT,
  rest_sec INT,
  rir_target TEXT,
  superset_with UUID REFERENCES program_exercises(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, week, session, "order")
);

CREATE TABLE assignments (
  id UUID PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES programs(id),
  athlete_id UUID NOT NULL REFERENCES users(id),
  assigned_by UUID NOT NULL REFERENCES users(id),
  starts_on DATE,
  UNIQUE (program_id, athlete_id)
);

CREATE TABLE cycles (
  id UUID PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES programs(id),
  athlete_id UUID NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,               -- 'C1', 'C2'
  started_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ
);

CREATE TABLE set_logs (
  id UUID PRIMARY KEY,
  cycle_id UUID NOT NULL REFERENCES cycles(id),
  program_exercise_id UUID REFERENCES program_exercises(id),
  week TEXT NOT NULL,
  session TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  set_number INT NOT NULL,
  kg NUMERIC(6,2),
  reps INT NOT NULL,
  rir NUMERIC(3,1),
  e1rm NUMERIC(6,2),
  logged_at TIMESTAMPTZ NOT NULL,
  note TEXT
);
CREATE INDEX idx_setlogs_cycle ON set_logs (cycle_id, week, session);
CREATE INDEX idx_setlogs_exercise_time ON set_logs (exercise_name, logged_at);

CREATE TABLE body_measurements (
  id UUID PRIMARY KEY,
  athlete_id UUID NOT NULL REFERENCES users(id),
  period TEXT,
  date DATE NOT NULL,
  values JSONB NOT NULL,
  wrist_cm NUMERIC(4,1)
);
```

Permisos en la API: un coach solo lee/escribe programas propios y datos de atletas con `coach_id = coach`. Un atleta lee su programa asignado (sin editar `program_exercises`) y escribe únicamente sus `set_logs`, `cycles` y `body_measurements`.

---

## 4. Fórmulas y reglas de negocio

**e1RM (Brzycki)** — `e1rm = kg × 36 / (37 − reps)`. Se calcula al guardar cada serie y se persiste (no solo en vista) para que el Historial sea autosuficiente, igual que tu Sheet. Reglas: si `reps > 12` el estimado pierde precisión → se calcula igual pero se marca con flag de baja confianza en la UI; si `refKg = 'BW'` sin lastre, no se calcula e1RM (o se calcula sobre peso corporal + lastre si el atleta cargó peso corporal en su perfil).

**Series por semana** — la cantidad de series vive en `program_exercises.sets` por fila semana × ejercicio (como en tu Sheet, donde el deload ya tiene series − 1 explícitas). El generador de programa aplica la regla automáticamente al crear las filas de deload: `sets_deload = max(1, sets − 1)`, editable después.

**Tonelaje** — `Σ (kg × reps)` por semana y por grupo muscular. Series con `repUnit = 'pasos'` o `refKg` no numérico quedan excluidas del tonelaje y se reportan aparte (volumen de acarreo).

**Predicción de carga próxima semana** — regresión lineal simple sobre e1RM de las últimas 3–4 semanas por ejercicio; se sugiere `kg_sugerido = e1rm_proyectado × %intensidad_objetivo` redondeado a 2,5 kg. Es sugerencia visible, nunca escritura automática sobre el programa.

**Proporciones McCallum** — a partir de muñeca (`w`): pecho = 6,5 × w; cintura = 0,70 × pecho; cadera = 0,85 × pecho; muslo = 0,53 × pecho; cuello = 0,37 × pecho; brazo = 0,36 × pecho; pantorrilla = 0,34 × pecho. Se muestran como barras de % alcanzado. Asimetrías: |der − izq| / max(der, izq) con umbral de alerta configurable (default 5%).

---

## 5. Importación desde Excel

Endpoint `POST /import/excel` (openpyxl en FastAPI) o parseo client-side con SheetJS — recomiendo client-side para que funcione offline y el server solo reciba el JSON ya normalizado.

Flujo en tres pasos, estilo asistente:

1. **Subida y detección** — el usuario sube el .xlsx. El parser busca la hoja "Programa" (o la primera hoja) y detecta la fila de encabezados por matching difuso contra alias conocidos: `Semana → week`, `Sesión/Sesion/Día → session`, `Ejercicio → name`, `Series/Sets → sets`, `Ref KG/Peso/Kg → refKg`, `Reps min`, `Reps max`, `Tempo`, `Descanso/Rest → restSec`, `RIR`, `Superserie → supersetWith`, `Orden`, `Grupo/Grupo muscular → muscleGroup`.
2. **Mapeo y validación** — pantalla de mapeo columna → campo con lo detectado precargado. Validaciones antes de confirmar: semanas fuera de rango, sesiones desconocidas, reps min > max, superseries que referencian ejercicios inexistentes (se resuelven por nombre dentro de la misma semana+sesión y se convierten a id), descansos no parseables ("2'30\"" → 150 s; acepta también "2:30", "150").
3. **Vista previa e importación** — resumen (N ejercicios, sesiones detectadas, semanas) con los errores/warnings listados por fila. Al confirmar se crea el `Program` en estado `draft`.

La exportación inversa (programa → .xlsx con formato de tu plantilla actual) usa el mismo mapeo, lo que permite ida y vuelta con el sistema de Sheets durante la transición.

---

## 6. Estructura de carpetas (Next.js App Router)

```
forge/
├── app/
│   ├── (auth)/login/
│   ├── (app)/
│   │   ├── layout.tsx              # shell + tab bar + sync indicator
│   │   ├── page.tsx                # Hoy: sesión sugerida + accesos
│   │   ├── entrenar/
│   │   │   ├── page.tsx            # selector semana × sesión
│   │   │   └── [week]/[session]/page.tsx   # pantalla de entrenamiento activo
│   │   ├── programa/
│   │   │   ├── page.tsx            # lista de programas
│   │   │   ├── [id]/page.tsx       # editor (grilla semana × sesión)
│   │   │   └── importar/page.tsx   # asistente Excel
│   │   ├── progreso/
│   │   │   ├── page.tsx            # dashboard (e1RM trends, tonelaje, deltas)
│   │   │   └── mesociclo/page.tsx  # vista agregada ejercicio × semana
│   │   ├── medidas/page.tsx
│   │   ├── historial/page.tsx
│   │   └── alumnos/                # solo rol coach
│   │       ├── page.tsx            # lista + adherencia
│   │       └── [id]/page.tsx       # detalle de un alumno
├── lib/
│   ├── db.ts                       # Dexie schema
│   ├── sync.ts                     # outbox push / pull incremental
│   ├── formulas.ts                 # brzycki, tonelaje, mccallum, predicción
│   ├── excel.ts                    # import/export SheetJS
│   └── time.ts                     # parseo "2'30\"" ↔ segundos
├── components/
│   ├── workout/                    # ExerciseCard, SetRow, RestTimer, SupersetBanner
│   ├── program/                    # ProgramGrid, ExerciseForm, ImportWizard
│   ├── charts/                     # E1rmTrend, TonnageBars, Sparkline
│   └── ui/                         # primitivas (Button, NumField, Sheet, Tabs)
└── public/manifest.json            # PWA
```

---

## 7. Pantallas principales (wireframes)

### 7.1 Entrenamiento activo (la pantalla crítica, mobile una mano)

Un ejercicio por pantalla, navegación por swipe o botones. Todo lo accionable en el tercio inferior.

```
┌─────────────────────────────┐
│ Sem 2 · Sesión A      3/7 ● │  ← progreso de la sesión
│ ●●●○○○○                     │
├─────────────────────────────┤
│ CUÁDRICEPS                  │
│ Belt Squat                  │
│ Ref: 120kg × 10-12          │
│ T 2-0-1-0 · D 2'30" · RIR 2-3│
│ ┌─────────────────────────┐ │
│ │ Sem 1: 120×12 120×11    │ │  ← qué hice la semana pasada
│ │        120×10 · e1RM 156│ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ S1  [ 120 ]kg [ 12 ] [ 2 ]✓ │  ← inputs grandes, mono
│ S2  [ 120 ]kg [ 11 ] [ 2 ]✓ │
│ S3  [ 122.5]kg [  9 ] [ 3 ]  │
│ S4  [     ]kg [    ] [   ]  │
├─────────────────────────────┤
│ ⏱ DESCANSO  1:47 ▓▓▓▓░░ Saltar│  ← timer auto al completar serie
├─────────────────────────────┤
│  ◀ Anterior      Siguiente ▶ │
└─────────────────────────────┘
```

Superserie: al completar una serie del ejercicio 1, en vez de timer se navega automáticamente al partner con banner `⚡ SUPERSERIE — sin descanso`; el timer corre recién al completar la serie del segundo ejercicio.

### 7.2 Editor de programa (desktop-friendly, usable en mobile)

Grilla por sesión con las semanas como columnas colapsables; edición inline de series/kg por semana, y ficha completa del ejercicio en drawer.

```
Programa: Meso DUP v3          [Importar Excel] [Duplicar semana] [+]
┌─ Sesión A ──────────────────────────────────────────────────┐
│ #  Ejercicio        Grupo      S1    S2    S3    S4    DL   │
│ 1  Belt Squat       Cuádriceps 4×120 4×120 4×122 4×125 3×100│
│ 2  PM Rumano        Isquios    3×80  3×80  3×82  3×85  2×70 │
│ 3  Prensa 45°       Cuádriceps 3×140 …                      │
│    ⚡ 4+5 superserie                                        │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Progreso / Mesociclo

```
┌─ e1RM por ejercicio ────────────┐  ┌─ Tonelaje semanal ─────┐
│ Belt Squat   150→153→156→159 ↗ │  │ S1 ▓▓▓▓▓▓▓ 18.2t       │
│ Press Plano  102→104→103→107 ↗ │  │ S2 ▓▓▓▓▓▓▓▓ 19.1t +5%  │
│ Dominadas     —  (BW)          │  │ S3 ▓▓▓▓▓▓▓▓▓ 19.8t +4% │
└────────────────────────────────┘  │ S4 ▓▓▓▓▓▓▓▓▓▓ 20.4t +3%│
                                    └────────────────────────┘
Desglose por grupo muscular · Predicción Sem 5 · Exportar ciclo
```

### 7.4 Vista coach

Lista de alumnos con semáforo de adherencia (sesiones completadas / programadas en los últimos 7 días), último entrenamiento, alerta si el RIR reportado promedio se desvía > 1 punto del objetivo (carga mal calibrada). Tap en alumno → su Progreso completo + comentarios por sesión (canal de feedback asincrónico coach ↔ alumno).

---

## 8. Roadmap sugerido

**MVP (este entregable, validación de UX)** — programa seed editable, pantalla de entrenamiento activo mobile con timer y superseries, e1RM y progresión básica, persistencia local.

**v0.2** — Next.js + Dexie + PWA instalable, import/export Excel, historial y archivado de ciclos, medidas corporales con McCallum.

**v0.3** — backend FastAPI: auth, sync, multiusuario coach/alumno, comentarios por sesión.

**v1.0** — predicciones de carga, desglose por grupo muscular completo, export PDF de informes para alumnos (reutilizando tu sistema de generación de documentos del estudio).
