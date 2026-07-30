import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";

/* ============================================================
   FORGE — Tracking de entrenamiento (MVP v2)
   Superserie blocks (2-4 ex), health check, historial, semáforo.
   ============================================================ */

const DEFAULT_SESSIONS = [
  { id: "A", name: "Volumen & Tempo" },
  { id: "B", name: "Moderada & Variación" },
  { id: "C", name: "Intensidad & Fuerza" },
];

/* ---------- Seed: Ciclo 2 ---------- */
const SEED = [
  { id: "a1",  session: "A", order: 1,  name: "Sentadilla pendular",       group: "Cuádriceps",    sets: 3, refKg: null,     repsMin: 8,  repsMax: 10, tempo: "3-1-1-0", rest: 150, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "a2",  session: "A", order: 2,  name: "Press Plano (barra)",       group: "Pecho",         sets: 3, refKg: 65,       repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 150, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "a3",  session: "A", order: 3,  name: "Remo T (soporte pect.)",    group: "Espalda",       sets: 3, refKg: 42.5,     repsMin: 8,  repsMax: 10, tempo: "2-0-1-1", rest: 150, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "a4",  session: "A", order: 4,  name: "Sillón de cuádriceps",      group: "Cuádriceps",    sets: 3, refKg: 60,       repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 90,  rir: "2-3", superset: "a9",   unit: "reps", description: "" },
  { id: "a5",  session: "A", order: 5,  name: "Vuelos laterales (DB)",     group: "Hombros",       sets: 3, refKg: 10,       repsMin: 12, repsMax: 15, tempo: "2-0-1-0", rest: 90,  rir: "1-2", superset: null,   unit: "reps", description: "" },
  { id: "a6",  session: "A", order: 6,  name: "Ext. tríceps overhead (DB)",group: "Tríceps",       sets: 3, refKg: 32.5,     repsMin: 10, repsMax: 12, tempo: "2-0-1-0", rest: 90,  rir: "1-2", superset: null,   unit: "reps", description: "" },
  { id: "a7",  session: "A", order: 7,  name: "Curl sentado (DB)",         group: "Bíceps",        sets: 3, refKg: 12.5,     repsMin: 10, repsMax: 12, tempo: "2-0-1-0", rest: 90,  rir: "1-2", superset: null,   unit: "reps", description: "" },
  { id: "a8",  session: "A", order: 8,  name: "Gemelo sentado",            group: "Gemelos",       sets: 3, refKg: 45,       repsMin: 12, repsMax: 15, tempo: "2-1-1-1", rest: 90,  rir: "1-2", superset: null,   unit: "reps", description: "" },
  { id: "a9",  session: "A", order: 9,  name: "Camilla isquios",           group: "Isquios",       sets: 3, refKg: 50,       repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 90,  rir: "2-3", superset: "a4",   unit: "reps", description: "" },
  { id: "a10", session: "A", order: 10, name: "Extensión lumbar",          group: "Core",          sets: 2, refKg: 30,       repsMin: 12, repsMax: 15, tempo: "2-0-1-0", rest: 90,  rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "a11", session: "A", order: 11, name: "Shrugs DB",                 group: "Espalda",       sets: 3, refKg: 25,       repsMin: 12, repsMax: 15, tempo: "2-0-1-0", rest: 90,  rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "a12", session: "A", order: 12, name: "Curl sentado brazo I (DB)", group: "Bíceps",        sets: 2, refKg: 12.5,     repsMin: 8,  repsMax: 12, tempo: "2-0-1-0", rest: 60,  rir: "1-2", superset: "a13",  unit: "reps", description: "" },
  { id: "a13", session: "A", order: 13, name: "Ext. overhead brazo I (DB)",group: "Tríceps",       sets: 2, refKg: null,     repsMin: 8,  repsMax: 12, tempo: "2-0-1-0", rest: 60,  rir: "1-2", superset: "a12",  unit: "reps", description: "" },
  { id: "b1",  session: "B", order: 1,  name: "Prensa 45°",               group: "Cuádriceps",    sets: 3, refKg: 120,      repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 150, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "b2",  session: "B", order: 2,  name: "Dominadas",                 group: "Espalda",       sets: 3, refKg: "BW",     repsMin: 4,  repsMax: 8,  tempo: "2-0-1-0", rest: 180, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "b3",  session: "B", order: 3,  name: "Camilla isquios",           group: "Isquios",       sets: 3, refKg: 50,       repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 120, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "b4",  session: "B", order: 4,  name: "Press inclinado (DB)",      group: "Pecho",         sets: 3, refKg: 25,       repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 120, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "b5",  session: "B", order: 5,  name: "Vuelos posteriores",        group: "Hombros",       sets: 3, refKg: null,     repsMin: 12, repsMax: 15, tempo: "2-0-1-1", rest: 90,  rir: "1-2", superset: null,   unit: "reps", description: "" },
  { id: "b6",  session: "B", order: 6,  name: "Face pulls",                group: "Espalda",       sets: 3, refKg: null,     repsMin: 12, repsMax: 15, tempo: "2-0-1-1", rest: 90,  rir: "1-2", superset: null,   unit: "reps", description: "" },
  { id: "b7",  session: "B", order: 7,  name: "Ext. tríceps (polea)",      group: "Tríceps",       sets: 3, refKg: null,     repsMin: 10, repsMax: 12, tempo: "2-0-1-0", rest: 60,  rir: "1-2", superset: "b8",   unit: "reps", description: "" },
  { id: "b8",  session: "B", order: 8,  name: "Curl bíceps (polea)",       group: "Bíceps",        sets: 3, refKg: null,     repsMin: 10, repsMax: 12, tempo: "2-0-1-0", rest: 60,  rir: "1-2", superset: "b7",   unit: "reps", description: "" },
  { id: "b9",  session: "B", order: 9,  name: "Gemelo prensa 45",          group: "Gemelos",       sets: 3, refKg: 180,      repsMin: 12, repsMax: 15, tempo: "2-1-1-1", rest: 90,  rir: "1-2", superset: null,   unit: "reps", description: "" },
  { id: "b10", session: "B", order: 10, name: "Caminata granjero",         group: "Core",          sets: 3, refKg: "25kg/m", repsMin: 40, repsMax: 60, tempo: "",         rest: 120, rir: "",    superset: null,   unit: "pasos", description: "" },
  { id: "c1",  session: "C", order: 1,  name: "Prensa horizontal",         group: "Cuádriceps",    sets: 4, refKg: null,     repsMin: 6,  repsMax: 8,  tempo: "3-1-1-0", rest: 180, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "c2",  session: "C", order: 2,  name: "Press Plano (pesado)",      group: "Pecho",         sets: 4, refKg: 70,       repsMin: 4,  repsMax: 6,  tempo: "2-0-1-0", rest: 180, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "c3",  session: "C", order: 3,  name: "Remo T (prono)",            group: "Espalda",       sets: 3, refKg: 45,       repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 150, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "c4",  session: "C", order: 4,  name: "Peso Muerto Trap Bar",      group: "Isquios",       sets: 3, refKg: 115,      repsMin: 6,  repsMax: 8,  tempo: "2-0-1-0", rest: 180, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "c5",  session: "C", order: 5,  name: "Hip Thrust",                group: "Isquios/Glúteos",sets: 3,refKg: 60,       repsMin: 8,  repsMax: 10, tempo: "2-0-1-1", rest: 120, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "c6",  session: "C", order: 6,  name: "Apertura máquina",          group: "Pecho",         sets: 3, refKg: 70,       repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 90,  rir: "1-2", superset: null,   unit: "reps", description: "" },
  { id: "c7",  session: "C", order: 7,  name: "Press francés",             group: "Tríceps",       sets: 2, refKg: 32.5,     repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 60,  rir: "1-2", superset: "c8",   unit: "reps", description: "" },
  { id: "c8",  session: "C", order: 8,  name: "Curl DB",                   group: "Bíceps",        sets: 2, refKg: 15,       repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 60,  rir: "1-2", superset: "c7",   unit: "reps", description: "" },
  { id: "c9",  session: "C", order: 9,  name: "Press máquina hombros",     group: "Hombros",       sets: 3, refKg: 35,       repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 120, rir: "2-3", superset: null,   unit: "reps", description: "" },
  { id: "c10", session: "C", order: 10, name: "Extensión lumbar",          group: "Core",          sets: 2, refKg: 35,       repsMin: 12, repsMax: 15, tempo: "2-0-1-0", rest: 90,  rir: "2-3", superset: null,   unit: "reps", description: "" },
];

/* ---------- Helpers ---------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const brzycki = (kg, reps) => (reps > 0 && reps < 37 ? (kg * 36) / (37 - reps) : null);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmtRest = (s) => (s % 60 === 0 ? `${s / 60}'` : `${Math.floor(s / 60)}'${s % 60}"`);
const setsFor = (ex, week) => (week === "DL" ? Math.max(1, ex.sets - 1) : ex.sets);
const keyOf = (week, exId, n) => `${week}|${exId}|${n}`;
const weekLabel = (w) => (w === "DL" ? "Deload" : `Sem ${w}`);
const isNum = (v) => typeof v === "number" && !isNaN(v);
const round1 = (v) => Math.round(v * 10) / 10;
const fmtDate = (ts) => new Date(ts).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
function refLine(ex) {
  const kg = ex.refKg === null || ex.refKg === "" ? "máquina" : ex.refKg === "BW" ? "BW" : `${ex.refKg}${isNum(ex.refKg) ? "kg" : ""}`;
  return `${kg} × ${ex.repsMin}-${ex.repsMax} ${ex.unit === "pasos" ? "pasos" : ""}`.trim();
}

/* ---------- Blocks: group exercises into singles + superset groups ---------- */
function getBlocks(exercises) {
  const sorted = [...exercises].sort((a, b) => a.order - b.order);
  const blocks = [];
  const used = new Set();
  for (const ex of sorted) {
    if (used.has(ex.id)) continue;
    if (!ex.superset) {
      blocks.push({ type: "single", exercises: [ex] });
      used.add(ex.id);
    } else {
      // Collect all linked exercises in the chain
      const chain = [ex];
      used.add(ex.id);
      let current = ex;
      while (current.superset && !used.has(current.superset)) {
        const partner = sorted.find((e) => e.id === current.superset);
        if (!partner) break;
        chain.push(partner);
        used.add(partner.id);
        current = partner;
      }
      // Sort chain by order
      chain.sort((a, b) => a.order - b.order);
      blocks.push({ type: "superset", exercises: chain });
    }
  }
  return blocks;
}

