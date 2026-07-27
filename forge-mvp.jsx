import { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================
   FORGE — Tracking de entrenamiento (MVP)
   Offline-first en la versión real (Dexie); acá persiste con
   window.storage. Un ejercicio por pantalla, timer automático,
   superseries, e1RM Brzycki, progresión semana a semana.
   ============================================================ */

const WEEKS = [1, 2, 3, 4, "DL"];
const SESSIONS = ["A", "B", "C"];

/* ---------- Seed: programa de ejemplo (DUP 3 días) ---------- */
const SEED = [
  // Sesión A — Lower pesado
  { id: "a1", session: "A", order: 1, name: "Belt Squat", group: "Cuádriceps", sets: 4, refKg: 120, repsMin: 6, repsMax: 8, tempo: "2-0-1-0", rest: 180, rir: "2-3", superset: null, unit: "reps" },
  { id: "a2", session: "A", order: 2, name: "Peso Muerto Rumano", group: "Isquios", sets: 3, refKg: 80, repsMin: 8, repsMax: 10, tempo: "3-0-1-0", rest: 150, rir: "2-3", superset: null, unit: "reps" },
  { id: "a3", session: "A", order: 3, name: "Prensa 45°", group: "Cuádriceps", sets: 3, refKg: 140, repsMin: 10, repsMax: 12, tempo: "2-0-1-0", rest: 150, rir: "2", superset: null, unit: "reps" },
  { id: "a4", session: "A", order: 4, name: "Curl Femoral Sentado", group: "Isquios", sets: 2, refKg: 45, repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 90, rir: "1-2", superset: "a5", unit: "reps" },
  { id: "a5", session: "A", order: 5, name: "Gemelos de Pie", group: "Pantorrilla", sets: 2, refKg: 60, repsMin: 12, repsMax: 15, tempo: "2-1-1-1", rest: 90, rir: "1-2", superset: "a4", unit: "reps" },
  // Sesión B — Push
  { id: "b1", session: "B", order: 1, name: "Press Plano", group: "Pecho", sets: 4, refKg: 80, repsMin: 6, repsMax: 8, tempo: "2-0-1-0", rest: 180, rir: "2-3", superset: null, unit: "reps" },
  { id: "b2", session: "B", order: 2, name: "Press Militar", group: "Hombro", sets: 3, refKg: 45, repsMin: 8, repsMax: 10, tempo: "2-0-1-0", rest: 150, rir: "2", superset: null, unit: "reps" },
  { id: "b3", session: "B", order: 3, name: "Fondos", group: "Pecho", sets: 3, refKg: "BW", repsMin: 8, repsMax: 12, tempo: "2-0-1-0", rest: 120, rir: "2", superset: null, unit: "reps" },
  { id: "b4", session: "B", order: 4, name: "Aperturas con Mancuernas", group: "Pecho", sets: 2, refKg: 14, repsMin: 10, repsMax: 12, tempo: "3-0-1-0", rest: 90, rir: "1-2", superset: "b5", unit: "reps" },
  { id: "b5", session: "B", order: 5, name: "Elevaciones Laterales", group: "Hombro", sets: 2, refKg: 10, repsMin: 12, repsMax: 15, tempo: "2-0-1-0", rest: 90, rir: "1", superset: "b4", unit: "reps" },
  { id: "b6", session: "B", order: 6, name: "Tríceps Soga", group: "Tríceps", sets: 2, refKg: null, repsMin: 10, repsMax: 12, tempo: "2-0-1-0", rest: 90, rir: "1-2", superset: null, unit: "reps" },
  // Sesión C — Pull
  { id: "c1", session: "C", order: 1, name: "Dominadas", group: "Espalda", sets: 3, refKg: "BW", repsMin: 6, repsMax: 10, tempo: "2-0-1-0", rest: 180, rir: "2", superset: null, unit: "reps" },
  { id: "c2", session: "C", order: 2, name: "Remo con Barra", group: "Espalda", sets: 4, refKg: 70, repsMin: 8, repsMax: 10, tempo: "2-0-1-0", rest: 150, rir: "2-3", superset: null, unit: "reps" },
  { id: "c3", session: "C", order: 3, name: "Jalón al Pecho", group: "Espalda", sets: 3, refKg: 65, repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 120, rir: "2", superset: null, unit: "reps" },
  { id: "c4", session: "C", order: 4, name: "Curl con Barra", group: "Bíceps", sets: 2, refKg: 30, repsMin: 8, repsMax: 10, tempo: "2-0-1-0", rest: 90, rir: "1-2", superset: "c5", unit: "reps" },
  { id: "c5", session: "C", order: 5, name: "Curl Martillo", group: "Bíceps", sets: 2, refKg: 12, repsMin: 10, repsMax: 12, tempo: "2-0-1-0", rest: 90, rir: "1-2", superset: "c4", unit: "reps" },
  { id: "c6", session: "C", order: 6, name: "Farmer Walk", group: "Core", sets: 2, refKg: "25kg/m", repsMin: 40, repsMax: 60, tempo: "—", rest: 120, rir: "—", superset: null, unit: "pasos" },
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

function refLine(ex) {
  const kg = ex.refKg === null || ex.refKg === "" ? "máquina" : ex.refKg === "BW" ? "BW" : `${ex.refKg}${isNum(ex.refKg) ? "kg" : ""}`;
  return `${kg} × ${ex.repsMin}-${ex.repsMax} ${ex.unit === "pasos" ? "pasos" : ""}`.trim();
}

/* ---------- Persistencia (window.storage con fallback) ---------- */
async function loadState() {
  try {
    const r = await window.storage.get("forge-v1");
    if (r && r.value) return JSON.parse(r.value);
  } catch (e) { /* primera vez o sin storage */ }
  return null;
}
let saveT = null;
function saveState(state) {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try { await window.storage.set("forge-v1", JSON.stringify(state)); } catch (e) { /* modo memoria */ }
  }, 500);
}

