import { useState, useEffect, useMemo } from "react";

/* ============================================================
   FORGE — Tracking de entrenamiento (MVP v2)
   Superserie blocks (2-4 ex), health check, historial, semáforo.
   ============================================================ */

const WEEKS = [1, 2, 3, 4, "DL"];
const SESSIONS = ["A", "B", "C"];

/* ---------- Seed: Ciclo 2 ---------- */
const SEED = [
  { id: "a1",  session: "A", order: 1,  name: "Sentadilla pendular",       group: "Cuádriceps",    sets: 3, refKg: null,     repsMin: 8,  repsMax: 10, tempo: "3-1-1-0", rest: 150, rir: "2-3", superset: null,   unit: "reps" },
  { id: "a2",  session: "A", order: 2,  name: "Press Plano (barra)",       group: "Pecho",         sets: 3, refKg: 65,       repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 150, rir: "2-3", superset: null,   unit: "reps" },
  { id: "a3",  session: "A", order: 3,  name: "Remo T (soporte pect.)",    group: "Espalda",       sets: 3, refKg: 42.5,     repsMin: 8,  repsMax: 10, tempo: "2-0-1-1", rest: 150, rir: "2-3", superset: null,   unit: "reps" },
  { id: "a4",  session: "A", order: 4,  name: "Sillón de cuádriceps",      group: "Cuádriceps",    sets: 3, refKg: 60,       repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 90,  rir: "2-3", superset: "a9",   unit: "reps" },
  { id: "a5",  session: "A", order: 5,  name: "Vuelos laterales (DB)",     group: "Hombros",       sets: 3, refKg: 10,       repsMin: 12, repsMax: 15, tempo: "2-0-1-0", rest: 90,  rir: "1-2", superset: null,   unit: "reps" },
  { id: "a6",  session: "A", order: 6,  name: "Ext. tríceps overhead (DB)",group: "Tríceps",       sets: 3, refKg: 32.5,     repsMin: 10, repsMax: 12, tempo: "2-0-1-0", rest: 90,  rir: "1-2", superset: null,   unit: "reps" },
  { id: "a7",  session: "A", order: 7,  name: "Curl sentado (DB)",         group: "Bíceps",        sets: 3, refKg: 12.5,     repsMin: 10, repsMax: 12, tempo: "2-0-1-0", rest: 90,  rir: "1-2", superset: null,   unit: "reps" },
  { id: "a8",  session: "A", order: 8,  name: "Gemelo sentado",            group: "Gemelos",       sets: 3, refKg: 45,       repsMin: 12, repsMax: 15, tempo: "2-1-1-1", rest: 90,  rir: "1-2", superset: null,   unit: "reps" },
  { id: "a9",  session: "A", order: 9,  name: "Camilla isquios",           group: "Isquios",       sets: 3, refKg: 50,       repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 90,  rir: "2-3", superset: "a4",   unit: "reps" },
  { id: "a10", session: "A", order: 10, name: "Extensión lumbar",          group: "Core",          sets: 2, refKg: 30,       repsMin: 12, repsMax: 15, tempo: "2-0-1-0", rest: 90,  rir: "2-3", superset: null,   unit: "reps" },
  { id: "a11", session: "A", order: 11, name: "Shrugs DB",                 group: "Espalda",       sets: 3, refKg: 25,       repsMin: 12, repsMax: 15, tempo: "2-0-1-0", rest: 90,  rir: "2-3", superset: null,   unit: "reps" },
  { id: "a12", session: "A", order: 12, name: "Curl sentado brazo I (DB)", group: "Bíceps",        sets: 2, refKg: 12.5,     repsMin: 8,  repsMax: 12, tempo: "2-0-1-0", rest: 60,  rir: "1-2", superset: "a13",  unit: "reps" },
  { id: "a13", session: "A", order: 13, name: "Ext. overhead brazo I (DB)",group: "Tríceps",       sets: 2, refKg: null,     repsMin: 8,  repsMax: 12, tempo: "2-0-1-0", rest: 60,  rir: "1-2", superset: "a12",  unit: "reps" },
  { id: "b1",  session: "B", order: 1,  name: "Prensa 45°",               group: "Cuádriceps",    sets: 3, refKg: 120,      repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 150, rir: "2-3", superset: null,   unit: "reps" },
  { id: "b2",  session: "B", order: 2,  name: "Dominadas",                 group: "Espalda",       sets: 3, refKg: "BW",     repsMin: 4,  repsMax: 8,  tempo: "2-0-1-0", rest: 180, rir: "2-3", superset: null,   unit: "reps" },
  { id: "b3",  session: "B", order: 3,  name: "Camilla isquios",           group: "Isquios",       sets: 3, refKg: 50,       repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 120, rir: "2-3", superset: null,   unit: "reps" },
  { id: "b4",  session: "B", order: 4,  name: "Press inclinado (DB)",      group: "Pecho",         sets: 3, refKg: 25,       repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 120, rir: "2-3", superset: null,   unit: "reps" },
  { id: "b5",  session: "B", order: 5,  name: "Vuelos posteriores",        group: "Hombros",       sets: 3, refKg: null,     repsMin: 12, repsMax: 15, tempo: "2-0-1-1", rest: 90,  rir: "1-2", superset: null,   unit: "reps" },
  { id: "b6",  session: "B", order: 6,  name: "Face pulls",                group: "Espalda",       sets: 3, refKg: null,     repsMin: 12, repsMax: 15, tempo: "2-0-1-1", rest: 90,  rir: "1-2", superset: null,   unit: "reps" },
  { id: "b7",  session: "B", order: 7,  name: "Ext. tríceps (polea)",      group: "Tríceps",       sets: 3, refKg: null,     repsMin: 10, repsMax: 12, tempo: "2-0-1-0", rest: 60,  rir: "1-2", superset: "b8",   unit: "reps" },
  { id: "b8",  session: "B", order: 8,  name: "Curl bíceps (polea)",       group: "Bíceps",        sets: 3, refKg: null,     repsMin: 10, repsMax: 12, tempo: "2-0-1-0", rest: 60,  rir: "1-2", superset: "b7",   unit: "reps" },
  { id: "b9",  session: "B", order: 9,  name: "Gemelo prensa 45",          group: "Gemelos",       sets: 3, refKg: 180,      repsMin: 12, repsMax: 15, tempo: "2-1-1-1", rest: 90,  rir: "1-2", superset: null,   unit: "reps" },
  { id: "b10", session: "B", order: 10, name: "Caminata granjero",         group: "Core",          sets: 3, refKg: "25kg/m", repsMin: 40, repsMax: 60, tempo: "",         rest: 120, rir: "",    superset: null,   unit: "pasos" },
  { id: "c1",  session: "C", order: 1,  name: "Prensa horizontal",         group: "Cuádriceps",    sets: 4, refKg: null,     repsMin: 6,  repsMax: 8,  tempo: "3-1-1-0", rest: 180, rir: "2-3", superset: null,   unit: "reps" },
  { id: "c2",  session: "C", order: 2,  name: "Press Plano (pesado)",      group: "Pecho",         sets: 4, refKg: 70,       repsMin: 4,  repsMax: 6,  tempo: "2-0-1-0", rest: 180, rir: "2-3", superset: null,   unit: "reps" },
  { id: "c3",  session: "C", order: 3,  name: "Remo T (prono)",            group: "Espalda",       sets: 3, refKg: 45,       repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 150, rir: "2-3", superset: null,   unit: "reps" },
  { id: "c4",  session: "C", order: 4,  name: "Peso Muerto Trap Bar",      group: "Isquios",       sets: 3, refKg: 115,      repsMin: 6,  repsMax: 8,  tempo: "2-0-1-0", rest: 180, rir: "2-3", superset: null,   unit: "reps" },
  { id: "c5",  session: "C", order: 5,  name: "Hip Thrust",                group: "Isquios/Glúteos",sets: 3,refKg: 60,       repsMin: 8,  repsMax: 10, tempo: "2-0-1-1", rest: 120, rir: "2-3", superset: null,   unit: "reps" },
  { id: "c6",  session: "C", order: 6,  name: "Apertura máquina",          group: "Pecho",         sets: 3, refKg: 70,       repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 90,  rir: "1-2", superset: null,   unit: "reps" },
  { id: "c7",  session: "C", order: 7,  name: "Press francés",             group: "Tríceps",       sets: 2, refKg: 32.5,     repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 60,  rir: "1-2", superset: "c8",   unit: "reps" },
  { id: "c8",  session: "C", order: 8,  name: "Curl DB",                   group: "Bíceps",        sets: 2, refKg: 15,       repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 60,  rir: "1-2", superset: "c7",   unit: "reps" },
  { id: "c9",  session: "C", order: 9,  name: "Press máquina hombros",     group: "Hombros",       sets: 3, refKg: 35,       repsMin: 8,  repsMax: 10, tempo: "2-0-1-0", rest: 120, rir: "2-3", superset: null,   unit: "reps" },
  { id: "c10", session: "C", order: 10, name: "Extensión lumbar",          group: "Core",          sets: 2, refKg: 35,       repsMin: 12, repsMax: 15, tempo: "2-0-1-0", rest: 90,  rir: "2-3", superset: null,   unit: "reps" },
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

/* ---------- Persistencia ---------- */
function loadState() { try { const r = localStorage.getItem("forge-v2"); return r ? JSON.parse(r) : null; } catch { return null; } }
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
  const [program, setProgram] = useState(SEED);
  const [logs, setLogs] = useState({});
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [tab, setTab] = useState("entrenar");
  const [week, setWeek] = useState(1);
  const [session, setSession] = useState(null);
  const [blockIdx, setBlockIdx] = useState(0);
  const [timer, setTimer] = useState(null);
  const [editing, setEditing] = useState(null);
  const [progSession, setProgSession] = useState("A");
  const [healthCheck, setHealthCheck] = useState(null);
  const [sessionStart, setSessionStart] = useState(null);
  const [expandedLog, setExpandedLog] = useState(null);

  useEffect(() => { const s = loadState(); if (s) { setProgram(s.program || SEED); setLogs(s.logs || {}); setHistory(s.history || []); } setLoaded(true); }, []);
  useEffect(() => { if (loaded) saveState({ program, logs, history }); }, [program, logs, history, loaded]);

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

  const sessionExs = useMemo(() => program.filter((e) => e.session === session).sort((a, b) => a.order - b.order), [program, session]);
  const blocks = useMemo(() => getBlocks(sessionExs), [sessionExs]);
  const block = blocks[blockIdx];

  // A set is "done" if it has kg or reps filled in
  function isDone(log) { return log && (log.kg !== undefined && log.kg !== "" || log.reps !== undefined && log.reps !== ""); }
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

  function startSession(s) { setHealthCheck({ sleep: 3, stress: 3, energy: 3 }); setSession(s); setBlockIdx(0); }
  function confirmHealth() { setSessionStart(Date.now()); setHealthCheck(null); }

  function finishSession() {
    const exs = program.filter((e) => e.session === session);
    const exerciseData = exs.map((exercise) => {
      const sets = [];
      for (let i = 1; i <= setsFor(exercise, week); i++) { const l = logs[keyOf(week, exercise.id, i)]; if (l && isDone(l)) sets.push({ setN: i, kg: parseFloat(l.kg) || null, reps: parseInt(l.reps) || null, rir: parseFloat(l.rir) || null }); }
      return { id: exercise.id, name: exercise.name, group: exercise.group, sets, sem: semaphore(exercise, logs, week) };
    });
    setHistory((H) => [{ id: uid(), week, session, date: Date.now(), duration: sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : null, health: healthCheck || null, exercises: exerciseData }, ...H]);
    setSession(null); setTimer(null); setSessionStart(null);
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
  const progBlocks = useMemo(() => getBlocks(program.filter((e) => e.session === progSession)), [program, progSession]);

  if (!loaded) return <div style={{ background: "#F2F2F7", minHeight: "100vh" }} />;

  return (
    <div className="forge">
      <style>{CSS}</style>
      <div className="phone">

        {/* ======== HEALTH CHECK ======== */}
        {tab === "entrenar" && session !== null && healthCheck && (
          <div className="screen">
            <header className="top"><div className="brand">FORGE</div><h1>Como te sentís hoy?</h1><p className="sub">{weekLabel(week)} · Sesión {session}</p></header>
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
            <header className="top"><div className="brand">FORGE</div><h1>Entrenar</h1></header>
            <div className="weekchips">
              {WEEKS.map((w) => (<button key={w} className={`chip ${week === w ? "on" : ""} ${w === "DL" ? "dl" : ""}`} onClick={() => setWeek(w)}>{w === "DL" ? "Deload" : `S${w}`}</button>))}
            </div>
            {week === "DL" && <div className="dlnote">Deload: series - 1, bajá la intensidad</div>}
            <div className="sessioncards">
              {SESSIONS.map((s) => {
                const exs = program.filter((e) => e.session === s);
                const groups = [...new Set(exs.map((e) => e.group))].slice(0, 3).join(" · ");
                const total = exs.reduce((a, e) => a + setsFor(e, week), 0);
                const done = exs.reduce((a, e) => { let n = 0; for (let i = 1; i <= setsFor(e, week); i++) if (logs[keyOf(week, e.id, i)]?.done) n++; return a + n; }, 0);
                const allDone = done === total && total > 0;
                return (
                  <button key={s} className={`scard ${allDone ? "completed" : ""}`} onClick={() => startSession(s)}>
                    <div className="sletter">{s}</div>
                    <div className="sinfo"><div className="sname">Sesión {s}</div><div className="sgroups">{groups}</div><div className="sbar"><div style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} /></div></div>
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
              <button className="back" onClick={() => { setSession(null); setTimer(null); setSessionStart(null); }}>&#8249;</button>
              <div className="wtitle">
                <span>{weekLabel(week)} · Sesión {session}</span>
                <div className="dots">
                  {blocks.map((b, i) => (
                    <span key={i} className={`dot ${blockDone(b) ? "full" : ""} ${i === blockIdx ? "cur" : ""} ${b.type === "superset" ? "wide" : ""}`}
                      onClick={() => setBlockIdx(i)} />
                  ))}
                </div>
              </div>
              <span className="counter mono">{blockIdx + 1}/{blocks.length}</span>
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
                    <h2>{ex.name}</h2>
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
                <button className="navbtn pri" onClick={finishSession}>Terminar &#10003;</button>
              )}
            </div>
          </div>
        )}

        {/* ======== PROGRAMA ======== */}
        {tab === "programa" && (
          <div className="screen">
            <header className="top"><div className="brand">FORGE</div><h1>Programa</h1><p className="sub">Mesociclo DUP · 4 sem + deload</p></header>
            <div className="weekchips">
              {SESSIONS.map((s) => (<button key={s} className={`chip ${progSession === s ? "on" : ""}`} onClick={() => setProgSession(s)}>Sesión {s}</button>))}
            </div>
            <div className="plist">
              {progBlocks.map((b, bi) => (
                <div key={bi} className={b.type === "superset" ? "prog-ss-group" : ""}>
                  {b.type === "superset" && <div className="prog-ss-label">⚡ {b.exercises.length === 2 ? "Superserie" : b.exercises.length === 3 ? "Tri-set" : "Giant set"}</div>}
                  {b.exercises.map((e) => (
                    <button key={e.id} className={`prow ${b.type === "superset" ? "in-ss" : ""}`} onClick={() => setEditing({ ...e })}>
                      <div className="pmain"><div className="pname">{e.name}</div><div className="pmeta">{e.group}</div></div>
                      <div className="pnums mono">{e.sets}x{e.repsMin}-{e.repsMax} · {refLine(e).split(" ×")[0]}</div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <button className="addbtn" onClick={() => setEditing({ id: uid(), session: progSession, order: (Math.max(0, ...program.filter((e) => e.session === progSession).map((e) => e.order)) + 1), name: "", group: "", sets: 3, refKg: "", repsMin: 8, repsMax: 12, tempo: "2-0-1-0", rest: 120, rir: "2", superset: null, unit: "reps" })}>+ Agregar ejercicio</button>
          </div>
        )}

        {/* ======== HISTORIAL ======== */}
        {tab === "historial" && (
          <div className="screen">
            <header className="top"><div className="brand">FORGE</div><h1>Historial</h1><p className="sub">{history.length} sesiones registradas</p></header>
            {history.length === 0 && <div className="empty">Completá tu primera sesión para verla acá.</div>}
            {history.map((h) => (
              <div key={h.id} className="hist-card">
                <button className="hist-head" onClick={() => setExpandedLog(expandedLog === h.id ? null : h.id)}>
                  <div className="hist-left"><div className="hist-title">{weekLabel(h.week)} · Sesión {h.session}</div><div className="hist-meta">{fmtDate(h.date)}{h.duration ? ` · ${h.duration} min` : ""}</div></div>
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
              {(() => { const vals = WEEKS.map((w) => metrics.tonnage[String(w)] || 0); const max = Math.max(...vals, 1);
                return WEEKS.map((w, i) => { const v = vals[i]; const prev = i > 0 ? vals[i - 1] : 0; const delta = prev > 0 && v > 0 ? Math.round(((v - prev) / prev) * 100) : null;
                  return (<div key={w} className="tonrow"><span className="tonlbl">{w === "DL" ? "DL" : `S${w}`}</span><div className="tonbar"><div style={{ width: `${(v / max) * 100}%` }} /></div><span className="tonval mono">{v > 0 ? `${round1(v / 1000)}t` : "—"}</span><span className={`tondelta mono ${delta > 0 ? "up" : delta < 0 ? "dn" : ""}`}>{delta !== null ? `${delta > 0 ? "+" : ""}${delta}%` : ""}</span></div>);
                }); })()}
            </div>
            <div className="card">
              <div className="cardtitle">e1RM por ejercicio</div>
              <div className="e1head mono"><span></span><span>S1</span><span>S2</span><span>S3</span><span>S4</span></div>
              {program.filter((e) => metrics.e1rms[e.id]).map((e) => {
                const row = [1, 2, 3, 4].map((w) => metrics.e1rms[e.id][String(w)]); const nums = row.filter(Boolean);
                const trend = nums.length >= 2 ? (nums[nums.length - 1] > nums[0] ? "↗" : nums[nums.length - 1] < nums[0] ? "↘" : "→") : "";
                return (<div key={e.id} className="e1row"><span className="e1name">{e.name} <span className={`tr ${trend === "↗" ? "up" : trend === "↘" ? "dn" : ""}`}>{trend}</span></span>{row.map((v, i) => <span key={i} className="mono e1v">{v ? Math.round(v) : "·"}</span>)}</div>);
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

        {editing && <ExerciseEditor draft={editing} setDraft={setEditing} siblings={program.filter((e) => e.session === editing.session && e.id !== editing.id)} onSave={saveExercise} onDelete={deleteExercise} isNew={!program.some((e) => e.id === editing.id)} />}

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
        <div className="fgrid">
          <label className="f2"><span>Ejercicio</span><input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Belt Squat" /></label>
          <label><span>Grupo muscular</span><input value={draft.group} onChange={(e) => set("group", e.target.value)} placeholder="Cuádriceps" /></label>
          <label><span>Series</span><input className="mono" inputMode="numeric" value={draft.sets} onChange={(e) => set("sets", num(e.target.value, true))} /></label>
          <label><span>Ref KG</span><input className="mono" value={draft.refKg ?? ""} onChange={(e) => { const v = e.target.value.trim(); const n = parseFloat(v); set("refKg", v === "" ? null : !isNaN(n) && String(n) === v ? n : v); }} placeholder="120" /></label>
          <label><span>Unidad</span><select value={draft.unit} onChange={(e) => set("unit", e.target.value)}><option value="reps">reps</option><option value="pasos">pasos</option></select></label>
          <label><span>Reps min</span><input className="mono" inputMode="numeric" value={draft.repsMin} onChange={(e) => set("repsMin", num(e.target.value, true))} /></label>
          <label><span>Reps max</span><input className="mono" inputMode="numeric" value={draft.repsMax} onChange={(e) => set("repsMax", num(e.target.value, true))} /></label>
          <label><span>Tempo</span><input className="mono" value={draft.tempo} onChange={(e) => set("tempo", e.target.value)} placeholder="2-0-1-0" /></label>
          <label><span>Descanso (seg)</span><input className="mono" inputMode="numeric" value={draft.rest} onChange={(e) => set("rest", num(e.target.value, true))} /></label>
          <label><span>RIR objetivo</span><input className="mono" value={draft.rir} onChange={(e) => set("rir", e.target.value)} placeholder="2-3" /></label>
          <label className="f2"><span>Superserie con</span><select value={draft.superset ?? ""} onChange={(e) => set("superset", e.target.value || null)}><option value="">— sin superserie —</option>{siblings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        </div>
        <div className="sheetactions">
          {!isNew && <button className="del" onClick={() => onDelete(draft.id)}>Eliminar</button>}
          <button className="save" disabled={!draft.name || !draft.sets} onClick={() => onSave({ ...draft, repsMin: draft.repsMin || 0, repsMax: draft.repsMax || 0, rest: draft.rest || 90 })}>Guardar</button>
        </div>
      </div>
    </div>
  );
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
.counter { color: #636366; font-size: 13px; font-weight: 500; }

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
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.3); z-index: 50; display: flex; align-items: flex-end; justify-content: center; }
.sheet { width: 100%; max-width: 430px; max-height: 88vh; overflow-y: auto; background: #FFF; border: none; border-radius: 20px 20px 0 0; padding: 20px 16px 28px; box-shadow: 0 -4px 20px rgba(0,0,0,.1); }
.sheethead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.sheethead h3 { font-size: 18px; font-weight: 700; }
.x { background: none; border: none; color: #636366; font-size: 28px; cursor: pointer; line-height: 1; }
.fgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.fgrid label { display: flex; flex-direction: column; gap: 6px; }
.fgrid .f2 { grid-column: span 2; }
.fgrid span { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #636366; font-weight: 600; }
.fgrid input, .fgrid select { height: 46px; background: #F2F2F7; border: 1.5px solid #D1D1D6; border-radius: 10px; color: #1C1C1E; padding: 0 12px; font: 400 15px 'Inter'; }
.fgrid input.mono { font-family: 'DM Mono', monospace; }
.fgrid input:focus, .fgrid select:focus { outline: none; border-color: #2C6BED; }
.fgrid select { appearance: none; }
.sheetactions { display: flex; gap: 10px; margin-top: 20px; }
.del { flex: 0 0 auto; padding: 0 18px; height: 50px; border-radius: 12px; border: 1px solid rgba(255,59,48,.3); background: transparent; color: #FF3B30; font: 600 14px 'Inter'; cursor: pointer; }
.save { flex: 1; height: 50px; border-radius: 12px; border: none; background: #2C6BED; color: #FFF; font: 700 15px 'Inter'; cursor: pointer; }
.save:disabled { opacity: .35; }
.prevbox { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; padding: 8px 12px; background: #F2F2F7; border: 1px dashed #AEAEB2; border-radius: 10px; font-size: 12px; color: #1C1C1E; }
.pvlabel { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #636366; font-weight: 600; }
.pve1 { margin-left: auto; color: #2C6BED; font-weight: 600; }
@media (prefers-reduced-motion: reduce) { .forge * { transition: none !important; } }
`;