/* ---------- Helpers: isDone ---------- */
function isDone(log) { return log && ((log.kg !== undefined && log.kg !== "") || (log.reps !== undefined && log.reps !== "")); }

/* ---------- Semáforo ---------- */
function semaphore(exercise, logs, week) {
  const n = setsFor(exercise, week);
  const sets = [];
  for (let i = 1; i <= n; i++) { const l = logs[keyOf(week, exercise.id, i)]; if (l && isDone(l)) sets.push(l); }
  if (!sets.length || exercise.unit === "pasos") return "gray";
  const guideReps = exercise.repsMin;
  const guideRir = parseFloat(exercise.rir) || 0;
  const repsOk = sets.every((s) => parseInt(s.reps) >= guideReps);
  const rirsValid = sets.filter((s) => isNum(parseFloat(s.rir)));
  const avgRir = rirsValid.length ? rirsValid.reduce((a, s) => a + parseFloat(s.rir), 0) / rirsValid.length : null;
  if (repsOk && (avgRir === null || avgRir >= guideRir)) return "green";
  if (repsOk) return "yellow";
  return "red";
}
const SEM_LABELS = { green: "Subir peso", yellow: "Mantener", red: "Revisar", gray: "" };
const SEM_COLORS = { green: "#34C759", yellow: "#FF9500", red: "#FF3B30", gray: "#D1D1D6" };

/* ---------- Program template ---------- */
const SEED_PROGRAM = {
  id: "seed-dup-c2",
  name: "Mesociclo DUP · Ciclo 2",
  weeks: 4,
  hasDeload: true,
  sessions: DEFAULT_SESSIONS,
  exercises: SEED,
  status: "active",
  createdAt: 0,
};

/* ---------- Persistencia ---------- */
function migrateState(raw) {
  // v1 → v2: flat program[] + sessions[] → programs[] with activeProgramId
  if (raw && raw.program && !raw.programs) {
    const migrated = {
      programs: [{
        id: "seed-dup-c2",
        name: "Mesociclo DUP · Ciclo 2",
        weeks: 4,
        hasDeload: true,
        sessions: raw.sessions || DEFAULT_SESSIONS,
        exercises: (raw.program || SEED).map((e) => ({ ...e, description: e.description ?? "" })),
        status: "active",
        createdAt: 0,
      }],
      activeProgramId: "seed-dup-c2",
      logs: raw.logs || {},
      history: (raw.history || []).map((h) => ({ ...h, programId: h.programId || "seed-dup-c2" })),
    };
    return migrated;
  }
  // Already v2 — ensure description field on exercises
  if (raw && raw.programs) {
    return {
      ...raw,
      programs: raw.programs.map((p) => ({
        ...p,
        exercises: (p.exercises || []).map((e) => ({ ...e, description: e.description ?? "" })),
      })),
    };
  }
  return null;
}

function loadState() {
  try {
    const r = localStorage.getItem("forge-v2");
    if (!r) return null;
    return migrateState(JSON.parse(r));
  } catch { return null; }
}
let saveT = null;
function saveState(s) { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem("forge-v2", JSON.stringify(s)); } catch {} }, 500); }

/* ---------- Mini components ---------- */
function ExSetRow({ ex, n, week, logs, onSetChange }) {
  const k = keyOf(week, ex.id, n);
  const l = logs[k] || {};
  const handleChange = (field, val) => onSetChange(ex, n, field, val);
  // Pre-fill KG with refKg on first focus if empty
  const prefillKg = () => { if ((l.kg === undefined || l.kg === "") && isNum(ex.refKg)) handleChange("kg", String(ex.refKg)); };
  return (
    <div className={`setrow ${l.done ? "done" : ""}`}>
      <span className="setn mono">S{n}</span>
      <input className="nf mono" inputMode="decimal" placeholder={isNum(ex.refKg) ? String(ex.refKg) : ex.refKg === "BW" ? "0" : "—"}
        value={l.kg ?? ""} onFocus={prefillKg} onChange={(e) => handleChange("kg", e.target.value)} />
      <input className="nf mono" inputMode="numeric" placeholder={`${ex.repsMax}`}
        value={l.reps ?? ""} onChange={(e) => handleChange("reps", e.target.value)} />
      <input className="nf mono" inputMode="decimal" placeholder={ex.rir || "—"}
        value={l.rir ?? ""} onChange={(e) => handleChange("rir", e.target.value)} />
    </div>
  );
}