/* ============================================================ */
export default function ForgeApp() {
  const [program, setProgram] = useState(SEED);
  const [logs, setLogs] = useState({}); // { "week|exId|setN": {kg,reps,rir,done} }
  const [loaded, setLoaded] = useState(false);

  const [tab, setTab] = useState("entrenar"); // entrenar | programa | progreso
  const [week, setWeek] = useState(1);
  const [session, setSession] = useState(null); // null = selector
  const [exIdx, setExIdx] = useState(0);
  const [timer, setTimer] = useState(null); // {total, remaining, id, label}
  const [ssFlash, setSsFlash] = useState(false);
  const [editing, setEditing] = useState(null); // ejercicio en edición (Programa)
  const [progSession, setProgSession] = useState("A");

  /* carga inicial */
  useEffect(() => {
    loadState().then((s) => {
      if (s) { setProgram(s.program || SEED); setLogs(s.logs || {}); }
      setLoaded(true);
    });
  }, []);
  useEffect(() => { if (loaded) saveState({ program, logs }); }, [program, logs, loaded]);

  /* timer */
  useEffect(() => {
    if (!timer || timer.remaining <= 0) return;
    const iv = setInterval(() => {
      setTimer((t) => {
        if (!t) return null;
        if (t.remaining <= 0) return t;
        if (t.remaining === 1) {
          try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
          return { ...t, remaining: 0 };
        }
        return { ...t, remaining: t.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [timer?.id]);

  const sessionExs = useMemo(
    () => program.filter((e) => e.session === session).sort((a, b) => a.order - b.order),
    [program, session]
  );
  const ex = sessionExs[exIdx];

  /* ---------- lógica de registro ---------- */
  function updateSet(k, field, val) {
    setLogs((L) => ({ ...L, [k]: { ...(L[k] || {}), [field]: val } }));
  }

  function completeSet(exercise, setN) {
    const k = keyOf(week, exercise.id, setN);
    const cur = logs[k] || {};
    // autocompletar con referencia si quedó vacío
    const kg = cur.kg !== undefined && cur.kg !== "" ? parseFloat(cur.kg) : isNum(exercise.refKg) ? exercise.refKg : null;
    const reps = cur.reps !== undefined && cur.reps !== "" ? parseInt(cur.reps) : exercise.repsMax;
    const rir = cur.rir !== undefined && cur.rir !== "" ? parseFloat(cur.rir) : null;
    setLogs((L) => ({ ...L, [k]: { kg: isNaN(kg) ? null : kg, reps: isNaN(reps) ? null : reps, rir: isNaN(rir) ? null : rir, done: true } }));

    const partnerIdx = exercise.superset ? sessionExs.findIndex((e) => e.id === exercise.superset) : -1;
    if (partnerIdx >= 0) {
      const partner = sessionExs[partnerIdx];
      const myOrder = exercise.order, pOrder = partner.order;
      if (myOrder < pOrder) {
        // primera mitad de la superserie → sin descanso, saltar al partner
        setSsFlash(true); setTimeout(() => setSsFlash(false), 1600);
        setExIdx(partnerIdx);
        return;
      } else {
        // segunda mitad → descansar y volver al primero si le quedan series
        setTimer({ total: exercise.rest, remaining: exercise.rest, id: uid(), label: exercise.name });
        const firstDone = countDone(partner) >= setsFor(partner, week);
        if (!firstDone) setExIdx(partnerIdx);
        return;
      }
    }
    setTimer({ total: exercise.rest, remaining: exercise.rest, id: uid(), label: exercise.name });
  }

  function uncompleteSet(exercise, setN) {
    const k = keyOf(week, exercise.id, setN);
    setLogs((L) => ({ ...L, [k]: { ...(L[k] || {}), done: false } }));
  }

  function countDone(exercise) {
    let n = 0;
    for (let i = 1; i <= setsFor(exercise, week); i++) if (logs[keyOf(week, exercise.id, i)]?.done) n++;
    return n;
  }

  function prevWeekSummary(exercise) {
    const pw = week === "DL" ? 4 : week - 1;
    if (!pw || pw < 1) return null;
    const rows = [];
    for (let i = 1; i <= setsFor(exercise, pw); i++) {
      const l = logs[keyOf(pw, exercise.id, i)];
      if (l?.done) rows.push(l);
    }
    if (!rows.length) return null;
    const best = Math.max(...rows.map((r) => (isNum(r.kg) && r.reps ? brzycki(r.kg, r.reps) || 0 : 0)));
    return { pw, rows, e1rm: best > 0 ? Math.round(best) : null };
  }

  /* ---------- métricas de progreso ---------- */
  const metrics = useMemo(() => {
    const tonnage = {}; const e1rms = {}; // e1rms[exId][week] = max
    for (const [k, l] of Object.entries(logs)) {
      if (!l.done) continue;
      const [w, exId] = k.split("|");
      const exercise = program.find((e) => e.id === exId);
      if (!exercise || exercise.unit === "pasos") continue;
      if (isNum(l.kg) && l.reps) {
        tonnage[w] = (tonnage[w] || 0) + l.kg * l.reps;
        const e1 = brzycki(l.kg, l.reps);
        if (e1) {
          e1rms[exId] = e1rms[exId] || {};
          e1rms[exId][w] = Math.max(e1rms[exId][w] || 0, e1);
        }
      }
    }
    return { tonnage, e1rms };
  }, [logs, program]);

  /* ---------- edición de programa ---------- */
  function saveExercise(draft) {
    setProgram((P) => {
      const exists = P.some((e) => e.id === draft.id);
      return exists ? P.map((e) => (e.id === draft.id ? draft : e)) : [...P, draft];
    });
    setEditing(null);
  }
  function deleteExercise(id) {
    setProgram((P) => P.filter((e) => e.id !== id).map((e) => (e.superset === id ? { ...e, superset: null } : e)));
    setEditing(null);
  }

  if (!loaded) return <div style={{ background: "#0D1117", minHeight: "100vh" }} />;

  return (
    <div className="forge">
      <style>{CSS}</style>
      <div className="phone">
        {/* ======== TAB: ENTRENAR ======== */}
        {tab === "entrenar" && session === null && (
          <div className="screen">
            <header className="top">
              <div className="brand">FORGE</div>
              <h1>Entrenar</h1>
              <p className="sub">Elegí semana y sesión</p>
            </header>
            <div className="weekchips">
              {WEEKS.map((w) => (
                <button key={w} className={`chip ${week === w ? "on" : ""} ${w === "DL" ? "dl" : ""}`} onClick={() => setWeek(w)}>
                  {w === "DL" ? "Deload" : `S${w}`}
                </button>
              ))}
            </div>
            {week === "DL" && <div className="dlnote">Deload: series del programa − 1, bajá la intensidad</div>}
            <div className="sessioncards">
              {SESSIONS.map((s) => {
                const exs = program.filter((e) => e.session === s);
                const groups = [...new Set(exs.map((e) => e.group))].slice(0, 3).join(" · ");
                const total = exs.reduce((a, e) => a + setsFor(e, week), 0);
                const done = exs.reduce((a, e) => {
                  let n = 0;
                  for (let i = 1; i <= setsFor(e, week); i++) if (logs[keyOf(week, e.id, i)]?.done) n++;
                  return a + n;
                }, 0);
                const pct = total ? Math.round((done / total) * 100) : 0;
                return (
                  <button key={s} className="scard" onClick={() => { setSession(s); setExIdx(0); }}>
                    <div className="sletter">{s}</div>
                    <div className="sinfo">
                      <div className="sname">Sesión {s}</div>
                      <div className="sgroups">{groups}</div>
                      <div className="sbar"><div style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div className="spct mono">{done}/{total}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ======== ENTRENAMIENTO ACTIVO ======== */}
        {tab === "entrenar" && session !== null && ex && (
          <div className="screen workout">
            <header className="wtop">
              <button className="back" onClick={() => { setSession(null); setTimer(null); }}>‹</button>
              <div className="wtitle">
                <span>{weekLabel(week)} · Sesión {session}</span>
                <div className="dots">
                  {sessionExs.map((e, i) => (
                    <span key={e.id} className={`dot ${countDone(e) >= setsFor(e, week) ? "full" : ""} ${i === exIdx ? "cur" : ""}`}
                      onClick={() => setExIdx(i)} />
                  ))}
                </div>
              </div>
              <span className="counter mono">{exIdx + 1}/{sessionExs.length}</span>
            </header>

            {ex.superset && (
              <div className={`ssbanner ${ssFlash ? "flash" : ""}`}>
                ⚡ SUPERSERIE con {program.find((e) => e.id === ex.superset)?.name || "—"} — sin descanso
              </div>
            )}

            <div className="excard">
              <div className="eyebrow">{ex.group}</div>
              <h2>{ex.name}</h2>
              <div className="refline mono">
                Ref: {refLine(ex)} <span className="sep">|</span> T {ex.tempo} <span className="sep">|</span> D {fmtRest(ex.rest)} <span className="sep">|</span> RIR {ex.rir}
              </div>

              {(() => {
                const pv = prevWeekSummary(ex);
                return pv ? (
                  <div className="prevbox">
                    <span className="pvlabel">{weekLabel(pv.pw)}</span>
                    <span className="mono">
                      {pv.rows.map((r, i) => `${isNum(r.kg) ? r.kg : "BW"}×${r.reps}`).join("  ")}
                    </span>
                    {pv.e1rm && <span className="pve1 mono">e1RM {pv.e1rm}</span>}
                  </div>
                ) : null;
              })()}

              <div className="sets">
                <div className="setshead">
                  <span></span><span>{ex.refKg === "BW" ? "+KG" : "KG"}</span><span>{ex.unit === "pasos" ? "PASOS" : "REPS"}</span><span>RIR</span><span></span>
                </div>
                {Array.from({ length: setsFor(ex, week) }, (_, i) => i + 1).map((n) => {
                  const k = keyOf(week, ex.id, n);
                  const l = logs[k] || {};
                  return (
                    <div key={n} className={`setrow ${l.done ? "done" : ""}`}>
                      <span className="setn mono">S{n}</span>
                      <input className="nf mono" inputMode="decimal" placeholder={isNum(ex.refKg) ? String(ex.refKg) : ex.refKg === "BW" ? "0" : "—"}
                        value={l.kg ?? ""} onChange={(e2) => updateSet(k, "kg", e2.target.value)} disabled={l.done} />
                      <input className="nf mono" inputMode="numeric" placeholder={`${ex.repsMax}`}
                        value={l.reps ?? ""} onChange={(e2) => updateSet(k, "reps", e2.target.value)} disabled={l.done} />
                      <input className="nf mono" inputMode="decimal" placeholder={ex.rir}
                        value={l.rir ?? ""} onChange={(e2) => updateSet(k, "rir", e2.target.value)} disabled={l.done} />
                      {l.done ? (
                        <button className="ck on" onClick={() => uncompleteSet(ex, n)}>✓</button>
                      ) : (
                        <button className="ck" onClick={() => completeSet(ex, n)}>✓</button>
                      )}
                    </div>
                  );
                })}
              </div>

              {(() => {
                let best = 0;
                for (let i = 1; i <= setsFor(ex, week); i++) {
                  const l = logs[keyOf(week, ex.id, i)];
                  if (l?.done && isNum(l.kg) && l.reps) best = Math.max(best, brzycki(l.kg, l.reps) || 0);
                }
                return best > 0 ? <div className="e1rmnow mono">e1RM hoy: <b>{Math.round(best)} kg</b></div> : null;
              })()}
            </div>

            <div className="navrow">
              <button className="navbtn" disabled={exIdx === 0} onClick={() => setExIdx((i) => i - 1)}>‹ Anterior</button>
              {exIdx < sessionExs.length - 1 ? (
                <button className="navbtn pri" onClick={() => setExIdx((i) => i + 1)}>Siguiente ›</button>
              ) : (
                <button className="navbtn pri" onClick={() => { setSession(null); setTimer(null); }}>Terminar ✓</button>
              )}
            </div>
          </div>
        )}

        {/* ======== TAB: PROGRAMA ======== */}
        {tab === "programa" && (
          <div className="screen">
            <header className="top">
              <div className="brand">FORGE</div>
              <h1>Programa</h1>
              <p className="sub">Mesociclo DUP · 4 sem + deload · <span className="dim">Importar Excel llega en v0.2</span></p>
            </header>
            <div className="weekchips">
              {SESSIONS.map((s) => (
                <button key={s} className={`chip ${progSession === s ? "on" : ""}`} onClick={() => setProgSession(s)}>Sesión {s}</button>
              ))}
            </div>
            <div className="plist">
              {program.filter((e) => e.session === progSession).sort((a, b) => a.order - b.order).map((e) => (
                <button key={e.id} className="prow" onClick={() => setEditing({ ...e })}>
                  <div className="pmain">
                    <div className="pname">{e.name} {e.superset && <span className="ssdot">⚡</span>}</div>
                    <div className="pmeta">{e.group}</div>
                  </div>
                  <div className="pnums mono">{e.sets}×{e.repsMin}-{e.repsMax} · {refLine(e).split(" ×")[0]}</div>
                </button>
              ))}
            </div>
            <button className="addbtn" onClick={() => setEditing({
              id: uid(), session: progSession, order: (Math.max(0, ...program.filter((e) => e.session === progSession).map((e) => e.order)) + 1),
              name: "", group: "", sets: 3, refKg: "", repsMin: 8, repsMax: 12, tempo: "2-0-1-0", rest: 120, rir: "2", superset: null, unit: "reps",
            })}>+ Agregar ejercicio</button>
          </div>
        )}

        {/* ======== TAB: PROGRESO ======== */}
        {tab === "progreso" && (
          <div className="screen">
            <header className="top">
              <div className="brand">FORGE</div>
              <h1>Progreso</h1>
              <p className="sub">e1RM (Brzycki) y tonelaje del ciclo</p>
            </header>

            <div className="card">
              <div className="cardtitle">Tonelaje semanal</div>
              {(() => {
                const vals = WEEKS.map((w) => metrics.tonnage[String(w)] || 0);
                const max = Math.max(...vals, 1);
                return WEEKS.map((w, i) => {
                  const v = vals[i];
                  const prev = i > 0 ? vals[i - 1] : 0;
                  const delta = prev > 0 && v > 0 ? Math.round(((v - prev) / prev) * 100) : null;
                  return (
                    <div key={w} className="tonrow">
                      <span className="tonlbl">{w === "DL" ? "DL" : `S${w}`}</span>
                      <div className="tonbar"><div style={{ width: `${(v / max) * 100}%` }} /></div>
                      <span className="tonval mono">{v > 0 ? `${round1(v / 1000)}t` : "—"}</span>
                      <span className={`tondelta mono ${delta > 0 ? "up" : delta < 0 ? "dn" : ""}`}>
                        {delta !== null ? `${delta > 0 ? "+" : ""}${delta}%` : ""}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="card">
              <div className="cardtitle">e1RM por ejercicio</div>
              <div className="e1head mono"><span></span><span>S1</span><span>S2</span><span>S3</span><span>S4</span></div>
              {program.filter((e) => metrics.e1rms[e.id]).map((e) => {
                const row = [1, 2, 3, 4].map((w) => metrics.e1rms[e.id][String(w)]);
                const nums = row.filter(Boolean);
                const trend = nums.length >= 2 ? (nums[nums.length - 1] > nums[0] ? "↗" : nums[nums.length - 1] < nums[0] ? "↘" : "→") : "";
                return (
                  <div key={e.id} className="e1row">
                    <span className="e1name">{e.name} <span className={`tr ${trend === "↗" ? "up" : trend === "↘" ? "dn" : ""}`}>{trend}</span></span>
                    {row.map((v, i) => <span key={i} className="mono e1v">{v ? Math.round(v) : "·"}</span>)}
                  </div>
                );
              })}
              {Object.keys(metrics.e1rms).length === 0 && (
                <div className="empty">Registrá series con kg y reps para ver tu e1RM acá.</div>
              )}
            </div>
          </div>
        )}

        {/* ======== TIMER FLOTANTE ======== */}
        {timer && (
          <div className={`timerbar ${timer.remaining === 0 ? "zero" : ""}`}>
            <div className="tfill" style={{ width: `${(1 - timer.remaining / timer.total) * 100}%` }} />
            <div className="tcontent">
              <span className="tlabel">{timer.remaining === 0 ? "¡A LA BARRA!" : "DESCANSO"}</span>
              <span className="ttime mono">{fmtTime(timer.remaining)}</span>
              <button className="tskip" onClick={() => setTimer(null)}>{timer.remaining === 0 ? "OK" : "Saltar"}</button>
            </div>
          </div>
        )}

        {/* ======== EDITOR DE EJERCICIO ======== */}
        {editing && (
          <ExerciseEditor
            draft={editing}
            setDraft={setEditing}
            siblings={program.filter((e) => e.session === editing.session && e.id !== editing.id)}
            onSave={saveExercise}
            onDelete={deleteExercise}
            isNew={!program.some((e) => e.id === editing.id)}
          />
        )}

        {/* ======== TAB BAR ======== */}
        <nav className="tabbar">
          {[["entrenar", "Entrenar", "◉"], ["programa", "Programa", "▤"], ["progreso", "Progreso", "↗"]].map(([id, label, icon]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => { setTab(id); if (id !== "entrenar") setTimer(null); }}>
              <span className="ticon">{icon}</span>{label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

/* ---------- Editor (modal) ---------- */
function ExerciseEditor({ draft, setDraft, siblings, onSave, onDelete, isNew }) {
  const set = (f, v) => setDraft((d) => ({ ...d, [f]: v }));
  const num = (v, int) => { const n = int ? parseInt(v) : parseFloat(v); return isNaN(n) ? "" : n; };
  return (
    <div className="overlay" onClick={() => setDraft(null)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheethead">
          <h3>{isNew ? "Nuevo ejercicio" : "Editar ejercicio"}</h3>
          <button className="x" onClick={() => setDraft(null)}>×</button>
        </div>
        <div className="fgrid">
          <label className="f2"><span>Ejercicio</span>
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Belt Squat" /></label>
          <label><span>Grupo muscular</span>
            <input value={draft.group} onChange={(e) => set("group", e.target.value)} placeholder="Cuádriceps" /></label>
          <label><span>Series</span>
            <input className="mono" inputMode="numeric" value={draft.sets} onChange={(e) => set("sets", num(e.target.value, true))} /></label>
          <label><span>Ref KG (nº, BW, 25kg/m o vacío)</span>
            <input className="mono" value={draft.refKg ?? ""} onChange={(e) => {
              const v = e.target.value.trim(); const n = parseFloat(v);
              set("refKg", v === "" ? null : !isNaN(n) && String(n) === v ? n : v);
            }} placeholder="120" /></label>
          <label><span>Unidad</span>
            <select value={draft.unit} onChange={(e) => set("unit", e.target.value)}>
              <option value="reps">reps</option><option value="pasos">pasos</option>
            </select></label>
          <label><span>Reps min</span>
            <input className="mono" inputMode="numeric" value={draft.repsMin} onChange={(e) => set("repsMin", num(e.target.value, true))} /></label>
          <label><span>Reps max</span>
            <input className="mono" inputMode="numeric" value={draft.repsMax} onChange={(e) => set("repsMax", num(e.target.value, true))} /></label>
          <label><span>Tempo</span>
            <input className="mono" value={draft.tempo} onChange={(e) => set("tempo", e.target.value)} placeholder="2-0-1-0" /></label>
          <label><span>Descanso (seg)</span>
            <input className="mono" inputMode="numeric" value={draft.rest} onChange={(e) => set("rest", num(e.target.value, true))} /></label>
          <label><span>RIR objetivo</span>
            <input className="mono" value={draft.rir} onChange={(e) => set("rir", e.target.value)} placeholder="2-3" /></label>
          <label className="f2"><span>Superserie con</span>
            <select value={draft.superset ?? ""} onChange={(e) => set("superset", e.target.value || null)}>
              <option value="">— sin superserie —</option>
              {siblings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
        </div>
        <div className="sheetactions">
          {!isNew && <button className="del" onClick={() => onDelete(draft.id)}>Eliminar</button>}
          <button className="save" disabled={!draft.name || !draft.sets}
            onClick={() => onSave({ ...draft, repsMin: draft.repsMin || 0, repsMax: draft.repsMax || 0, rest: draft.rest || 90 })}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Estilos ---------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

.forge { min-height: 100vh; background: #0D1117; color: #E6EDF3; font-family: 'Outfit', system-ui, sans-serif;
  display: flex; justify-content: center; -webkit-font-smoothing: antialiased; }
.forge * { box-sizing: border-box; margin: 0; }
.mono { font-family: 'DM Mono', monospace; font-variant-numeric: tabular-nums; }
.phone { width: 100%; max-width: 430px; min-height: 100vh; position: relative; padding-bottom: 76px;
  background: #0D1117; border-left: 1px solid #1C2128; border-right: 1px solid #1C2128; }
.screen { padding: 20px 16px 12px; }

.top { margin-bottom: 18px; }
.brand { font-size: 11px; letter-spacing: 0.35em; color: #00C896; font-weight: 700; margin-bottom: 10px; }
.top h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
.sub { color: #8B96A5; font-size: 13px; margin-top: 4px; }
.dim { color: #5C6670; }

.weekchips { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.chip { padding: 8px 14px; border-radius: 999px; border: 1px solid #2A3038; background: #161B22; color: #8B96A5;
  font: 500 13px 'Outfit'; cursor: pointer; transition: all .15s ease-out; }
.chip.on { background: rgba(0,200,150,.12); border-color: #00C896; color: #00C896; }
.chip.dl.on { background: rgba(240,180,70,.12); border-color: #E3B341; color: #E3B341; }
.dlnote { font-size: 12px; color: #E3B341; background: rgba(240,180,70,.08); border: 1px solid rgba(240,180,70,.25);
  padding: 8px 12px; border-radius: 8px; margin-bottom: 14px; }

.sessioncards { display: flex; flex-direction: column; gap: 10px; }
.scard { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; padding: 16px;
  background: #161B22; border: 1px solid #2A3038; border-radius: 14px; cursor: pointer; color: inherit;
  transition: border-color .15s ease-out; }
.scard:hover { border-color: #00C896; }
.sletter { width: 46px; height: 46px; border-radius: 12px; background: rgba(0,200,150,.1); color: #00C896;
  display: flex; align-items: center; justify-content: center; font: 700 20px 'Outfit'; flex-shrink: 0; }
.sinfo { flex: 1; min-width: 0; }
.sname { font-weight: 600; font-size: 15px; }
.sgroups { color: #8B96A5; font-size: 12px; margin: 2px 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sbar { height: 4px; background: #21262E; border-radius: 2px; overflow: hidden; }
.sbar div { height: 100%; background: #00C896; border-radius: 2px; transition: width .3s ease-out; }
.spct { color: #8B96A5; font-size: 12px; }

.workout { padding-top: 14px; }
.wtop { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.back { width: 36px; height: 36px; border-radius: 10px; background: #161B22; border: 1px solid #2A3038; color: #E6EDF3;
  font-size: 20px; cursor: pointer; flex-shrink: 0; }
.wtitle { flex: 1; }
.wtitle > span { font-size: 13px; font-weight: 600; color: #8B96A5; }
.dots { display: flex; gap: 5px; margin-top: 5px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: #2A3038; cursor: pointer; }
.dot.full { background: #00C896; }
.dot.cur { outline: 2px solid rgba(0,200,150,.4); outline-offset: 1px; }
.counter { color: #5C6670; font-size: 12px; }

.ssbanner { background: rgba(0,200,150,.1); border: 1px solid rgba(0,200,150,.35); color: #00C896;
  font-size: 12px; font-weight: 600; padding: 8px 12px; border-radius: 8px; margin-bottom: 10px;
  transition: background .2s; }
.ssbanner.flash { background: rgba(0,200,150,.3); }

.excard { background: #161B22; border: 1px solid #2A3038; border-radius: 16px; padding: 18px 16px; }
.eyebrow { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #00C896; font-weight: 600; }
.excard h2 { font-size: 22px; font-weight: 700; margin: 4px 0 8px; letter-spacing: -0.01em; }
.refline { font-size: 12px; color: #8B96A5; line-height: 1.5; }
.sep { color: #3A4048; margin: 0 2px; }

.prevbox { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; padding: 9px 12px;
  background: #10141A; border: 1px dashed #2A3038; border-radius: 10px; font-size: 12px; color: #C3CCD6; }
.pvlabel { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #5C6670; font-weight: 600; }
.pve1 { margin-left: auto; color: #00C896; }

.sets { margin-top: 14px; }
.setshead { display: grid; grid-template-columns: 34px 1fr 1fr 1fr 46px; gap: 8px; padding: 0 2px 6px;
  font-size: 10px; letter-spacing: .12em; color: #5C6670; font-weight: 600; }
.setshead span { text-align: center; } .setshead span:first-child { text-align: left; }
.setrow { display: grid; grid-template-columns: 34px 1fr 1fr 1fr 46px; gap: 8px; align-items: center; margin-bottom: 8px; }
.setn { color: #5C6670; font-size: 13px; }
.nf { width: 100%; height: 52px; background: #0D1117; border: 1px solid #2A3038; border-radius: 12px; color: #E6EDF3;
  font-size: 20px; text-align: center; transition: border-color .15s; }
.nf::placeholder { color: #3A4048; }
.nf:focus { outline: none; border-color: #00C896; box-shadow: 0 0 0 3px rgba(0,200,150,.12); }
.setrow.done .nf { border-color: transparent; background: #10141A; color: #8B96A5; }
.ck { height: 52px; border-radius: 12px; border: 1px solid #2A3038; background: #161B22; color: #5C6670;
  font-size: 20px; cursor: pointer; transition: all .15s ease-out; }
.ck:active { transform: translateY(1px); }
.ck.on { background: #00C896; border-color: #00C896; color: #06251C; }
.e1rmnow { margin-top: 10px; font-size: 12px; color: #8B96A5; }
.e1rmnow b { color: #00C896; font-weight: 500; font-size: 14px; }

.navrow { display: flex; gap: 10px; margin-top: 14px; }
.navbtn { flex: 1; height: 52px; border-radius: 14px; border: 1px solid #2A3038; background: #161B22; color: #E6EDF3;
  font: 600 15px 'Outfit'; cursor: pointer; transition: all .15s ease-out; }
.navbtn:disabled { opacity: .35; cursor: default; }
.navbtn.pri { background: #00C896; border-color: #00C896; color: #06251C; }
.navbtn.pri:active { transform: translateY(1px); }

.timerbar { position: fixed; bottom: 64px; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px;
  background: #161B22; border-top: 1px solid #2A3038; overflow: hidden; z-index: 30; }
.tfill { position: absolute; inset: 0; background: rgba(0,200,150,.14); transition: width 1s linear; }
.timerbar.zero .tfill { background: rgba(0,200,150,.3); }
.tcontent { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 16px; }
.tlabel { font-size: 10px; letter-spacing: .2em; color: #00C896; font-weight: 700; }
.ttime { font-size: 26px; color: #E6EDF3; }
.tskip { margin-left: auto; padding: 8px 16px; border-radius: 999px; border: 1px solid #2A3038; background: #0D1117;
  color: #8B96A5; font: 500 13px 'Outfit'; cursor: pointer; }

.plist { display: flex; flex-direction: column; gap: 8px; }
.prow { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; text-align: left;
  padding: 13px 14px; background: #161B22; border: 1px solid #2A3038; border-radius: 12px; color: inherit;
  cursor: pointer; transition: border-color .15s; }
.prow:hover { border-color: #3A4048; }
.pname { font-weight: 600; font-size: 14px; }
.ssdot { font-size: 11px; }
.pmeta { color: #5C6670; font-size: 12px; margin-top: 2px; }
.pnums { color: #8B96A5; font-size: 12px; text-align: right; flex-shrink: 0; }
.addbtn { width: 100%; margin-top: 12px; height: 48px; border-radius: 12px; border: 1px dashed #2A3038;
  background: transparent; color: #00C896; font: 600 14px 'Outfit'; cursor: pointer; }
.addbtn:hover { border-color: #00C896; }

.card { background: #161B22; border: 1px solid #2A3038; border-radius: 14px; padding: 16px; margin-bottom: 14px; }
.cardtitle { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #5C6670; font-weight: 600; margin-bottom: 12px; }
.tonrow { display: grid; grid-template-columns: 30px 1fr 52px 46px; gap: 10px; align-items: center; margin-bottom: 8px; }
.tonlbl { color: #8B96A5; font-size: 12px; font-weight: 600; }
.tonbar { height: 10px; background: #10141A; border-radius: 5px; overflow: hidden; }
.tonbar div { height: 100%; background: #00C896; border-radius: 5px; transition: width .3s; }
.tonval { font-size: 12px; color: #E6EDF3; text-align: right; }
.tondelta { font-size: 11px; text-align: right; color: #5C6670; }
.tondelta.up { color: #00C896; } .tondelta.dn { color: #F87171; }

.e1head { display: grid; grid-template-columns: 1fr repeat(4, 42px); gap: 6px; font-size: 10px; color: #5C6670;
  padding-bottom: 6px; border-bottom: 1px solid #21262E; margin-bottom: 6px; }
.e1head span { text-align: right; } .e1head span:first-child { text-align: left; }
.e1row { display: grid; grid-template-columns: 1fr repeat(4, 42px); gap: 6px; align-items: center; padding: 7px 0;
  border-bottom: 1px solid #171C23; }
.e1row:last-child { border-bottom: none; }
.e1name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tr { font-size: 12px; } .tr.up { color: #00C896; } .tr.dn { color: #F87171; }
.e1v { font-size: 12.5px; text-align: right; color: #C3CCD6; }
.empty { color: #5C6670; font-size: 13px; padding: 8px 0; }

.tabbar { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px;
  display: flex; background: rgba(13,17,23,.92); backdrop-filter: blur(12px); border-top: 1px solid #21262E; z-index: 40; }
.tabbar button { flex: 1; padding: 10px 0 14px; background: none; border: none; color: #5C6670;
  font: 500 11px 'Outfit'; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.tabbar button.on { color: #00C896; }
.ticon { font-size: 17px; line-height: 1; }

.overlay { position: fixed; inset: 0; background: rgba(3,6,10,.72); z-index: 50; display: flex; align-items: flex-end;
  justify-content: center; }
.sheet { width: 100%; max-width: 430px; max-height: 88vh; overflow-y: auto; background: #161B22;
  border: 1px solid #2A3038; border-radius: 20px 20px 0 0; padding: 18px 16px 24px; }
.sheethead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.sheethead h3 { font-size: 17px; font-weight: 700; }
.x { background: none; border: none; color: #5C6670; font-size: 26px; cursor: pointer; line-height: 1; }
.fgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.fgrid label { display: flex; flex-direction: column; gap: 5px; }
.fgrid .f2 { grid-column: span 2; }
.fgrid span { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #5C6670; font-weight: 600; }
.fgrid input, .fgrid select { height: 44px; background: #0D1117; border: 1px solid #2A3038; border-radius: 10px;
  color: #E6EDF3; padding: 0 12px; font: 400 15px 'Outfit'; }
.fgrid input.mono { font-family: 'DM Mono', monospace; }
.fgrid input:focus, .fgrid select:focus { outline: none; border-color: #00C896; }
.sheetactions { display: flex; gap: 10px; margin-top: 18px; }
.del { flex: 0 0 auto; padding: 0 18px; height: 48px; border-radius: 12px; border: 1px solid rgba(248,113,113,.4);
  background: transparent; color: #F87171; font: 600 14px 'Outfit'; cursor: pointer; }
.save { flex: 1; height: 48px; border-radius: 12px; border: none; background: #00C896; color: #06251C;
  font: 700 15px 'Outfit'; cursor: pointer; }
.save:disabled { opacity: .4; }

@media (prefers-reduced-motion: reduce) { .forge * { transition: none !important; } }
`;