/* ============================================================ */
export default function ForgeApp() {
  const [programs, setPrograms] = useState([{ ...SEED_PROGRAM, exercises: SEED.map((e) => ({ ...e })) }]);
  const [activeProgramId, setActiveProgramId] = useState("seed-dup-c2");
  const [logs, setLogs] = useState({});
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [tab, setTab] = useState("entrenar");
  const [week, setWeek] = useState(1);
  const [session, setSession] = useState(null);
  const [blockIdx, setBlockIdx] = useState(0);
  const [timer, setTimer] = useState(null);
  const [editing, setEditing] = useState(null);
  const [progSession, setProgSession] = useState(null); // session id
  const [editingSessions, setEditingSessions] = useState(false);
  const [healthCheck, setHealthCheck] = useState(null);
  const [savedHealth, setSavedHealth] = useState(null);
  const [sessionStart, setSessionStart] = useState(null);
  const [expandedLog, setExpandedLog] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // "finish" | "exit" | null
  const [reentryChoice, setReentryChoice] = useState(null); // session id pending choice
  const [descModal, setDescModal] = useState(null); // exercise object to show description
  const [programListView, setProgramListView] = useState(false); // show program list vs active program
  const [editingProgram, setEditingProgram] = useState(null); // program metadata editor
  const [importWizard, setImportWizard] = useState(null); // { step, data, mapping, preview, name }

  // Derived: active program, sessions, exercises
  const activeProgram = programs.find((p) => p.id === activeProgramId) || programs[0];
  const sessions = activeProgram?.sessions || DEFAULT_SESSIONS;
  const program = activeProgram?.exercises || [];

  // Helpers to update active program fields
  const updateActiveProgram = (updater) => setPrograms((ps) => ps.map((p) => p.id === activeProgramId ? (typeof updater === "function" ? updater(p) : { ...p, ...updater }) : p));
  const setSessions = (updater) => updateActiveProgram((p) => ({ ...p, sessions: typeof updater === "function" ? updater(p.sessions) : updater }));
  const setProgram = (updater) => updateActiveProgram((p) => ({ ...p, exercises: typeof updater === "function" ? updater(p.exercises) : updater }));

  useEffect(() => {
    const s = loadState();
    if (s) {
      setPrograms(s.programs || [{ ...SEED_PROGRAM, exercises: SEED.map((e) => ({ ...e })) }]);
      setActiveProgramId(s.activeProgramId || s.programs?.[0]?.id || "seed-dup-c2");
      setLogs(s.logs || {});
      setHistory(s.history || []);
    }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) saveState({ programs, activeProgramId, logs, history }); }, [programs, activeProgramId, logs, history, loaded]);

  useEffect(() => {
    if (!timer || timer.remaining <= 0) return;
    const iv = setInterval(() => {
      setTimer((t) => {
        if (!t || t.remaining <= 0) return t;
        if (t.remaining === 1) { try { navigator.vibrate?.([200, 100, 200]); } catch {} return { ...t, remaining: 0 }; }
        return { ...t, remaining: t.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [timer?.id]);

  const weeks = useMemo(() => {
    const n = activeProgram?.weeks || 4;
    const ws = Array.from({ length: n }, (_, i) => i + 1);
    if (activeProgram?.hasDeload) ws.push("DL");
    return ws;
  }, [activeProgram?.weeks, activeProgram?.hasDeload]);

  const sessName = (id) => { const s = sessions.find((s) => s.id === id); return s ? s.name : id; };
  const activeProgSession = progSession || (sessions[0]?.id ?? "A");
  const sessionExs = useMemo(() => program.filter((e) => e.session === session).sort((a, b) => a.order - b.order), [program, session]);
  const blocks = useMemo(() => getBlocks(sessionExs), [sessionExs]);
  const block = blocks[blockIdx];

  function countDone(exercise) { let n = 0; for (let i = 1; i <= setsFor(exercise, week); i++) if (isDone(logs[keyOf(week, exercise.id, i)])) n++; return n; }
  function blockDone(b) { return b.exercises.every((ex) => countDone(ex) >= setsFor(ex, week)); }

  function onSetChange(exercise, setN, field, val) {
    const k = keyOf(week, exercise.id, setN);
    setLogs((L) => {
      const prev = L[k] || {};
      const next = { ...prev, [field]: val };
      // Auto-mark done when has data
      next.done = isDone(next);
      // Parse for storage
      if (next.kg !== undefined && next.kg !== "") next.kg = next.kg;
      if (next.reps !== undefined && next.reps !== "") next.reps = next.reps;
      return { ...L, [k]: next };
    });
  }

  function prevWeekSummary(exercise) {
    const pw = week === "DL" ? 4 : week - 1;
    if (!pw || pw < 1) return null;
    const rows = [];
    for (let i = 1; i <= setsFor(exercise, pw); i++) { const l = logs[keyOf(pw, exercise.id, i)]; if (l?.done) rows.push(l); }
    if (!rows.length) return null;
    const best = Math.max(...rows.map((r) => (isNum(r.kg) && r.reps ? brzycki(r.kg, r.reps) || 0 : 0)));
    return { pw, rows, e1rm: best > 0 ? Math.round(best) : null };
  }

  function hasSessionData(w, sessId) {
    return program.filter((e) => e.session === sessId).some((ex) => {
      for (let i = 1; i <= setsFor(ex, w); i++) if (isDone(logs[keyOf(w, ex.id, i)])) return true;
      return false;
    });
  }

  function clearSessionLogs(w, sessId) {
    setLogs((L) => {
      const next = { ...L };
      program.filter((e) => e.session === sessId).forEach((ex) => {
        for (let i = 1; i <= setsFor(ex, w); i++) delete next[keyOf(w, ex.id, i)];
      });
      return next;
    });
  }

  function startSession(s) {
    if (hasSessionData(week, s)) {
      setReentryChoice(s);
    } else {
      setHealthCheck({ sleep: 3, stress: 3, energy: 3 }); setSession(s); setBlockIdx(0);
    }
  }

  function handleReentry(action) {
    const s = reentryChoice;
    setReentryChoice(null);
    if (action === "review") {
      setSession(s); setBlockIdx(0); setSessionStart(Date.now()); // skip health check, go straight to workout
    } else if (action === "fresh") {
      clearSessionLogs(week, s);
      // Also remove previous history entry for this week+session
      setHistory((H) => H.filter((h) => !(h.week === week && h.session === s)));
      setHealthCheck({ sleep: 3, stress: 3, energy: 3 }); setSession(s); setBlockIdx(0);
    }
  }

  function confirmHealth() { setSavedHealth(healthCheck); setSessionStart(Date.now()); setHealthCheck(null); }

  function handleConfirmOk() {
    if (confirmAction === "finish") {
      const exs = program.filter((e) => e.session === session);
      const exerciseData = exs.map((exercise) => {
        const sets = [];
        for (let i = 1; i <= setsFor(exercise, week); i++) { const l = logs[keyOf(week, exercise.id, i)]; if (l && isDone(l)) sets.push({ setN: i, kg: parseFloat(l.kg) || null, reps: parseInt(l.reps) || null, rir: parseFloat(l.rir) || null }); }
        return { id: exercise.id, name: exercise.name, group: exercise.group, sets, sem: semaphore(exercise, logs, week) };
      });
      const entry = { id: uid(), programId: activeProgramId, week, session, sessionName: sessName(session), date: Date.now(), duration: sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : null, health: savedHealth, exercises: exerciseData };
      // Replace existing entry for same week+session, or add new
      setHistory((H) => {
        const existing = H.findIndex((h) => h.week === week && h.session === session);
        if (existing >= 0) { const next = [...H]; next[existing] = entry; return next; }
        return [entry, ...H];
      });
    }
    setSession(null); setTimer(null); setSessionStart(null); setSavedHealth(null);
    setConfirmAction(null);
  }

  const metrics = useMemo(() => {
    const tonnage = {}; const e1rms = {};
    for (const [k, l] of Object.entries(logs)) {
      if (!l.done) continue; const [w, exId] = k.split("|");
      const exercise = program.find((e) => e.id === exId);
      if (!exercise || exercise.unit === "pasos") continue;
      if (isNum(l.kg) && l.reps) { tonnage[w] = (tonnage[w] || 0) + l.kg * l.reps; const e1 = brzycki(l.kg, l.reps); if (e1) { e1rms[exId] = e1rms[exId] || {}; e1rms[exId][w] = Math.max(e1rms[exId][w] || 0, e1); } }
    }
    return { tonnage, e1rms };
  }, [logs, program]);

  function saveExercise(draft) { setProgram((P) => { const exists = P.some((e) => e.id === draft.id); return exists ? P.map((e) => (e.id === draft.id ? draft : e)) : [...P, draft]; }); setEditing(null); }
  function deleteExercise(id) { setProgram((P) => P.filter((e) => e.id !== id).map((e) => (e.superset === id ? { ...e, superset: null } : e))); setEditing(null); }

  // Blocks for Programa tab (must be before early return)
  const progBlocks = useMemo(() => getBlocks(program.filter((e) => e.session === activeProgSession)), [program, activeProgSession]);

  if (!loaded) return <div style={{ background: "#F2F2F7", minHeight: "100vh" }} />;

  return (
    <div className="forge">
      <style>{CSS}</style>
      <div className="phone">

        {/* ======== HEALTH CHECK ======== */}
        {tab === "entrenar" && session !== null && healthCheck && (
          <div className="screen">
            <header className="top"><div className="brand">FORGE</div><h1>Como te sentís hoy?</h1><p className="sub">{weekLabel(week)} · {sessName(session)}</p></header>
            {[
              { key: "sleep", label: "Sueño", emoji: ["😴", "😪", "😐", "😊", "😁"] },
              { key: "stress", label: "Estrés", emoji: ["🧘", "😌", "😐", "😣", "😤"] },
              { key: "energy", label: "Energía", emoji: ["🪫", "😮‍💨", "😐", "💪", "⚡"] },
            ].map(({ key, label, emoji }) => (
              <div key={key} className="hc-row">
                <div className="hc-label">{label}</div>
                <div className="hc-pills">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button key={v} className={`hc-pill ${healthCheck[key] === v ? "on" : ""}`} onClick={() => setHealthCheck((h) => ({ ...h, [key]: v }))}>
                      <span className="hc-emoji">{emoji[v - 1]}</span><span className="hc-val">{v}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="navrow" style={{ marginTop: 24 }}>
              <button className="navbtn" onClick={() => { setSession(null); setHealthCheck(null); }}>Cancelar</button>
              <button className="navbtn pri" onClick={confirmHealth}>Empezar</button>
            </div>
          </div>
        )}

        {/* ======== ENTRENAR SELECTOR ======== */}
        {tab === "entrenar" && session === null && (
          <div className="screen">
            <header className="top"><div className="brand">FORGE</div><h1>Entrenar</h1><p className="sub">{activeProgram?.name}</p></header>
            <div className="weekchips">
              {weeks.map((w) => (<button key={w} className={`chip ${week === w ? "on" : ""} ${w === "DL" ? "dl" : ""}`} onClick={() => setWeek(w)}>{w === "DL" ? "Deload" : `S${w}`}</button>))}
            </div>
            {week === "DL" && <div className="dlnote">Deload: series - 1, bajá la intensidad</div>}
            <div className="sessioncards">
              {sessions.map((sess) => {
                const exs = program.filter((e) => e.session === sess.id);
                const groups = [...new Set(exs.map((e) => e.group))].slice(0, 3).join(" · ");
                const total = exs.reduce((a, e) => a + setsFor(e, week), 0);
                const done = exs.reduce((a, e) => { let n = 0; for (let i = 1; i <= setsFor(e, week); i++) if (logs[keyOf(week, e.id, i)]?.done) n++; return a + n; }, 0);
                const allDone = done === total && total > 0;
                return (
                  <button key={sess.id} className={`scard ${allDone ? "completed" : ""}`} onClick={() => startSession(sess.id)}>
                    <div className="sletter">{sess.id}</div>
                    <div className="sinfo"><div className="sname">{sess.name}</div><div className="sgroups">{groups}</div><div className="sbar"><div style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} /></div></div>
                    <div className="sright"><span className="spct mono">{allDone ? "Done" : `${done}/${total}`}</span></div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ======== ENTRENAMIENTO ACTIVO (block-based) ======== */}
        {tab === "entrenar" && session !== null && !healthCheck && block && (
          <div className="screen workout">
            <header className="wtop">
              <button className="back" onClick={() => setConfirmAction("exit")}>&#8249;</button>
              <div className="wtitle">
                <span>{weekLabel(week)} · {sessName(session)}</span>
                <div className="dots">
                  {blocks.map((b, i) => (
                    <span key={i} className={`dot ${blockDone(b) ? "full" : ""} ${i === blockIdx ? "cur" : ""} ${b.type === "superset" ? "wide" : ""}`}
                      onClick={() => setBlockIdx(i)} />
                  ))}
                </div>
              </div>
              <button className="finish-btn" onClick={() => setConfirmAction("finish")}>Terminar</button>
            </header>

            {block.type === "superset" && (
              <div className="ssbanner">
                ⚡ {block.exercises.length === 2 ? "SUPERSERIE" : block.exercises.length === 3 ? "TRI-SET" : "GIANT SET"} — {block.exercises.map((e) => e.name).join(" + ")}
              </div>
            )}

            {block.exercises.map((ex, exI) => (
              <div key={ex.id} className={`excard ${block.type === "superset" ? "ss-grouped" : ""} ${exI === 0 && block.type === "superset" ? "ss-first" : ""} ${exI === block.exercises.length - 1 && block.type === "superset" ? "ss-last" : ""}`}>
                <div className="excard-head">
                  <div>
                    <div className="eyebrow">{ex.group}{block.type === "superset" && <span className="ss-idx"> · {exI + 1}/{block.exercises.length}</span>}</div>
                    <h2 className={ex.description ? "has-desc" : ""} onClick={() => ex.description && setDescModal(ex)}>{ex.name}{ex.description ? <span className="desc-hint">i</span> : null}</h2>
                  </div>
                  {(() => { const pv = prevWeekSummary(ex); return pv?.e1rm ? <span className="pv-mini mono" title={weekLabel(pv.pw)}>e1RM {pv.e1rm}</span> : null; })()}
                </div>
                <div className="refline mono">
                  Ref: {refLine(ex)}{ex.tempo ? <><span className="sep">|</span> T {ex.tempo}</> : null}<span className="sep">|</span> D {fmtRest(ex.rest)}{ex.rir ? <><span className="sep">|</span> RIR {ex.rir}</> : null}
                </div>

                <div className="sets">
                  <div className="setshead"><span></span><span>{ex.refKg === "BW" ? "+KG" : "KG"}</span><span>{ex.unit === "pasos" ? "PASOS" : "REPS"}</span><span>RIR</span></div>
                  {Array.from({ length: setsFor(ex, week) }, (_, i) => i + 1).map((n) => (
                    <ExSetRow key={n} ex={ex} n={n} week={week} logs={logs} onSetChange={onSetChange} />
                  ))}
                </div>

                {(() => {
                  let best = 0;
                  for (let i = 1; i <= setsFor(ex, week); i++) { const l = logs[keyOf(week, ex.id, i)]; if (isDone(l) && isNum(parseFloat(l.kg)) && parseInt(l.reps)) best = Math.max(best, brzycki(parseFloat(l.kg), parseInt(l.reps)) || 0); }
                  return best > 0 ? <div className="ex-footer"><span className="e1rmnow mono">e1RM: <b>{Math.round(best)}</b></span></div> : null;
                })()}
              </div>
            ))}

            <div className="navrow">
              <button className="navbtn" disabled={blockIdx === 0} onClick={() => setBlockIdx((i) => i - 1)}>&#8249; Anterior</button>
              {blockIdx < blocks.length - 1 ? (
                <button className="navbtn pri" onClick={() => setBlockIdx((i) => i + 1)}>Siguiente &#8250;</button>
              ) : (
                <button className="navbtn pri" onClick={() => setConfirmAction("finish")}>Terminar &#10003;</button>
              )}
            </div>
          </div>
        )}

        {/* ======== PROGRAMA — LIST VIEW ======== */}
        {tab === "programa" && programListView && (
          <div className="screen">
            <header className="top"><div className="brand">FORGE</div><h1>Programas</h1><p className="sub">{programs.length} programa{programs.length !== 1 ? "s" : ""}</p></header>
            <div className="prog-list">
              {programs.map((p) => (
                <button key={p.id} className={`prog-card ${p.id === activeProgramId ? "active" : ""}`} onClick={() => { setActiveProgramId(p.id); setProgSession(null); setProgramListView(false); }}>
                  <div className="prog-card-main">
                    <div className="prog-card-name">{p.name}</div>
                    <div className="prog-card-meta">{p.sessions.length} sesiones · {p.exercises.length} ejercicios · {p.weeks} sem{p.hasDeload ? " + deload" : ""}</div>
                  </div>
                  {p.id === activeProgramId && <span className="prog-active-badge">Activo</span>}
                </button>
              ))}
            </div>
            <button className="addbtn" onClick={() => {
              const id = uid();
              setPrograms((ps) => [...ps, { id, name: "Nuevo programa", weeks: 4, hasDeload: true, sessions: [{ id: "A", name: "Sesion A" }], exercises: [], status: "draft", createdAt: Date.now() }]);
              setActiveProgramId(id);
              setProgSession(null);
              setProgramListView(false);
            }}>+ Crear programa</button>
            <button className="addbtn" style={{ marginTop: 8 }} onClick={() => {
              const id = uid();
              setPrograms((ps) => [...ps, { ...SEED_PROGRAM, id, name: "Mesociclo DUP (copia)", exercises: SEED.map((e) => ({ ...e, id: uid() })), createdAt: Date.now() }]);
              setActiveProgramId(id);
              setProgSession(null);
              setProgramListView(false);
            }}>+ Desde plantilla predefinida</button>
            <button className="addbtn import-btn" style={{ marginTop: 8 }} onClick={() => setImportWizard({ step: 1 })}>+ Importar Excel</button>
          </div>
        )}

        {/* ======== PROGRAMA — ACTIVE PROGRAM DETAIL ======== */}
        {tab === "programa" && !programListView && (
          <div className="screen">
            <header className="top">
              <div className="brand">FORGE</div>
              <div className="prog-header-row">
                <h1>{activeProgram?.name || "Programa"}</h1>
                <button className="prog-switch-btn" onClick={() => setProgramListView(true)}>&#9776;</button>
              </div>
              <p className="sub">{activeProgram?.weeks || 4} sem{activeProgram?.hasDeload ? " + deload" : ""} · {sessions.length} sesiones · {program.length} ejercicios {session === null && <button className="prog-edit-link" onClick={() => setEditingProgram({ ...activeProgram })}>Editar programa</button>}</p>
            </header>
            <div className="weekchips">
              {sessions.map((s) => (<button key={s.id} className={`chip ${activeProgSession === s.id ? "on" : ""}`} onClick={() => setProgSession(s.id)}>{s.name}</button>))}
              {session === null && <button className="chip chip-edit" onClick={() => setEditingSessions(true)}>&#9998;</button>}
            </div>
            <div className="plist">
              {progBlocks.map((b, bi) => (
                <div key={bi} className={b.type === "superset" ? "prog-ss-group" : ""}>
                  {b.type === "superset" && <div className="prog-ss-label">⚡ {b.exercises.length === 2 ? "Superserie" : b.exercises.length === 3 ? "Tri-set" : "Giant set"}</div>}
                  {b.exercises.map((e) => (
                    <button key={e.id} className={`prow ${b.type === "superset" ? "in-ss" : ""}`} onClick={() => {
                      if (session !== null) { alert("Terminá o cancelá la sesión activa para editar el programa."); return; }
                      setEditing({ ...e });
                    }}>
                      <div className="pmain"><div className="pname">{e.name}{e.description && <span className="desc-hint-sm">i</span>}{session !== null && <span className="lock-inline">🔒</span>}</div><div className="pmeta">{e.group}</div></div>
                      <div className="pnums mono">{e.sets}x{e.repsMin}-{e.repsMax} · {refLine(e).split(" ×")[0]}</div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {session === null && (
              <button className="addbtn" onClick={() => setEditing({ id: uid(), session: activeProgSession, order: (Math.max(0, ...program.filter((e) => e.session === activeProgSession).map((e) => e.order)) + 1), name: "", group: "", sets: 3, refKg: "", repsMin: 8, repsMax: 12, tempo: "2-0-1-0", rest: 120, rir: "2", superset: null, unit: "reps", description: "" })}>+ Agregar ejercicio</button>
            )}
          </div>
        )}

        {/* ======== HISTORIAL ======== */}
        {tab === "historial" && (
          <div className="screen">
            <header className="top"><div className="brand">FORGE</div><h1>Historial</h1><p className="sub">{history.filter((h) => !h.programId || h.programId === activeProgramId).length} sesiones registradas</p></header>
            {history.filter((h) => !h.programId || h.programId === activeProgramId).length === 0 && <div className="empty">Completá tu primera sesión para verla acá.</div>}
            {history.filter((h) => !h.programId || h.programId === activeProgramId).map((h) => (
              <div key={h.id} className="hist-card">
                <button className="hist-head" onClick={() => setExpandedLog(expandedLog === h.id ? null : h.id)}>
                  <div className="hist-left"><div className="hist-title">{weekLabel(h.week)} · {h.sessionName || sessName(h.session)}</div><div className="hist-meta">{fmtDate(h.date)}{h.duration ? ` · ${h.duration} min` : ""}</div></div>
                  {h.health && <div className="hist-health mono"><span>😴{h.health.sleep}</span><span>😤{h.health.stress}</span><span>⚡{h.health.energy}</span></div>}
                  <span className="hist-chev">{expandedLog === h.id ? "▲" : "▼"}</span>
                </button>
                {expandedLog === h.id && (
                  <div className="hist-body">
                    {h.exercises.filter((e) => e.sets.length > 0).map((e) => (
                      <div key={e.id} className="hist-ex">
                        <div className="hist-exhead"><span className="hist-exname">{e.name}</span><span className="sem-dot-sm" style={{ background: SEM_COLORS[e.sem] }} /></div>
                        <div className="hist-sets mono">{e.sets.map((s, i) => <span key={i}>{isNum(s.kg) ? s.kg : "BW"}×{s.reps}{isNum(s.rir) ? ` @${s.rir}` : ""}</span>)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ======== PROGRESO ======== */}
        {tab === "progreso" && (
          <div className="screen">
            <header className="top"><div className="brand">FORGE</div><h1>Progreso</h1><p className="sub">e1RM (Brzycki) y tonelaje del ciclo</p></header>
            <div className="card">
              <div className="cardtitle">Tonelaje semanal</div>
              {(() => { const vals = weeks.map((w) => metrics.tonnage[String(w)] || 0); const max = Math.max(...vals, 1);
                return weeks.map((w, i) => { const v = vals[i]; const prev = i > 0 ? vals[i - 1] : 0; const delta = prev > 0 && v > 0 ? Math.round(((v - prev) / prev) * 100) : null;
                  return (<div key={w} className="tonrow"><span className="tonlbl">{w === "DL" ? "DL" : `S${w}`}</span><div className="tonbar"><div style={{ width: `${(v / max) * 100}%` }} /></div><span className="tonval mono">{v > 0 ? `${round1(v / 1000)}t` : "—"}</span><span className={`tondelta mono ${delta > 0 ? "up" : delta < 0 ? "dn" : ""}`}>{delta !== null ? `${delta > 0 ? "+" : ""}${delta}%` : ""}</span></div>);
                }); })()}
            </div>
            <div className="card">
              <div className="cardtitle">e1RM por ejercicio</div>
              <div className="e1head mono" style={{ gridTemplateColumns: `1fr repeat(${activeProgram?.weeks || 4}, 42px)` }}><span></span>{Array.from({ length: activeProgram?.weeks || 4 }, (_, i) => <span key={i}>S{i + 1}</span>)}</div>
              {program.filter((e) => metrics.e1rms[e.id]).map((e) => {
                const row = Array.from({ length: activeProgram?.weeks || 4 }, (_, i) => metrics.e1rms[e.id][String(i + 1)]); const nums = row.filter(Boolean);
                const trend = nums.length >= 2 ? (nums[nums.length - 1] > nums[0] ? "↗" : nums[nums.length - 1] < nums[0] ? "↘" : "→") : "";
                return (<div key={e.id} className="e1row" style={{ gridTemplateColumns: `1fr repeat(${activeProgram?.weeks || 4}, 42px)` }}><span className="e1name">{e.name} <span className={`tr ${trend === "↗" ? "up" : trend === "↘" ? "dn" : ""}`}>{trend}</span></span>{row.map((v, i) => <span key={i} className="mono e1v">{v ? Math.round(v) : "·"}</span>)}</div>);
              })}
              {Object.keys(metrics.e1rms).length === 0 && <div className="empty">Registrá series con kg y reps para ver tu e1RM acá.</div>}
            </div>
          </div>
        )}

        {/* ======== TIMER ======== */}
        {timer && (
          <div className={`timerbar ${timer.remaining === 0 ? "zero" : ""}`}>
            <div className="tfill" style={{ width: `${(1 - timer.remaining / timer.total) * 100}%` }} />
            <div className="tcontent"><span className="tlabel">{timer.remaining === 0 ? "A LA BARRA!" : "DESCANSO"}</span><span className="ttime mono">{fmtTime(timer.remaining)}</span><button className="tskip" onClick={() => setTimer(null)}>{timer.remaining === 0 ? "OK" : "Saltar"}</button></div>
          </div>
        )}

        {/* ======== REENTRY MODAL ======== */}
        {reentryChoice && (
          <div className="overlay centered" onClick={() => setReentryChoice(null)}>
            <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
              <p className="confirm-msg">Ya registraste {sessName(reentryChoice)} en {weekLabel(week)}</p>
              <div className="reentry-actions">
                <button className="reentry-btn" onClick={() => handleReentry("review")}>
                  <span className="reentry-icon">&#9998;</span>
                  <span className="reentry-label">Revisar / Editar</span>
                  <span className="reentry-sub">Modificar datos y guardar</span>
                </button>
                <button className="reentry-btn danger" onClick={() => handleReentry("fresh")}>
                  <span className="reentry-icon">&#8635;</span>
                  <span className="reentry-label">Empezar de cero</span>
                  <span className="reentry-sub">Borrar datos y repetir</span>
                </button>
              </div>
              <button className="confirm-cancel" style={{ width: "100%", marginTop: 10 }} onClick={() => setReentryChoice(null)}>Cancelar</button>
            </div>
          </div>
        )}

        {/* ======== DESCRIPTION MODAL ======== */}
        {descModal && (
          <div className="overlay centered" onClick={() => setDescModal(null)}>
            <div className="confirm-box desc-modal" onClick={(e) => e.stopPropagation()}>
              <div className="desc-modal-head">
                <div className="eyebrow">{descModal.group}</div>
                <h3>{descModal.name}</h3>
              </div>
              <p className="desc-modal-body">{descModal.description}</p>
              <button className="confirm-ok" style={{ width: "100%", marginTop: 12 }} onClick={() => setDescModal(null)}>OK</button>
            </div>
          </div>
        )}

        {/* ======== CONFIRM MODAL ======== */}
        {confirmAction && (
          <div className="overlay centered" onClick={() => setConfirmAction(null)}>
            <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
              <p className="confirm-msg">{confirmAction === "finish" ? "Terminar la sesión y guardar al historial?" : "Salir sin guardar?"}</p>
              <div className="confirm-actions">
                <button className="confirm-cancel" onClick={() => setConfirmAction(null)}>Cancelar</button>
                <button className="confirm-ok" onClick={handleConfirmOk}>OK</button>
              </div>
            </div>
          </div>
        )}

        {/* ======== SESSION EDITOR ======== */}
        {editingSessions && (
          <div className="overlay" onClick={() => setEditingSessions(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheethead"><h3>Sesiones</h3><button className="x" onClick={() => setEditingSessions(false)}>×</button></div>
              <div className="sess-list">
                {sessions.map((s) => {
                  const exCount = program.filter((e) => e.session === s.id).length;
                  return (
                    <div key={s.id} className="sess-row">
                      <span className="sess-id mono">{s.id}</span>
                      <input className="sess-name-input" value={s.name} onChange={(e) => setSessions((S) => S.map((x) => x.id === s.id ? { ...x, name: e.target.value } : x))} />
                      <span className="sess-count mono">{exCount} ej.</span>
                      <button className="sess-del" onClick={() => {
                        if (exCount > 0 && !window.confirm(`"${s.name}" tiene ${exCount} ejercicios. Eliminar sesión y sus ejercicios?`)) return;
                        setSessions((S) => S.filter((x) => x.id !== s.id));
                        setProgram((P) => P.filter((e) => e.session !== s.id));
                        if (activeProgSession === s.id) setProgSession(null);
                      }}>×</button>
                    </div>
                  );
                })}
              </div>
              <button className="addbtn" style={{ marginTop: 12 }} onClick={() => {
                const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
                const used = new Set(sessions.map((s) => s.id));
                const next = letters.find((l) => !used.has(l)) || `S${sessions.length + 1}`;
                setSessions((S) => [...S, { id: next, name: `Sesión ${next}` }]);
              }}>+ Agregar sesión</button>
            </div>
          </div>
        )}

        {editing && <ExerciseEditor draft={editing} setDraft={setEditing} siblings={program.filter((e) => e.session === editing.session && e.id !== editing.id)} onSave={saveExercise} onDelete={deleteExercise} isNew={!program.some((e) => e.id === editing.id)} />}

        {/* ======== PROGRAM EDITOR MODAL ======== */}
        {editingProgram && (
          <div className="overlay" onClick={() => setEditingProgram(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheethead"><h3>Editar programa</h3><button className="x" onClick={() => setEditingProgram(null)}>&times;</button></div>
              <div className="ed-form">
                <label className="ed-full"><span>Nombre</span><input value={editingProgram.name} onChange={(e) => setEditingProgram((p) => ({ ...p, name: e.target.value }))} /></label>
                <div className="ed-row2">
                  <label><span>Semanas</span><input className="mono" inputMode="numeric" value={editingProgram.weeks} onChange={(e) => setEditingProgram((p) => ({ ...p, weeks: parseInt(e.target.value) || 0 }))} /></label>
                  <label className="ed-check-label"><span>Deload</span><div className="ed-toggle-row"><button className={`ed-toggle ${editingProgram.hasDeload ? "on" : ""}`} onClick={() => setEditingProgram((p) => ({ ...p, hasDeload: !p.hasDeload }))}>{editingProgram.hasDeload ? "Si" : "No"}</button></div></label>
                </div>
              </div>
              <div className="sheetactions" style={{ flexDirection: "column", gap: 8 }}>
                <button className="save" onClick={() => { updateActiveProgram({ name: editingProgram.name, weeks: editingProgram.weeks, hasDeload: editingProgram.hasDeload }); setEditingProgram(null); }}>Guardar</button>
                <button className="prog-dup-btn" onClick={() => {
                  const id = uid();
                  const dup = { ...activeProgram, id, name: activeProgram.name + " (copia)", exercises: activeProgram.exercises.map((e) => ({ ...e, id: uid() })), createdAt: Date.now() };
                  setPrograms((ps) => [...ps, dup]);
                  setActiveProgramId(id);
                  setProgSession(null);
                  setEditingProgram(null);
                }}>Duplicar programa</button>
                {programs.length > 1 && (
                  <button className="del" style={{ width: "100%" }} onClick={() => {
                    if (!window.confirm(`Eliminar "${activeProgram.name}"? Esta accion no se puede deshacer.`)) return;
                    const remaining = programs.filter((p) => p.id !== activeProgramId);
                    setPrograms(remaining);
                    setActiveProgramId(remaining[0].id);
                    setProgSession(null);
                    setEditingProgram(null);
                    setProgramListView(false);
                  }}>Eliminar programa</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======== IMPORT WIZARD ======== */}
        {importWizard && <ImportWizard wizard={importWizard} setWizard={setImportWizard} onImport={(name, preview) => {
          const id = uid();
          const newProg = {
            id,
            name: name || "Programa importado",
            weeks: 4,
            hasDeload: true,
            sessions: preview.sessions,
            exercises: preview.exercises,
            status: "draft",
            createdAt: Date.now(),
          };
          setPrograms((ps) => [...ps, newProg]);
          setActiveProgramId(id);
          setProgSession(null);
          setProgramListView(false);
          setImportWizard(null);
        }} />}

        <nav className="tabbar">
          {[["programa", "Programa", "▤"], ["entrenar", "Entrenar", "◉"], ["historial", "Historial", "☰"], ["progreso", "Progreso", "↗"]].map(([id, label, icon]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => { setTab(id); if (id !== "entrenar") setTimer(null); }}><span className="ticon">{icon}</span>{label}</button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function ExerciseEditor({ draft, setDraft, siblings, onSave, onDelete, isNew }) {
  const set = (f, v) => setDraft((d) => ({ ...d, [f]: v }));
  const num = (v, int) => { const n = int ? parseInt(v) : parseFloat(v); return isNaN(n) ? "" : n; };
  return (
    <div className="overlay" onClick={() => setDraft(null)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheethead"><h3>{isNew ? "Nuevo ejercicio" : "Editar ejercicio"}</h3><button className="x" onClick={() => setDraft(null)}>×</button></div>
        <div className="ed-form">
          <label className="ed-full"><span>Ejercicio</span><input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Belt Squat" /></label>
          <label className="ed-full"><span>Grupo muscular</span><input value={draft.group} onChange={(e) => set("group", e.target.value)} placeholder="Cuádriceps" /></label>
          <div className="ed-row3">
            <label><span>Series</span><input className="mono" inputMode="numeric" value={draft.sets} onChange={(e) => set("sets", num(e.target.value, true))} /></label>
            <label><span>Reps min</span><input className="mono" inputMode="numeric" value={draft.repsMin} onChange={(e) => set("repsMin", num(e.target.value, true))} /></label>
            <label><span>Reps max</span><input className="mono" inputMode="numeric" value={draft.repsMax} onChange={(e) => set("repsMax", num(e.target.value, true))} /></label>
          </div>
          <div className="ed-row3">
            <label><span>Ref KG</span><input className="mono" value={draft.refKg ?? ""} onChange={(e) => { const v = e.target.value.trim(); const n = parseFloat(v); set("refKg", v === "" ? null : !isNaN(n) && String(n) === v ? n : v); }} placeholder="120" /></label>
            <label><span>Tempo</span><input className="mono" value={draft.tempo} onChange={(e) => set("tempo", e.target.value)} placeholder="2-0-1-0" /></label>
            <label><span>RIR</span><input className="mono" value={draft.rir} onChange={(e) => set("rir", e.target.value)} placeholder="2-3" /></label>
          </div>
          <div className="ed-row2">
            <label><span>Descanso (seg)</span><input className="mono" inputMode="numeric" value={draft.rest} onChange={(e) => set("rest", num(e.target.value, true))} /></label>
            <label><span>Unidad</span><select value={draft.unit} onChange={(e) => set("unit", e.target.value)}><option value="reps">reps</option><option value="pasos">pasos</option></select></label>
          </div>
          <label className="ed-full"><span>Superserie con</span><select value={draft.superset ?? ""} onChange={(e) => set("superset", e.target.value || null)}><option value="">— sin superserie —</option>{siblings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="ed-full"><span>Notas / Descripcion</span><textarea className="ed-textarea" rows={3} value={draft.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Postura, agarre, indicaciones del entrenador..." /></label>
        </div>
        <div className="sheetactions">
          {!isNew && <button className="del" onClick={() => onDelete(draft.id)}>Eliminar</button>}
          <button className="save" disabled={!draft.name || !draft.sets} onClick={() => onSave({ ...draft, repsMin: draft.repsMin || 0, repsMax: draft.repsMax || 0, rest: draft.rest || 90 })}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Excel import helpers ---------- */
const FIELD_ALIASES = {
  session:  ["sesion", "sesión", "dia", "día", "day", "session"],
  name:     ["ejercicio", "exercise", "nombre", "name"],
  group:    ["grupo", "grupo muscular", "muscle", "muscle group", "musclegroup"],
  sets:     ["series", "sets"],
  refKg:    ["ref kg", "peso", "kg", "ref", "carga", "weight", "refkg"],
  repsMin:  ["reps min", "repsmin", "rep min", "min reps", "minreps"],
  repsMax:  ["reps max", "repsmax", "rep max", "max reps", "maxreps"],
  reps:     ["reps", "repeticiones"],
  tempo:    ["tempo", "cadencia"],
  rest:     ["descanso", "rest", "pausa"],
  rir:      ["rir", "rpe"],
  superset: ["superserie", "superset", "ss"],
  order:    ["orden", "order", "#", "nro"],
  description: ["descripcion", "descripción", "notas", "notes", "desc"],
};

function matchColumn(header) {
  const h = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((a) => h === a || h.includes(a))) return field;
  }
  return null;
}

function parseRestValue(val) {
  if (typeof val === "number") return val;
  if (!val) return 90;
  const s = String(val).trim();
  // "2'30\"" or "2:30" → seconds
  const m1 = s.match(/^(\d+)[':]\s*(\d+)/);
  if (m1) return parseInt(m1[1]) * 60 + parseInt(m1[2]);
  const n = parseInt(s);
  return isNaN(n) ? 90 : n;
}

function parseReps(val) {
  if (!val) return { min: 0, max: 0 };
  const s = String(val).trim();
  const m = s.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (m) return { min: parseInt(m[1]), max: parseInt(m[2]) };
  const n = parseInt(s);
  return isNaN(n) ? { min: 0, max: 0 } : { min: n, max: n };
}

function parseRefKg(val) {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim().toUpperCase();
  if (s === "BW" || s === "BODYWEIGHT") return "BW";
  const n = parseFloat(s);
  return isNaN(n) ? s : n;
}

function parseExcelData(rows, mapping) {
  const exercises = [];
  const sessionSet = new Set();
  let order = 0;

  for (const row of rows) {
    const name = row[mapping.name];
    if (!name || !String(name).trim()) continue;

    const sessionRaw = mapping.session != null ? String(row[mapping.session] || "A").trim().toUpperCase() : "A";
    const session = sessionRaw.charAt(0);
    sessionSet.add(session);

    let repsMin = 0, repsMax = 0;
    if (mapping.repsMin != null && mapping.repsMax != null) {
      repsMin = parseInt(row[mapping.repsMin]) || 0;
      repsMax = parseInt(row[mapping.repsMax]) || 0;
    } else if (mapping.reps != null) {
      const parsed = parseReps(row[mapping.reps]);
      repsMin = parsed.min;
      repsMax = parsed.max;
    }

    order++;
    exercises.push({
      id: uid(),
      session,
      order: mapping.order != null ? (parseInt(row[mapping.order]) || order) : order,
      name: String(name).trim(),
      group: mapping.group != null ? String(row[mapping.group] || "").trim() : "",
      sets: mapping.sets != null ? (parseInt(row[mapping.sets]) || 3) : 3,
      refKg: mapping.refKg != null ? parseRefKg(row[mapping.refKg]) : null,
      repsMin,
      repsMax,
      tempo: mapping.tempo != null ? String(row[mapping.tempo] || "").trim() : "",
      rest: mapping.rest != null ? parseRestValue(row[mapping.rest]) : 90,
      rir: mapping.rir != null ? String(row[mapping.rir] || "").trim() : "",
      superset: mapping.superset != null ? String(row[mapping.superset] || "").trim() || null : null,
      unit: "reps",
      description: mapping.description != null ? String(row[mapping.description] || "").trim() : "",
    });
  }

  // Resolve superset references by name → id
  for (const ex of exercises) {
    if (ex.superset && typeof ex.superset === "string") {
      const partner = exercises.find((e) => e.name.toLowerCase() === ex.superset.toLowerCase() && e.session === ex.session && e.id !== ex.id);
      ex.superset = partner ? partner.id : null;
    }
  }

  const sessions = [...sessionSet].sort().map((id) => ({ id, name: `Sesion ${id}` }));
  return { exercises, sessions };
}

function downloadTemplate() {
  const header = ["Sesion", "Orden", "Ejercicio", "Grupo muscular", "Series", "Reps min", "Reps max", "Ref KG", "Tempo", "Descanso", "RIR", "Superserie", "Descripcion"];
  const examples = [
    ["A", 1, "Sentadilla", "Cuadriceps", 4, 8, 10, 100, "2-0-1-0", "150", "2-3", "", "Barra alta, rodillas hacia afuera"],
    ["A", 2, "Press plano", "Pecho", 3, 8, 10, 70, "2-0-1-0", "2'30\"", "2-3", "", ""],
    ["A", 3, "Remo con barra", "Espalda", 3, 8, 10, 60, "2-0-1-1", "2'", "2-3", "", "Agarre prono, tirar al ombligo"],
    ["A", 4, "Curl biceps", "Biceps", 3, 10, 12, 12.5, "2-0-1-0", "60", "1-2", "Extension triceps", ""],
    ["A", 5, "Extension triceps", "Triceps", 3, 10, 12, "", "2-0-1-0", "60", "1-2", "Curl biceps", ""],
    ["B", 1, "Peso muerto", "Isquios", 4, 6, 8, 120, "2-0-1-0", "3'", "2-3", "", "Convencional, espalda neutra"],
    ["B", 2, "Dominadas", "Espalda", 3, 4, 8, "BW", "2-0-1-0", "180", "2-3", "", ""],
    ["B", 3, "Press militar", "Hombros", 3, 8, 10, 40, "2-0-1-0", "120", "2-3", "", "De pie, core apretado"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...examples]);
  // Column widths
  ws["!cols"] = [{ wch: 8 }, { wch: 6 }, { wch: 22 }, { wch: 16 }, { wch: 7 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 20 }, { wch: 35 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Programa");
  XLSX.writeFile(wb, "forge-plantilla-programa.xlsx");
}

function ImportWizard({ wizard, setWizard, onImport }) {
  const fileRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "array" });
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("programa")) || wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (!rows.length) return;

      // Auto-detect column mapping
      const headers = Object.keys(rows[0]);
      const mapping = {};
      for (let i = 0; i < headers.length; i++) {
        const field = matchColumn(headers[i]);
        if (field && !(field in mapping)) mapping[field] = headers[i];
      }

      setWizard({ step: 2, rows, headers, mapping, name: file.name.replace(/\.(xlsx?|csv)$/i, ""), sheetName });
    };
    reader.readAsArrayBuffer(file);
  }

  // Step 1: Upload
  if (wizard.step === 1) {
    return (
      <div className="overlay" onClick={() => setWizard(null)}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheethead"><h3>Importar Excel</h3><button className="x" onClick={() => setWizard(null)}>&times;</button></div>
          <div className="import-upload">
            <p className="import-desc">Subi un archivo .xlsx o .csv con tu programa. Se detectaran las columnas automaticamente.</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />
            <button className="save" style={{ width: "100%", marginTop: 12 }} onClick={() => fileRef.current?.click()}>Seleccionar archivo</button>
            <div className="import-divider"><span>o</span></div>
            <button className="prog-dup-btn" style={{ width: "100%" }} onClick={downloadTemplate}>Descargar plantilla Excel</button>
            <p className="import-hint">Descarga la plantilla, completala con tus ejercicios y subila aca.</p>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Column mapping
  if (wizard.step === 2) {
    const fields = [
      { key: "session", label: "Sesion", required: false },
      { key: "name", label: "Ejercicio", required: true },
      { key: "group", label: "Grupo muscular", required: false },
      { key: "sets", label: "Series", required: false },
      { key: "refKg", label: "Ref KG", required: false },
      { key: "repsMin", label: "Reps min", required: false },
      { key: "repsMax", label: "Reps max", required: false },
      { key: "reps", label: "Reps (min-max)", required: false },
      { key: "tempo", label: "Tempo", required: false },
      { key: "rest", label: "Descanso", required: false },
      { key: "rir", label: "RIR", required: false },
      { key: "superset", label: "Superserie", required: false },
      { key: "order", label: "Orden", required: false },
      { key: "description", label: "Descripcion", required: false },
    ];
    const setMapping = (field, val) => setWizard((w) => ({ ...w, mapping: { ...w.mapping, [field]: val || undefined } }));
    const canProceed = wizard.mapping.name;

    return (
      <div className="overlay" onClick={() => setWizard(null)}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheethead"><h3>Mapeo de columnas</h3><button className="x" onClick={() => setWizard(null)}>&times;</button></div>
          <p className="import-desc">Hoja: <b>{wizard.sheetName}</b> · {wizard.rows.length} filas detectadas</p>
          <div className="import-mapping">
            {fields.map(({ key, label, required }) => (
              <div key={key} className="import-map-row">
                <span className="import-map-label">{label}{required && " *"}</span>
                <select className="import-map-select" value={wizard.mapping[key] || ""} onChange={(e) => setMapping(key, e.target.value)}>
                  <option value="">— ignorar —</option>
                  {wizard.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <label className="ed-full" style={{ marginTop: 12 }}><span>Nombre del programa</span><input value={wizard.name} onChange={(e) => setWizard((w) => ({ ...w, name: e.target.value }))} /></label>
          <div className="navrow" style={{ marginTop: 16 }}>
            <button className="navbtn" onClick={() => setWizard({ step: 1 })}>Atras</button>
            <button className="navbtn pri" disabled={!canProceed} onClick={() => {
              const { exercises, sessions } = parseExcelData(wizard.rows, wizard.mapping);
              setWizard((w) => ({ ...w, step: 3, preview: { exercises, sessions } }));
            }}>Vista previa</button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Preview & confirm
  if (wizard.step === 3) {
    const { exercises, sessions } = wizard.preview;
    const groups = [...new Set(exercises.map((e) => e.group).filter(Boolean))];
    return (
      <div className="overlay" onClick={() => setWizard(null)}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheethead"><h3>Vista previa</h3><button className="x" onClick={() => setWizard(null)}>&times;</button></div>
          <div className="import-summary">
            <div className="import-stat"><span className="import-stat-n mono">{exercises.length}</span> ejercicios</div>
            <div className="import-stat"><span className="import-stat-n mono">{sessions.length}</span> sesiones ({sessions.map((s) => s.id).join(", ")})</div>
            {groups.length > 0 && <div className="import-stat"><span className="import-stat-n mono">{groups.length}</span> grupos musculares</div>}
          </div>
          <div className="import-preview-list">
            {sessions.map((sess) => (
              <div key={sess.id}>
                <div className="import-sess-label">Sesion {sess.id} — {exercises.filter((e) => e.session === sess.id).length} ejercicios</div>
                {exercises.filter((e) => e.session === sess.id).map((e) => (
                  <div key={e.id} className="import-ex-row mono">
                    <span>{e.name}</span>
                    <span>{e.sets}x{e.repsMin}-{e.repsMax}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="navrow" style={{ marginTop: 16 }}>
            <button className="navbtn" onClick={() => setWizard((w) => ({ ...w, step: 2, preview: null }))}>Atras</button>
            <button className="navbtn pri" onClick={() => onImport(wizard.name, wizard.preview)}>Importar</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
.forge { min-height: 100vh; background: #F2F2F7; color: #1C1C1E; font-family: 'Inter', system-ui, sans-serif; display: flex; justify-content: center; -webkit-font-smoothing: antialiased; }
.forge * { box-sizing: border-box; margin: 0; }
.mono { font-family: 'DM Mono', monospace; font-variant-numeric: tabular-nums; }
.phone { width: 100%; max-width: 430px; min-height: 100vh; position: relative; padding-bottom: 76px; background: #F2F2F7; }
.screen { padding: 20px 16px 12px; }
.top { margin-bottom: 18px; }
.brand { font-size: 11px; letter-spacing: 0.35em; color: #2C6BED; font-weight: 700; margin-bottom: 10px; }
.top h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; color: #1C1C1E; }
.sub { color: #636366; font-size: 13px; margin-top: 4px; }
.dlnote { font-size: 13px; color: #7A5600; background: #FFF8E1; border: 1px solid #E8C840; padding: 8px 14px; border-radius: 10px; margin-bottom: 12px; font-weight: 500; }
.weekchips { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.chip { padding: 9px 16px; border-radius: 999px; border: 1px solid #D1D1D6; background: #FFF; color: #636366; font: 600 13px 'Inter'; cursor: pointer; transition: all .15s; }
.chip.on { background: #2C6BED; border-color: #2C6BED; color: #FFF; }
.chip.dl.on { background: #E8A317; border-color: #E8A317; color: #FFF; }
.sessioncards { display: flex; flex-direction: column; gap: 10px; }
.scard { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; padding: 16px 18px; background: #FFF; border: none; border-radius: 14px; cursor: pointer; color: inherit; transition: all .15s; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.scard:active { transform: scale(0.98); }
.scard.completed { background: #EBF2FF; }
.sletter { width: 48px; height: 48px; border-radius: 12px; background: #EBF2FF; color: #2C6BED; display: flex; align-items: center; justify-content: center; font: 700 20px 'Inter'; flex-shrink: 0; }
.sinfo { flex: 1; min-width: 0; }
.sname { font-weight: 600; font-size: 16px; }
.sgroups { color: #636366; font-size: 12px; margin: 3px 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sbar { height: 4px; background: #E5E5EA; border-radius: 2px; overflow: hidden; }
.sbar div { height: 100%; background: #2C6BED; border-radius: 2px; transition: width .3s; }
.sright { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.spct { color: #3A3A3C; font-size: 13px; font-weight: 600; }
.scard.completed .spct { color: #2C6BED; }
.sem-dot { width: 10px; height: 10px; border-radius: 50%; }

/* Health check */
.hc-row { margin-bottom: 20px; }
.hc-label { font-weight: 600; font-size: 15px; margin-bottom: 10px; }
.hc-pills { display: flex; gap: 8px; }
.hc-pill { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 0; border-radius: 12px; border: 1.5px solid #D1D1D6; background: #FFF; cursor: pointer; transition: all .15s; }
.hc-pill.on { border-color: #2C6BED; background: #EBF2FF; }
.hc-emoji { font-size: 22px; line-height: 1; }
.hc-val { font-size: 12px; color: #636366; font-weight: 600; }
.hc-pill.on .hc-val { color: #2C6BED; }

/* Workout */
.workout { padding-top: 14px; }
.wtop { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.back { width: 38px; height: 38px; border-radius: 10px; background: #FFF; border: none; color: #1C1C1E; font-size: 22px; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.wtitle { flex: 1; }
.wtitle > span { font-size: 14px; font-weight: 600; color: #48484A; }
.dots { display: flex; gap: 5px; margin-top: 5px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #D1D1D6; cursor: pointer; transition: all .15s; }
.dot.wide { width: 18px; border-radius: 4px; }
.dot.full { background: #2C6BED; }
.dot.cur { outline: 2px solid rgba(44,107,237,.4); outline-offset: 1px; }
.finish-btn { padding: 6px 14px; border-radius: 8px; border: none; background: #2C6BED; color: #FFF; font: 600 13px 'Inter'; cursor: pointer; flex-shrink: 0; }

.ssbanner { background: #FFF3E0; border: 1px solid #F5A623; color: #C75000; font-size: 14px; font-weight: 700; padding: 10px 14px; border-radius: 10px; margin-bottom: 10px; }

/* Exercise card — single and superset grouped */
.excard { background: #FFF; border: none; border-radius: 16px; padding: 20px 16px; box-shadow: 0 1px 4px rgba(0,0,0,.06); margin-bottom: 10px; }
.excard.ss-grouped { border-radius: 0; margin-bottom: 0; box-shadow: none; border-bottom: 1px solid #F2F2F7; }
.excard.ss-first { border-radius: 16px 16px 0 0; border-left: 3px solid #F5A623; }
.excard.ss-grouped:not(.ss-first):not(.ss-last) { border-left: 3px solid #F5A623; }
.excard.ss-last { border-radius: 0 0 16px 16px; border-bottom: none; border-left: 3px solid #F5A623; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.excard-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.pv-mini { font-size: 11px; color: #2C6BED; font-weight: 600; white-space: nowrap; padding-top: 4px; }
.ss-idx { font-weight: 400; color: #AEAEB2; }

.eyebrow { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #2C6BED; font-weight: 600; }
.excard h2 { font-size: 22px; font-weight: 700; margin: 2px 0 6px; color: #1C1C1E; }
.refline { font-size: 12px; color: #48484A; line-height: 1.5; }
.sep { color: #AEAEB2; margin: 0 3px; }
.sets { margin-top: 12px; }
.setshead { display: grid; grid-template-columns: 34px 1fr 1fr 1fr; gap: 8px; padding: 0 2px 6px; font-size: 11px; letter-spacing: .1em; color: #636366; font-weight: 600; }
.setshead span { text-align: center; } .setshead span:first-child { text-align: left; }
.setrow { display: grid; grid-template-columns: 34px 1fr 1fr 1fr; gap: 8px; align-items: center; margin-bottom: 6px; }
.setn { color: #48484A; font-size: 14px; font-weight: 600; }
.nf { width: 100%; height: 50px; background: #F2F2F7; border: 1.5px solid #D1D1D6; border-radius: 12px; color: #1C1C1E; font-size: 20px; text-align: center; transition: border-color .15s; }
.nf::placeholder { color: #AEAEB2; }
.nf:focus { outline: none; border-color: #2C6BED; box-shadow: 0 0 0 3px rgba(44,107,237,.12); }
.setrow.done .nf { border-color: transparent; background: #EBF2FF; color: #636366; }
.ck { height: 50px; width: 48px; border-radius: 12px; border: 1.5px solid #D1D1D6; background: #FFF; color: #AEAEB2; font-size: 18px; cursor: pointer; transition: all .15s; }
.ck:active { transform: translateY(1px); }
.ck.on { background: #2C6BED; border-color: #2C6BED; color: #FFF; }
.ex-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
.e1rmnow { font-size: 13px; color: #3A3A3C; }
.e1rmnow b { color: #2C6BED; font-weight: 700; font-size: 15px; }
.sem-badge { display: inline-block; padding: 4px 10px; border-radius: 999px; color: #FFF; font-size: 12px; font-weight: 700; }

.navrow { display: flex; gap: 10px; margin-top: 16px; }
.navbtn { flex: 1; height: 54px; border-radius: 14px; border: 1px solid #D1D1D6; background: #FFF; color: #1C1C1E; font: 600 15px 'Inter'; cursor: pointer; transition: all .15s; }
.navbtn:disabled { opacity: .3; }
.navbtn.pri { background: #2C6BED; border-color: #2C6BED; color: #FFF; font-weight: 700; }
.navbtn.pri:active { transform: translateY(1px); }

.timerbar { position: fixed; bottom: 64px; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; background: #FFF; border-top: 1px solid #E5E5EA; overflow: hidden; z-index: 30; box-shadow: 0 -2px 8px rgba(0,0,0,.06); }
.tfill { position: absolute; inset: 0; background: rgba(44,107,237,.08); transition: width 1s linear; }
.timerbar.zero .tfill { background: rgba(44,107,237,.18); }
.tcontent { position: relative; display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.tlabel { font-size: 11px; letter-spacing: .2em; color: #2C6BED; font-weight: 700; }
.ttime { font-size: 28px; color: #1C1C1E; font-weight: 700; }
.tskip { margin-left: auto; padding: 8px 18px; border-radius: 999px; border: 1px solid #D1D1D6; background: #F2F2F7; color: #636366; font: 500 13px 'Inter'; cursor: pointer; }

/* Programa list */
.plist { display: flex; flex-direction: column; gap: 8px; }
.prog-ss-group { background: #FFF; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.06); border-left: 3px solid #F5A623; overflow: hidden; }
.prog-ss-label { font-size: 12px; font-weight: 700; color: #C75000; padding: 8px 14px 4px; background: #FFF8F0; }
.prow { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; text-align: left; padding: 14px 16px; background: #FFF; border: none; border-radius: 12px; color: inherit; cursor: pointer; transition: background .15s; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
.prow.in-ss { border-radius: 0; box-shadow: none; border-bottom: 1px solid #F2F2F7; }
.prow.in-ss:last-child { border-bottom: none; }
.prow:active { background: #F2F2F7; }
.pname { font-weight: 600; font-size: 15px; color: #1C1C1E; }
.pmeta { color: #636366; font-size: 12px; margin-top: 2px; }
.pnums { color: #48484A; font-size: 13px; text-align: right; flex-shrink: 0; }
.addbtn { width: 100%; margin-top: 12px; height: 50px; border-radius: 12px; border: 1.5px dashed #C7C7CC; background: transparent; color: #2C6BED; font: 600 14px 'Inter'; cursor: pointer; }
.chip-edit { border-style: dashed; color: #2C6BED; border-color: #2C6BED; background: transparent; font-size: 15px; padding: 7px 12px; }

/* Session editor */
.sess-list { display: flex; flex-direction: column; gap: 8px; }
.sess-row { display: flex; align-items: center; gap: 8px; }
.sess-id { width: 28px; font-size: 14px; font-weight: 700; color: #2C6BED; text-align: center; flex-shrink: 0; }
.sess-name-input { flex: 1; height: 40px; background: #F2F2F7; border: 1.5px solid #D1D1D6; border-radius: 8px; color: #1C1C1E; padding: 0 10px; font: 400 14px 'Inter'; }
.sess-name-input:focus { outline: none; border-color: #2C6BED; }
.sess-count { font-size: 12px; color: #636366; flex-shrink: 0; white-space: nowrap; }
.sess-del { width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(255,59,48,.3); background: transparent; color: #FF3B30; font-size: 16px; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }

/* Historial */
.hist-card { background: #FFF; border-radius: 14px; margin-bottom: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.hist-head { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 14px 16px; background: none; border: none; color: inherit; cursor: pointer; font-family: inherit; }
.hist-left { flex: 1; min-width: 0; }
.hist-title { font-weight: 600; font-size: 15px; }
.hist-meta { font-size: 12px; color: #636366; margin-top: 2px; }
.hist-health { display: flex; gap: 6px; font-size: 12px; color: #48484A; flex-shrink: 0; }
.hist-chev { color: #AEAEB2; font-size: 12px; }
.hist-body { padding: 0 16px 14px; border-top: 1px solid #F2F2F7; }
.hist-ex { padding: 8px 0; border-bottom: 1px solid #F2F2F7; }
.hist-ex:last-child { border-bottom: none; }
.hist-exhead { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.hist-exname { font-weight: 500; font-size: 14px; }
.sem-dot-sm { width: 8px; height: 8px; border-radius: 50%; }
.hist-sets { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #48484A; }

/* Progress */
.card { background: #FFF; border: none; border-radius: 14px; padding: 18px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.cardtitle { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #636366; font-weight: 600; margin-bottom: 14px; }
.tonrow { display: grid; grid-template-columns: 30px 1fr 52px 46px; gap: 10px; align-items: center; margin-bottom: 10px; }
.tonlbl { color: #3A3A3C; font-size: 13px; font-weight: 600; }
.tonbar { height: 10px; background: #E5E5EA; border-radius: 5px; overflow: hidden; }
.tonbar div { height: 100%; background: #2C6BED; border-radius: 5px; transition: width .3s; }
.tonval { font-size: 13px; color: #1C1C1E; text-align: right; font-weight: 500; }
.tondelta { font-size: 12px; text-align: right; color: #636366; }
.tondelta.up { color: #34C759; } .tondelta.dn { color: #FF3B30; }
.e1head { display: grid; grid-template-columns: 1fr repeat(4, 42px); gap: 6px; font-size: 11px; color: #636366; padding-bottom: 8px; border-bottom: 1px solid #E5E5EA; margin-bottom: 6px; }
.e1head span { text-align: right; } .e1head span:first-child { text-align: left; }
.e1row { display: grid; grid-template-columns: 1fr repeat(4, 42px); gap: 6px; align-items: center; padding: 8px 0; border-bottom: 1px solid #F2F2F7; }
.e1row:last-child { border-bottom: none; }
.e1name { font-size: 14px; font-weight: 500; color: #1C1C1E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr { font-size: 13px; } .tr.up { color: #34C759; } .tr.dn { color: #FF3B30; }
.e1v { font-size: 13px; text-align: right; color: #3A3A3C; }
.empty { color: #636366; font-size: 14px; padding: 10px 0; }
.tabbar { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; display: flex; background: rgba(255,255,255,.92); backdrop-filter: blur(16px); border-top: 1px solid #E5E5EA; z-index: 40; }
.tabbar button { flex: 1; padding: 10px 0 14px; background: none; border: none; color: #636366; font: 500 11px 'Inter'; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.tabbar button.on { color: #2C6BED; }
.ticon { font-size: 18px; line-height: 1; }
/* Lock card */
.lock-card { display: flex; align-items: center; gap: 14px; padding: 18px; background: #FFF; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.lock-icon { font-size: 28px; flex-shrink: 0; }
.lock-title { font-weight: 600; font-size: 15px; color: #1C1C1E; }
.lock-sub { font-size: 13px; color: #636366; margin-top: 2px; }
.lock-inline { font-size: 11px; margin-left: 6px; }

.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.3); z-index: 50; display: flex; align-items: flex-end; justify-content: center; }
.overlay.centered { align-items: center; }
.confirm-box { background: #FFF; border-radius: 16px; padding: 24px 20px 16px; width: 300px; text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,.15); }
.confirm-msg { font-size: 16px; font-weight: 600; color: #1C1C1E; margin-bottom: 20px; line-height: 1.4; }
.confirm-actions { display: flex; gap: 10px; }
.confirm-cancel { flex: 1; height: 44px; border-radius: 10px; border: 1px solid #D1D1D6; background: #FFF; color: #636366; font: 600 15px 'Inter'; cursor: pointer; }
.confirm-ok { flex: 1; height: 44px; border-radius: 10px; border: none; background: #2C6BED; color: #FFF; font: 600 15px 'Inter'; cursor: pointer; }

/* Reentry modal */
.reentry-actions { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
.reentry-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 14px; border-radius: 12px; border: 1.5px solid #D1D1D6; background: #FFF; cursor: pointer; transition: all .15s; }
.reentry-btn:active { background: #F2F2F7; }
.reentry-btn.danger { border-color: rgba(255,59,48,.3); }
.reentry-icon { font-size: 20px; }
.reentry-label { font: 600 15px 'Inter'; color: #1C1C1E; }
.reentry-btn.danger .reentry-label { color: #FF3B30; }
.reentry-sub { font-size: 12px; color: #636366; }
.sheet { width: 100%; max-width: 430px; max-height: 88vh; overflow-y: auto; background: #FFF; border: none; border-radius: 20px 20px 0 0; padding: 20px 16px 28px; box-shadow: 0 -4px 20px rgba(0,0,0,.1); }
.sheethead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.sheethead h3 { font-size: 18px; font-weight: 700; }
.x { background: none; border: none; color: #636366; font-size: 28px; cursor: pointer; line-height: 1; }

/* Editor form — compact for mobile */
.ed-form { display: flex; flex-direction: column; gap: 12px; }
.ed-form label { display: flex; flex-direction: column; gap: 4px; }
.ed-form span { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #636366; font-weight: 600; }
.ed-form input, .ed-form select { height: 42px; background: #F2F2F7; border: 1.5px solid #D1D1D6; border-radius: 10px; color: #1C1C1E; padding: 0 10px; font: 400 14px 'Inter'; width: 100%; }
.ed-form input.mono { font-family: 'DM Mono', monospace; }
.ed-form input:focus, .ed-form select:focus { outline: none; border-color: #2C6BED; }
.ed-form select { appearance: none; }
.ed-textarea { height: auto; min-height: 70px; padding: 10px; font: 400 14px 'Inter'; resize: vertical; line-height: 1.5; background: #F2F2F7; border: 1.5px solid #D1D1D6; border-radius: 10px; color: #1C1C1E; width: 100%; }
.ed-textarea:focus { outline: none; border-color: #2C6BED; }
.ed-full { width: 100%; }
.ed-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ed-row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }

.sheetactions { display: flex; gap: 10px; margin-top: 16px; }
.del { flex: 0 0 auto; padding: 0 18px; height: 46px; border-radius: 12px; border: 1px solid rgba(255,59,48,.3); background: transparent; color: #FF3B30; font: 600 14px 'Inter'; cursor: pointer; }
.save { flex: 1; height: 46px; border-radius: 12px; border: none; background: #2C6BED; color: #FFF; font: 700 15px 'Inter'; cursor: pointer; }
.save:disabled { opacity: .35; }
.prevbox { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; padding: 8px 12px; background: #F2F2F7; border: 1px dashed #AEAEB2; border-radius: 10px; font-size: 12px; color: #1C1C1E; }
.pvlabel { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #636366; font-weight: 600; }
.pve1 { margin-left: auto; color: #2C6BED; font-weight: 600; }
/* Program list */
.prog-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.prog-card { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; text-align: left; padding: 16px 18px; background: #FFF; border: 2px solid transparent; border-radius: 14px; cursor: pointer; color: inherit; transition: all .15s; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.prog-card:active { transform: scale(0.98); }
.prog-card.active { border-color: #2C6BED; background: #EBF2FF; }
.prog-card-name { font-weight: 600; font-size: 16px; color: #1C1C1E; }
.prog-card-meta { font-size: 12px; color: #636366; margin-top: 3px; }
.prog-active-badge { font-size: 11px; font-weight: 700; color: #2C6BED; background: #FFF; border: 1px solid #2C6BED; padding: 3px 10px; border-radius: 999px; flex-shrink: 0; }
.prog-header-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.prog-header-row h1 { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prog-switch-btn { width: 38px; height: 38px; border-radius: 10px; background: #FFF; border: 1px solid #D1D1D6; color: #636366; font-size: 18px; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.prog-edit-link { background: none; border: none; color: #2C6BED; font: 500 12px 'Inter'; cursor: pointer; padding: 0; margin-left: 4px; text-decoration: underline; }
.prog-dup-btn { width: 100%; height: 46px; border-radius: 12px; border: 1px solid #D1D1D6; background: #FFF; color: #1C1C1E; font: 600 14px 'Inter'; cursor: pointer; }
.ed-toggle-row { display: flex; }
.ed-toggle { height: 42px; width: 100%; border-radius: 10px; border: 1.5px solid #D1D1D6; background: #F2F2F7; color: #636366; font: 600 14px 'Inter'; cursor: pointer; transition: all .15s; }
.ed-toggle.on { background: #2C6BED; border-color: #2C6BED; color: #FFF; }
.ed-check-label { display: flex; flex-direction: column; gap: 4px; }

/* Description hint & modal */
.has-desc { cursor: pointer; }
.desc-hint { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #2C6BED; color: #FFF; font-size: 11px; font-weight: 700; font-style: italic; margin-left: 6px; vertical-align: middle; font-family: 'Inter', serif; }
.desc-hint-sm { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; background: #2C6BED; color: #FFF; font-size: 9px; font-weight: 700; font-style: italic; margin-left: 5px; vertical-align: middle; font-family: 'Inter', serif; }
.desc-modal { text-align: left; width: 340px; }
.desc-modal-head { margin-bottom: 12px; }
.desc-modal-head h3 { font-size: 18px; font-weight: 700; margin-top: 4px; }
.desc-modal-body { font-size: 14px; color: #3A3A3C; line-height: 1.6; white-space: pre-wrap; }
/* Import wizard */
.import-desc { font-size: 14px; color: #636366; line-height: 1.5; margin-bottom: 8px; }
.import-mapping { display: flex; flex-direction: column; gap: 8px; max-height: 50vh; overflow-y: auto; }
.import-map-row { display: flex; align-items: center; gap: 10px; }
.import-map-label { font-size: 13px; font-weight: 500; color: #1C1C1E; width: 110px; flex-shrink: 0; }
.import-map-select { flex: 1; height: 36px; background: #F2F2F7; border: 1px solid #D1D1D6; border-radius: 8px; color: #1C1C1E; padding: 0 8px; font: 400 13px 'Inter'; }
.import-summary { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
.import-stat { font-size: 14px; color: #3A3A3C; }
.import-stat-n { color: #2C6BED; font-weight: 700; font-size: 16px; margin-right: 4px; }
.import-sess-label { font-size: 12px; font-weight: 700; color: #2C6BED; letter-spacing: .1em; text-transform: uppercase; padding: 10px 0 6px; }
.import-preview-list { max-height: 45vh; overflow-y: auto; }
.import-ex-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #F2F2F7; font-size: 13px; color: #3A3A3C; }
.import-btn { border-color: #2C6BED; color: #2C6BED; border-style: dashed; }
.import-divider { display: flex; align-items: center; gap: 12px; margin: 14px 0; color: #AEAEB2; font-size: 13px; }
.import-divider::before, .import-divider::after { content: ''; flex: 1; height: 1px; background: #D1D1D6; }
.import-hint { font-size: 12px; color: #AEAEB2; text-align: center; margin-top: 8px; }
@media (prefers-reduced-motion: reduce) { .forge * { transition: none !important; } }
`;
