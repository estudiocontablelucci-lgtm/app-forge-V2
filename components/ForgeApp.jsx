"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import * as XLSX from "xlsx";
import { brzycki, keyOf, isNum, setsFor, repsFor, refFor, DELOAD_DEFAULT } from "@/lib/formulas";
import { TECNICAS, defDe, pasosDe, pasosDeLog, pasoHecho, serieCerrada, normalizar as normalizarTecnica, porAlias as tecnicaPorAlias } from "@/lib/tecnicas";
import { migrarACatalogo, resolverEjercicios, agregarAlCatalogo, buscarEnCatalogo, tieneSeriesRegistradas, absorberDeProgramas, sinReferenciasHuerfanas } from "@/lib/catalog";
import { pushSession, pushProgram, pullAll, mergeHistory, mergePrograms, mergeCatalog, limpiarBorrados, pushBorrados, logsFromHistory, sesionesPendientes, claveSesion, marcarParaAlumnos, hayServidor } from "@/lib/sync/client";
import { crearProgramaBasico } from "@/lib/programa-basico";
import { fusionarPrograma, candidatoAActualizar } from "@/lib/importar";
import { deltaE1rm, resumenCiclo, bienestar, fuerzaCorrelacion, BIENESTAR } from "@/lib/progreso";
import { crearDescanso, restante, avance, restaurarDescanso, normalizarPrefs } from "@/lib/descanso";
import { despertarAudio, agendarBeep, beepArmado, audioVivo, sonarAhora, notificarFinDescanso, limpiarAviso } from "@/lib/aviso";
import AccountButton from "./AccountButton";
import Ayuda from "./Ayuda";
import ProfileScreen from "./ProfileScreen";
import MedidasScreen from "./MedidasScreen";
import EvolucionMedidas from "./EvolucionMedidas";
import AsistenciaScreen from "./AsistenciaScreen";
import ExercisePicker from "./ExercisePicker";
import AvisoInvitacion from "./AvisoInvitacion";

/* ============================================================
   FORGE — Tracking de entrenamiento (MVP v2)
   Superserie blocks (2-4 ex), health check, historial, semáforo.
   ============================================================ */

const DEFAULT_SESSIONS = [
  { id: "A", name: "Volumen & Tempo" },
  { id: "B", name: "Moderada & Variación" },
  { id: "C", name: "Intensidad & Fuerza" },
];


/* ---------- Helpers ---------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmtRest = (s) => (s % 60 === 0 ? `${s / 60}'` : `${Math.floor(s / 60)}'${s % 60}"`);
const weekLabel = (w) => (w === "DL" ? "Deload" : `Sem ${w}`);
const round1 = (v) => Math.round(v * 10) / 10;
const fmtDate = (ts) => new Date(ts).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
function refLine(ex, week, deload) {
  const ref = refFor(ex, week);
  // "sin ref" y no "máquina": no hay referencia cargada, que no es lo mismo que
  // que el ejercicio sea en maquina — y leido en la fila del programa, al lado
  // de un "140kg", "máquina" se lee como si fuera una unidad de carga.
  const kg = ref === null || ref === "" ? "sin ref" : ref === "BW" ? "BW" : `${ref}${isNum(ref) ? "kg" : ""}`;
  // En deload por reps el rango baja: mostrar el original seria pedir el
  // volumen de una semana normal.
  const { min, max } = repsFor(ex, week, deload);
  return `${kg} × ${min}-${max} ${ex.unit === "pasos" ? "pasos" : ""}`.trim();
}

/**
 * Ubica `ex` en su dia justo despues de `despuesDe` (o primero, si es vacio) y
 * renumera los `order` de TODO el programa, dia por dia, 1..n.
 *
 * Renumerar y no buscarle un hueco al ejercicio movido: `order` solo existe para
 * ordenar, dos ejercicios con el mismo numero quedan en un orden que nadie
 * eligio, y mudar uno de dia deja el dia viejo con un salto. Renumerar entero
 * cuesta lo mismo y no deja ninguna de las dos cosas.
 *
 * `exercises` ya tiene a `ex` adentro con su sesion NUEVA — esto no mueve nada
 * entre dias, solo decide el orden dentro del que le toca.
 */
function reubicar(exercises, ex, despuesDe) {
  const porDia = new Map();
  for (const e of [...exercises].sort((a, b) => a.order - b.order)) {
    if (e.id === ex.id) continue;
    if (!porDia.has(e.session)) porDia.set(e.session, []);
    porDia.get(e.session).push(e);
  }
  if (!porDia.has(ex.session)) porDia.set(ex.session, []);
  const destino = porDia.get(ex.session);
  // Un `despuesDe` que no esta en el dia destino (o vacio) lo deja primero.
  const i = despuesDe ? destino.findIndex((e) => e.id === despuesDe) : -1;
  destino.splice(i + 1, 0, ex);

  const orden = new Map();
  for (const lista of porDia.values()) lista.forEach((e, n) => orden.set(e.id, n + 1));
  return exercises.map((e) => (orden.has(e.id) ? { ...e, order: orden.get(e.id) } : e));
}

/**
 * Kilos movidos en una sesion del historial.
 *
 * Los escalones de un dropset SUMAN: es carga movida igual. Vive aca y no
 * adentro de una pantalla porque lo usan dos —el grafico de bienestar y el
 * historial— y dos copias de la misma suma se separan al primer cambio.
 */
function tonelajeSesion(h) {
  let t = 0;
  for (const ex of h?.exercises || []) {
    for (const st of ex.sets || []) {
      for (const c of [st, ...(Array.isArray(st.pasos) ? st.pasos : [])]) {
        const kg = parseFloat(c.kg), reps = parseInt(c.reps);
        if (isNum(kg) && reps) t += kg * reps;
      }
    }
  }
  return t;
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
function semaphore(exercise, logs, week, deload) {
  const n = setsFor(exercise, week, deload);
  const sets = [];
  for (let i = 1; i <= n; i++) { const l = logs[keyOf(week, exercise.id, i)]; if (l && isDone(l)) sets.push(l); }
  if (!sets.length || exercise.unit === "pasos") return "gray";
  // La guia de reps es la de la semana: en un deload por reps, exigir el rango
  // normal pintaria de rojo una sesion que se hizo exactamente como se pidio.
  const guideReps = repsFor(exercise, week, deload).min;
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
        exercises: (raw.program || []).map((e) => ({ ...e, description: e.description ?? "" })),
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

/**
 * v3: los ejercicios pasan a referenciar el catalogo.
 *
 * Se corre despues de migrateState y es idempotente: los ejercicios que ya
 * tienen `exerciseId` quedan como estan. Los nombres se deduplican por nombre
 * normalizado, asi que dos formas de escribir el mismo ejercicio terminan
 * apuntando a la misma entrada.
 */
/**
 * Deja el estado guardado con sus referencias al catalogo CONSISTENTES.
 *
 * Habia dos formas de estar mal y esto solo miraba una.
 *
 * - **Falta el `exerciseId`** — programas viejos, anteriores al catalogo. Los
 *   migra `migrarACatalogo`, que crea la entrada y la enlaza.
 * - **El `exerciseId` APUNTA A NADA** — el que faltaba. Un programa puede traer
 *   referencias a un catalogo que este dispositivo no tiene: llego de otra
 *   cuenta, de otro navegador, o de un respaldo. `faltaMigrar` da false porque
 *   el id ESTA, asi que el estado se devolvia tal cual y nadie lo reparaba
 *   nunca.
 *
 * Lo segundo no es teorico: el 2026-08-09 un programa con 16 referencias
 * huerfanas no subio en NINGUNA sincronizacion —`program_exercises.exercise_id`
 * es una FK y tumba el INSERT entero— y la app anunciaba "Sincronizado".
 *
 * Se repara ACA, al cargar, y no solo antes de subir: un estado incoherente en
 * memoria rompe tambien lo que se muestra, no solo lo que viaja.
 */
function migrarCatalogo(state) {
  if (!state) return state;
  const faltaMigrar = (state.programs || []).some((p) => (p.exercises || []).some((e) => !e.exerciseId));
  if (state.catalog && !faltaMigrar) {
    // Primero dar de alta lo que se puede; recien despues soltar lo que no.
    const catalog = absorberDeProgramas(state.catalog, state.programs);
    const { programs, sueltas, repuntadas } = sinReferenciasHuerfanas(state.programs, catalog);
    if (catalog === state.catalog && !sueltas && !repuntadas) return state;
    return { ...state, catalog, programs };
  }

  const { catalog, programs } = migrarACatalogo(state.programs, state.catalog);
  return { ...state, catalog, programs };
}

function loadState() {
  try {
    const r = localStorage.getItem("forge-v2");
    if (!r) return null;
    return migrarCatalogo(migrateState(JSON.parse(r)));
  } catch { return null; }
}
let saveT = null;
function saveState(s) { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem("forge-v2", JSON.stringify(s)); } catch {} }, 500); }

/**
 * Borrar el estado del disco, YA y sin que nadie lo vuelva a escribir.
 *
 * El `clearTimeout` no es de adorno: `saveState` guarda con 500 ms de retraso,
 * y cerrar sesion navega enseguida. Sin cancelar el guardado pendiente, el
 * estado de la cuenta que se acaba de ir se re-escribe despues de haberlo
 * borrado — y reaparece en la cuenta siguiente.
 */
function limpiarEstado() {
  clearTimeout(saveT);
  saveT = null;
  try { localStorage.removeItem("forge-v2"); } catch { /* modo privado, o sin permiso */ }
}

/* ---------- Mini components ---------- */
function ExSetRow({ ex, n, week, logs, onSetChange, onPasoChange, deload, totalSets }) {
  const k = keyOf(week, ex.id, n);
  const l = logs[k] || {};
  const handleChange = (field, val) => onSetChange(ex, n, field, val);
  // Pre-fill KG with refKg on first focus if empty
  const refSemana = refFor(ex, week);
  const prefillKg = () => { if ((l.kg === undefined || l.kg === "") && isNum(refSemana)) handleChange("kg", String(refSemana)); };
  // Los escalones aparecen recien cuando la serie principal tiene reps: antes
  // son ruido, y en el telefono el ejercicio entero deja de entrar en pantalla.
  const nPasos = pasosDe(ex, n, totalSets);
  const abiertos = nPasos && String(l.reps ?? "").trim() !== "";
  const ps = pasosDeLog(l);
  return (
    <>
      <div className={`setrow ${l.done ? "done" : ""}`}>
        <span className="setn mono">S{n}</span>
        <input className="nf mono" inputMode="decimal" placeholder={isNum(refSemana) ? String(refSemana) : refSemana === "BW" ? "0" : "—"}
          value={l.kg ?? ""} onFocus={prefillKg} onChange={(e) => handleChange("kg", e.target.value)} />
        <input className="nf mono" inputMode="numeric" placeholder={String(repsFor(ex, week, deload).max)}
          value={l.reps ?? ""} onChange={(e) => handleChange("reps", e.target.value)} />
        <input className="nf mono" inputMode="decimal" placeholder={ex.rir || "—"}
          value={l.rir ?? ""} onChange={(e) => handleChange("rir", e.target.value)} />
      </div>
      {abiertos ? Array.from({ length: nPasos }, (_, i) => i).map((i) => (
        <div key={i} className={`setrow paso ${pasoHecho(ps[i]) ? "done" : ""}`}>
          <span className="setn mono">↓{i + 1}</span>
          <input className="nf mono" inputMode="decimal" placeholder="—"
            value={ps[i]?.kg ?? ""} onChange={(e) => onPasoChange(ex, n, i, "kg", e.target.value)} />
          <input className="nf mono" inputMode="numeric" placeholder="—"
            value={ps[i]?.reps ?? ""} onChange={(e) => onPasoChange(ex, n, i, "reps", e.target.value)} />
          {/* Un escalon no lleva RIR: se hace al fallo, ese es el punto. */}
          <span className="nf-off mono">—</span>
        </div>
      )) : null}
    </>
  );
}

/* ============================================================ */
export default function ForgeApp() {
  // Una cuenta nueva arranca SIN programas. Antes se instalaba el mesociclo de
  // Agustin en toda instalacion: el usuario nuevo veia el programa de otro, con
  // sus kilos y sus notas de lesion, sin forma de saber que no era suyo.
  const [programs, setPrograms] = useState([]);
  const [catalog, setCatalog] = useState(() => migrarACatalogo([]).catalog);
  const [activeProgramId, setActiveProgramId] = useState(null);
  const [logs, setLogs] = useState({});
  const [history, setHistory] = useState([]);
  // Programas borrados en este dispositivo que todavia no se avisaron al
  // servidor. Sin esto, el pull siguiente los resucita.
  const [borrados, setBorrados] = useState({});
  const [loaded, setLoaded] = useState(false);

  const [tab, setTab] = useState("entrenar");
  const [week, setWeek] = useState(1);
  const [session, setSession] = useState(null);
  const [blockIdx, setBlockIdx] = useState(0);
  // El descanso guarda un VENCIMIENTO, no una cuenta regresiva. Ver
  // `lib/descanso.js`: lo que queda se deriva del reloj cada vez que se mira,
  // asi que dormirse, cambiar de pestaña o cerrar la app no lo desincronizan.
  const [timer, setTimer] = useState(null);   // { id, total, fin } | null
  const [quedan, setQuedan] = useState(0);    // segundos, derivados de `timer`
  const [prefs, setPrefs] = useState(normalizarPrefs(null));
  // Avisos de una linea que se van solos. Reemplazan a los `alert()`, que en el
  // telefono son una caja del sistema operativo encima de la app.
  const [aviso, setAviso] = useState(null);
  const [editing, setEditing] = useState(null);
  const [progSession, setProgSession] = useState(null); // session id
  const [editingSessions, setEditingSessions] = useState(false);
  const [verDias, setVerDias] = useState(false);   // el desplegable de dias del programa
  // Grupos de la lista de programas que el usuario cerro a mano. Lo que NO esta
  // aca cae al default: abierto el grupo del programa activo.
  const [gruposCerrados, setGruposCerrados] = useState({});
  // Las tomas de medidas, para el grafico de evolucion en Progreso. Van contra
  // el servidor y no por el localStorage: se cargan sentado despues de medirse,
  // no en el gimnasio, asi que no hacen falta sin señal.
  const [medidas, setMedidas] = useState([]);
  const [healthCheck, setHealthCheck] = useState(null);
  const [savedHealth, setSavedHealth] = useState(null);
  const [sessionStart, setSessionStart] = useState(null);
  const [expandedLog, setExpandedLog] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // "finish" | "exit" | null
  const [sessionNote, setSessionNote] = useState(""); // nota que el alumno deja al cerrar
  const [reentryChoice, setReentryChoice] = useState(null); // session id pending choice
  const [descModal, setDescModal] = useState(null); // exercise object to show description
  // Borrar una sesion o un programa preguntaba con `window.confirm`, que en el
  // telefono es una caja del SISTEMA: bloquea la app, no se parece a nada del
  // resto y en una PWA instalada delata que abajo hay un navegador. Es lo mismo
  // que la app ya evita para los avisos, y estas dos eran justo las decisiones
  // destructivas. `{ mensaje, detalle, textoOk, onOk }`.
  const [confirmarBorrado, setConfirmarBorrado] = useState(null);
  const [programListView, setProgramListView] = useState(false); // show program list vs active program
  const [editingProgram, setEditingProgram] = useState(null); // program metadata editor
  const [importWizard, setImportWizard] = useState(null); // { step, data, mapping, preview, name }
  const [showProfile, setShowProfile] = useState(false);
  const [showMedidas, setShowMedidas] = useState(false);
  const [showAsistencia, setShowAsistencia] = useState(false);
  const [grupoSel, setGrupoSel] = useState(null); // grupo muscular en foco
  const [syncState, setSyncState] = useState(null); // texto para la pantalla de perfil
  const [syncing, setSyncing] = useState(false);

  // Sesion: si hay, se sincroniza; si no, la app funciona igual solo con localStorage.
  const { data: authSession, update: actualizarSesion } = useSession();
  const signedIn = Boolean(authSession?.user?.id);

  /**
   * Este dispositivo tiene cuenta, aunque ahora mismo no se pueda confirmar.
   *
   * Sin red, `/api/auth/session` falla y `useSession` responde "no autenticado".
   * Es correcto como estado momentaneo y es un error como conclusion: quien
   * termina de entrenar en el subsuelo del gimnasio SI tiene cuenta, y su sesion
   * tiene que quedar marcada para subir. Con `signedIn` a secas no se marcaba y
   * el aviso de "sin subir" no aparecia nunca — justo en el caso para el que se
   * escribio.
   */
  /**
   * Si HAY red ahora mismo. Distinto de "el modo sin conexion esta listo", que
   * es una capacidad y no un estado — confundir las dos cosas hacia que la app
   * pareciera trabada sin conexion cuando la conexion ya habia vuelto.
   */
  // Arranca sabiendo. Empezaba en `true` y se corregia despues, asi que el
  // telefono en modo avion abria la app afirmando tener conexion y recien se
  // desdecia cuando algo fallaba — que sin senal tarda, porque `fetch` no falla
  // rapido.
  const [hayRed, setHayRed] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false);
  useEffect(() => {
    // `navigator.onLine` dice si hay INTERFAZ de red, no si se llega a
    // internet: con wifi sin salida contesta que si. Sirve para enterarse de
    // los CAMBIOS al instante; para saber si de verdad se llega, se PREGUNTA.
    let vigente = true;
    const preguntar = async () => {
      const r = await hayServidor();
      if (vigente) setHayRed(r);
    };
    const alCambiar = () => {
      // El corte se cree de una (no hay falsos negativos). La vuelta se
      // verifica: "hay wifi" no es "hay internet".
      if (navigator.onLine === false) setHayRed(false);
      else preguntar();
    };
    preguntar();
    window.addEventListener("online", alCambiar);
    window.addEventListener("offline", alCambiar);
    return () => {
      vigente = false;
      window.removeEventListener("online", alCambiar);
      window.removeEventListener("offline", alCambiar);
    };
  }, []);

  /** Evidencia real: una sincronizacion que sale o que falla por falta de red. */
  const marcarRed = (llego) => setHayRed(llego);

  /**
   * Las medidas, cuando se abre Progreso.
   *
   * No al arrancar la app: son de otra pantalla y el gimnasio no las necesita.
   * Se recargan al volver de cargar una toma —`showMedidas` pasa a false— asi
   * el grafico no queda mostrando la version anterior.
   */
  useEffect(() => {
    if (!signedIn || tab !== "progreso" || showMedidas) return;
    let vigente = true;
    fetch("/api/medidas")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vigente && d?.medidas) setMedidas(d.medidas); })
      .catch(() => {});
    return () => { vigente = false; };
  }, [signedIn, tab, showMedidas]);

  const [perfilLocal, setPerfilLocal] = useState(null);
  useEffect(() => {
    if (!signedIn) return;
    const { name, email, image } = authSession.user;
    setPerfilLocal((p) => (p?.email === email && p?.name === name ? p : { name, email, image }));
  }, [signedIn, authSession]);
  const conCuenta = signedIn || Boolean(perfilLocal);

  /**
   * Cerrar sesion de verdad, que incluye OLVIDAR el perfil.
   *
   * `perfilLocal` existe para que sin señal la app no le diga "Entrar" a
   * alguien que tiene cuenta: `/api/auth/session` falla y next-auth responde
   * "no autenticado", que es cierto como estado del momento y falso como
   * conclusion. El problema es que al cerrar sesion el servidor responde
   * EXACTAMENTE LO MISMO, asi que la app no podia distinguir "no hay sesion
   * porque no hay red" de "no hay sesion porque me fui" — y seguia mostrando
   * al usuario adentro, con el cartel de "Sin conexión", para siempre.
   *
   * Lo que las separa no es una respuesta del servidor: es que cerrar sesion es
   * un ACTO DELIBERADO de la persona. Estar sin red nunca borra el perfil;
   * tocar el boton siempre lo borra.
   *
   * Y se limpian tambien los programas y el historial: son de la cuenta que se
   * va. Si quedaran, al entrar la cuenta siguiente los MERGEA y los sube como
   * propios — asi es como el programa de una persona termina en la cuenta de
   * otra. El servidor ya los tiene; no se pierde nada.
   */
  const cerrarSesion = () => {
    limpiarEstado();
    setPerfilLocal(null);
    setPrograms([]);
    setActiveProgramId(null);
    setLogs({});
    setHistory([]);
    setCatalog(migrarACatalogo([]).catalog);   // el catalogo base, no vacio
    setBorrados({});
    setTimer(null);
    signOut({ callbackUrl: "/" });
  };

  // Derived: active program, sessions, exercises
  const activeProgram = programs.find((p) => p.id === activeProgramId) || programs[0];
  // Config de deload del programa. Los programas creados antes de que esto
  // existiera no la traen y caen al default (-40% por series, piso de 2).
  const deloadCfg = { ...DELOAD_DEFAULT, ...activeProgram?.deload };
  // Programa que prescribio un entrenador: el alumno registra, no edita.
  const esAsignado = Boolean(activeProgram?.readOnly);

  /**
   * MIRAR un programa y ENTRENARLO son dos cosas distintas.
   *
   * Eran la misma variable: abrir un programa de la lista para ver que tenia lo
   * dejaba activo, y el activo es el que gobierna Entrenar, Historial y
   * Progreso. Revisar la rutina que le escribiste a un alumno te cambiaba la
   * tuya, en silencio y sin haber tocado nada mas que una tarjeta.
   *
   * `activeProgramId` sigue siendo EL QUE SE ENTRENA y no lo cambia nadie sin
   * pedirlo. `vistoId` es lo que muestra la pestaña Programa; en null mira al
   * activo, que es el caso de siempre.
   */
  const [vistoId, setVistoId] = useState(null);
  const programaVisto = programs.find((p) => p.id === vistoId) || activeProgram;
  const esElActivo = Boolean(programaVisto) && programaVisto.id === activeProgramId;
  const deloadVisto = { ...DELOAD_DEFAULT, ...programaVisto?.deload };
  const esAsignadoVisto = Boolean(programaVisto?.readOnly);
  // Un programa que le escribiste a un alumno: existe para que lo entrene otro.
  const esDeAlumnosVisto = Boolean(programaVisto?.asignadoA?.length || programaVisto?.paraAlumnos);

  /**
   * Programas separados por para quien son.
   *
   * Se deriva de los datos en vez de guardar un "tipo": el mismo programa puede
   * ser el que entrenás vos y a la vez el que le prescribís a un alumno, y
   * obligar a elegir una categoria al crearlo seria una decision falsa. Los
   * grupos vacios no se muestran, asi que quien entrena solo ve una lista.
   */
  const gruposDeProgramas = useMemo(() => {
    const asignadosAMi = programs.filter((p) => p.readOnly);
    // Para alumnos = se lo asigne a alguien MAS, o lo marque como tal. Lo
    // segundo hace falta porque un programa se escribe para un alumno antes de
    // que exista el alumno; hasta que hubo que asignarlo, vivia mezclado con la
    // rutina propia y no habia forma de separarlo.
    const esDeAlumnos = (p) => Boolean(p.asignadoA?.length || p.paraAlumnos);
    const prescritos = programs.filter((p) => !p.readOnly && esDeAlumnos(p));
    const mios = programs.filter((p) => !p.readOnly && !esDeAlumnos(p));
    const grupos = [];
    if (mios.length) {
      grupos.push({
        titulo: asignadosAMi.length || prescritos.length ? "Mis programas" : "Programas",
        ayuda: null,
        lista: mios,
      });
    }
    if (prescritos.length) {
      grupos.push({
        titulo: "Para alumnos",
        ayuda: "Editarlos le cambia la rutina a quien los esté entrenando.",
        lista: prescritos,
      });
    }
    if (asignadosAMi.length) {
      grupos.push({
        titulo: "De mi entrenador",
        ayuda: "Los registrás pero no se editan: la prescripción es de quien te entrena.",
        lista: asignadosAMi,
      });
    }
    return grupos.length ? grupos : [{ titulo: "Programas", ayuda: null, lista: [] }];
  }, [programs]);
  const sessions = activeProgram?.sessions || DEFAULT_SESSIONS;
  // Los nombres se resuelven contra el catalogo, asi que corregir uno ahi se
  // propaga a todos los programas que lo usan. El resto del codigo sigue
  // leyendo ex.name sin enterarse de que hay un catalogo detras.
  const program = useMemo(
    () => resolverEjercicios(activeProgram?.exercises || [], catalog),
    [activeProgram, catalog],
  );
  // Lo mismo para el que se esta mirando. Cuando es el activo —el caso normal—
  // las dos derivadas dan lo mismo.
  const sesionesVistas = programaVisto?.sessions || DEFAULT_SESSIONS;
  const ejerciciosVistos = useMemo(
    () => resolverEjercicios(programaVisto?.exercises || [], catalog),
    [programaVisto, catalog],
  );
  // Las semanas del que se mira: el editor de ejercicios pregunta las refs por
  // semana, y un programa de 4 no tiene las mismas que uno de 6.
  const semanasVistas = useMemo(() => {
    const n = programaVisto?.weeks || 4;
    const ws = Array.from({ length: n }, (_, i) => i + 1);
    if (programaVisto?.hasDeload) ws.push("DL");
    return ws;
  }, [programaVisto?.weeks, programaVisto?.hasDeload]);

  // Helpers to update the program on screen
  // Embudo unico de toda edicion de programa. Sella `updatedAt` porque de esa
  // marca depende quien gana entre dos dispositivos: sin ella, el que sincroniza
  // ultimo pisa al otro sin importar quien edito despues.
  //
  // Edita el que se ESTA MIRANDO y no el activo: las dos unicas pantallas que
  // editan un programa —el detalle y sus editores— muestran el visto, y un
  // programa que se puede abrir sin activarlo tambien se tiene que poder
  // corregir sin activarlo.
  const updateProgramaVisto = (updater) => setPrograms((ps) => ps.map((p) => {
    if (p.id !== programaVisto?.id) return p;
    const siguiente = typeof updater === "function" ? updater(p) : { ...p, ...updater };
    return { ...siguiente, updatedAt: Date.now() };
  }));
  /**
   * Un programa recien creado o importado se ABRE, y se activa solo si no habia
   * ninguno: en una cuenta vacia no hay nada que proteger, y pedir un paso mas
   * seria pedirlo justo cuando la app todavia no explico que es el activo.
   */
  const abrirProgramaNuevo = (id) => {
    setVistoId(id);
    if (!activeProgramId) setActiveProgramId(id);
    setProgSession(null);
    setProgramListView(false);
  };

  /** Pasa a ser el programa que se entrena. Siempre a pedido, nunca de rebote. */
  const activarPrograma = (p) => {
    if (!p) return;
    setActiveProgramId(p.id);
    setAviso(`Ahora entrenás "${p.name}". Entrenar, Historial y Progreso pasan a este programa.`);
  };

  const setSessions = (updater) => updateProgramaVisto((p) => ({ ...p, sessions: typeof updater === "function" ? updater(p.sessions) : updater }));
  const setProgram = (updater) => updateProgramaVisto((p) => ({ ...p, exercises: typeof updater === "function" ? updater(p.exercises) : updater }));

  useEffect(() => {
    const s = loadState();
    if (s) {
      setPrograms(s.programs || []);
      setActiveProgramId(s.activeProgramId || s.programs?.[0]?.id || null);
      if (s.catalog) setCatalog(s.catalog);
      if (s.borrados) setBorrados(s.borrados);
      if (s.perfilLocal) setPerfilLocal(s.perfilLocal);
      setPrefs(normalizarPrefs(s.prefs));
      setLogs(s.logs || {});
      setHistory(s.history || []);
      // El descanso sobrevive a que el sistema mate la app. Sale gratis:
      // guardado como vencimiento, restaurarlo es leerlo. Uno vencido hace rato
      // se descarta — cantar "A LA BARRA" al abrir la app de mañana no sirve.
      const d = restaurarDescanso(s.timer);
      if (d) setTimer(d);
    }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) saveState({ programs, catalog, activeProgramId, logs, history, borrados, perfilLocal, prefs, timer }); }, [programs, catalog, activeProgramId, logs, history, borrados, perfilLocal, prefs, timer, loaded]);

  /**
   * Siempre tiene que haber un programa activo si hay programas.
   *
   * `activeProgram` caia a `programs[0]` cuando el id era null, asi que la
   * pantalla se veia bien — pero `activeProgramId` seguia nulo y TODO lo que
   * compara contra ese id quedaba mirando a nadie: el filtro del Historial
   * (que mostraba cero sesiones), `updateActiveProgram` (que no editaba nada) y
   * el conteo de semanas. Le pasaba a cualquiera cuyos programas llegaran por
   * sincronizacion en vez de crearlos a mano, que desde que las cuentas
   * arrancan vacias es el caso normal de un alumno.
   */
  useEffect(() => {
    if (!loaded) return;
    if (!programs.length) { if (activeProgramId !== null) setActiveProgramId(null); return; }
    if (programs.some((p) => p.id === activeProgramId)) return;
    // Si hay uno prescrito por un entrenador, ese es el que corresponde
    // entrenar. `programs[0]` era el primero que hubiera llegado, que no
    // significa nada. Solo aplica cuando no hay nada elegido: una vez que el
    // usuario elige, se respeta.
    const asignado = programs.find((p) => p.readOnly);
    setActiveProgramId((asignado || programs[0]).id);
  }, [loaded, programs, activeProgramId]);

  // Lo mismo para el que se esta mirando: un pull puede borrar el programa que
  // quedo abierto. `programaVisto` cae al activo igual, pero dejar el id
  // colgado haria que un programa nuevo con ese id —imposible hoy, no manana—
  // se abriera solo.
  useEffect(() => {
    if (!loaded || vistoId === null) return;
    if (!programs.some((p) => p.id === vistoId)) setVistoId(null);
  }, [loaded, programs, vistoId]);

  // El historial se lee dentro de sincronizar() sin que sea una dependencia:
  // asi el boton siempre ve el estado actual y la funcion no se recrea en cada
  // serie que se registra.
  const historyRef = useRef(history);
  historyRef.current = history;
  const programsRef = useRef(programs);
  programsRef.current = programs;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const borradosRef = useRef(borrados);
  borradosRef.current = borrados;
  // El listener de "atras" se registra una sola vez: lee el estado por ref para
  // no re-suscribirse en cada pestaña que se toca.
  const tabRef = useRef(tab); tabRef.current = tab;
  const programListViewRef = useRef(programListView); programListViewRef.current = programListView;
  const verDiasRef = useRef(verDias); verDiasRef.current = verDias;
  const sessionRef = useRef(session); sessionRef.current = session;
  const showProfileRef = useRef(showProfile); showProfileRef.current = showProfile;
  const showMedidasRef = useRef(showMedidas); showMedidasRef.current = showMedidas;
  const showAsistenciaRef = useRef(showAsistencia); showAsistenciaRef.current = showAsistencia;
  const importWizardRef = useRef(importWizard); importWizardRef.current = importWizard;
  // Las superpuestas tambien: el atras del telefono tiene que cerrarlas a ellas
  // primero. Sin esto la caja quedaba abierta y la app de atras se movia sola.
  const descModalRef = useRef(descModal); descModalRef.current = descModal;
  const confirmarBorradoRef = useRef(confirmarBorrado); confirmarBorradoRef.current = confirmarBorrado;
  const confirmActionRef = useRef(confirmAction); confirmActionRef.current = confirmAction;
  const editingRef = useRef(editing); editingRef.current = editing;
  const editingProgramRef = useRef(editingProgram); editingProgramRef.current = editingProgram;
  const editingSessionsRef = useRef(editingSessions); editingSessionsRef.current = editingSessions;

  /**
   * Sincroniza en los dos sentidos: baja lo que hay en la nube y sube las
   * sesiones locales que no llegaron.
   *
   * Lo segundo es el caso del gimnasio: si al terminar de entrenar no habia
   * senal, el push quedo sin hacer y la sesion vive solo en el telefono. Sin
   * esto habria que volver a registrarla a mano.
   */
  const sincronizar = async () => {
    if (!signedIn || syncing) return;
    setSyncing(true);
    setSyncState("Sincronizando…");

    const r = await pullAll();
    // La palabra final sobre si hay red: lo que acaba de pasar, no lo que
    // opina `navigator.onLine`.
    marcarRed(r.ok || r.motivo !== "sin-red");
    if (!r.ok) {
      setSyncState(r.motivo === "sin-red"
        ? "Sin conexión. Lo tuyo está guardado en el teléfono."
        : "No se pudo sincronizar. Reintentá en un rato.");
      setSyncing(false);
      return;
    }

    const { programs: remotos = [], history: histRemoto = [], catalog: catRemoto = [] } = r.data;
    // Los borrados pendientes se avisan ANTES de fusionar: si el servidor
    // todavia devuelve un programa que este dispositivo borro, no puede entrar.
    const lapidas = Object.keys(borradosRef.current);
    if (lapidas.length) await pushBorrados(lapidas);
    // El catalogo primero: los programas que llegan lo referencian por id.
    if (catRemoto.length) setCatalog((C) => mergeCatalog(C, catRemoto));
    if (remotos.length) {
      // Los ejercicios que llegan de otro dispositivo se incorporan al catalogo.
      // Sin esto la app los muestra igual (cae al nombre denormalizado) pero no
      // aparecen en el selector, asi que no se pueden reutilizar en otra sesion.
      // Respeta el id que traen, para que ambos dispositivos hablen del mismo
      // ejercicio y no de dos copias homonimas.
      setCatalog((C) => absorberDeProgramas(C, remotos));
      setPrograms((P) => mergePrograms(P, remotos, borradosRef.current));
    }
    if (histRemoto.length) {
      setHistory((H) => mergeHistory(H, histRemoto));
      // Lo local va segundo y por lo tanto gana: el usuario puede estar a
      // mitad de una serie cuando esto resuelve y no se le pisa nada.
      const reconstruidos = logsFromHistory(histRemoto);
      setLogs((L) => ({ ...reconstruidos, ...L }));
    }

    // El catalogo tiene que quedar consistente ANTES de subir los programas:
    // `program_exercises.exercise_id` es una FK, y un ejercicio que apunta a
    // una entrada inexistente hace fallar el INSERT del programa entero. Como
    // el push se reintenta en cada sincronizacion, ese programa no sube NUNCA.
    // Primero se dan de alta las que faltan, y recien lo que ni asi se pudo
    // resolver se suelta. Ver `lib/catalog.js`.
    const catConPropios = absorberDeProgramas(catalogRef.current, programsRef.current);
    if (catConPropios !== catalogRef.current) setCatalog(catConPropios);
    const { programs: aSubir, sueltas } = sinReferenciasHuerfanas(programsRef.current, catConPropios);
    if (sueltas) setPrograms((P) => P.map((p) => aSubir.find((x) => x.id === p.id) || p));

    // Los programas propios se suben siempre, hayan sido entrenados o no: uno
    // recien creado tiene que existir en el servidor para poder asignarselo a
    // un alumno. Los ajenos (asignados por un entrenador) no se tocan.
    let programasSubidos = 0;
    const programasFallidos = [];
    for (const p of aSubir.filter((x) => !x.readOnly)) {
      const res = await pushProgram(p, catConPropios);
      // Un programa que no sube NO puede contarse como si nada. Antes se
      // descartaba el resultado y el cartel decia "Sincronizado · 4 programas"
      // con un 500 del servidor abajo — solo visible en los logs, que en un
      // telefono no existen.
      if (res.ok) programasSubidos++;
      else programasFallidos.push(p.name || p.id);
    }

    // Una lapida deja de hacer falta cuando el servidor ya no devuelve ese
    // programa: guardarlas para siempre haria crecer el localStorage sin techo.
    setBorrados((b) => limpiarBorrados(b, remotos));

    const pendientes = sesionesPendientes(historyRef.current, histRemoto);

    let subidas = 0;
    const fallaron = [];
    for (const h of pendientes) {
      const prog = programsRef.current.find((p) => p.id === h.programId) || programsRef.current[0];
      if (!prog) continue;
      const res = await pushSession({ program: prog, entry: h, catalog: catalogRef.current });
      if (res.ok) { subidas++; marcarSubida(h); } else fallaron.push(h);
    }
    // Lo que bajo del servidor ya esta subido por definicion: si una sesion
    // volvio en el pull, la marca de pendiente que tuviera es vieja.
    const enLaNube = new Set(histRemoto.map(claveSesion));
    if (enLaNube.size) {
      setHistory((H) => H.map((h) => (h.pendiente && enLaNube.has(claveSesion(h)) ? { ...h, pendiente: false } : h)));
    }

    const partes = [`${histRemoto.length} en la nube`];
    if (subidas) partes.push(`${subidas} subida${subidas === 1 ? "" : "s"} recién`);
    if (programasSubidos) partes.push(`${programasSubidos} programa${programasSubidos === 1 ? "" : "s"}`);
    if (fallaron.length) partes.push(`${fallaron.length} sin subir`);

    // Un programa que no subio se DICE, y con su nombre. Anunciar
    // "Sincronizado" mientras algo quedo afuera es el peor de los dos estados
    // posibles: el usuario cree que su programa esta en la nube y no esta.
    if (programasFallidos.length) {
      const cuales = programasFallidos.slice(0, 2).join(", ");
      const resto = programasFallidos.length > 2 ? ` y ${programasFallidos.length - 2} más` : "";
      setSyncState(`Se sincronizó lo demás, pero no se pudo subir ${cuales}${resto}. Está guardado en el teléfono; reintentá en un rato.`);
    } else {
      setSyncState(`Sincronizado · ${partes.join(" · ")}.`);
    }
    setSyncing(false);
  };

  /**
   * Cuando vuelve la red, ponerse al dia solo.
   *
   * El pull automatico corre UNA vez al abrir. Si esa vez no habia señal, no lo
   * reintentaba nadie: la app se quedaba mostrando solo lo local hasta reiniciar
   * del todo, aunque la conexion hubiera vuelto hacia rato. Tambien se refresca
   * la sesion, porque sin red `useSession` concluyo "no autenticado" y esa
   * conclusion no se corrige sola.
   */
  const sincronizarRef = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    const alVolver = async () => {
      try { await actualizarSesion(); } catch { /* la sesion se resuelve sola despues */ }
      sincronizarRef.current?.();
    };
    window.addEventListener("online", alVolver);
    return () => window.removeEventListener("online", alVolver);
  }, [loaded, actualizarSesion]);

  // Pull automatico al entrar, una sola vez por login.
  const pulled = useRef(false);
  useEffect(() => {
    sincronizarRef.current = sincronizar;
    if (!loaded || !signedIn || pulled.current) return;
    pulled.current = true;
    sincronizar();
  }, [loaded, signedIn]);

  /**
   * El reloj del descanso.
   *
   * No cuenta: MIRA. Cada tick pregunta cuanto falta para el vencimiento, asi
   * que si la pagina estuvo congelada el numero se corrige solo al volver, en
   * vez de arrastrar el atraso para siempre.
   *
   * Se mira cada 250 ms y no cada segundo por una razon sola: al volver de
   * segundo plano, un intervalo de un segundo puede tardar hasta un segundo en
   * refrescar y la barra queda mostrando un numero viejo justo cuando se la
   * esta mirando. Es una resta y una comparacion, no cuesta nada.
   */
  const avisadoRef = useRef(null);
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  useEffect(() => {
    if (!timer) { setQuedan(0); return; }

    const mirar = () => {
      const q = restante(timer);
      setQuedan(q);
      if (q > 0 || avisadoRef.current === timer.id) return;
      // Vencio. Se avisa UNA vez por descanso, aunque el tick corra de nuevo.
      avisadoRef.current = timer.id;
      const p = prefsRef.current;
      sonarAhora({ sonido: p.sonido, vibracion: p.vibracion });
      // La notificacion solo si la app no esta a la vista: con la pantalla
      // encendida y la barra en pantalla, un cartel del sistema es ruido.
      if (p.notificacion && typeof document !== "undefined" && document.hidden) notificarFinDescanso();
    };

    mirar();
    const iv = setInterval(mirar, 250);
    // Volver a la app es el momento en que mas importa que el numero sea el de
    // verdad, y es justo cuando el intervalo puede venir de estar congelado.
    const alVolverAVer = () => { if (!document.hidden) mirar(); };
    document.addEventListener("visibilitychange", alVolverAVer);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", alVolverAVer); };
  }, [timer]);

  /**
   * Red de seguridad: agendar el beep de un descanso que llego SIN agendar.
   *
   * `maybeStartRest` lo agenda cuando el descanso nace, y ahi hay gesto seguro
   * (se acaba de escribir en un input). Pero hay un camino que no pasa por ahi:
   * el descanso RESTAURADO. Si Android mata la app a mitad de serie —con la
   * pantalla apagada y el telefono en el banco, que es el caso normal— al
   * volver el cronometro se lee del disco y sigue corriendo bien, pero el grafo
   * de audio arranco de cero y no tiene nada agendado. El descanso se veia
   * perfecto y vencia mudo.
   *
   * Agendar necesita un gesto del usuario y al abrir la app no hubo ninguno,
   * asi que se engancha al primero que venga. Se intenta tambien de entrada por
   * si el audio seguia vivo de un descanso anterior de la misma sesion.
   */
  useEffect(() => {
    if (!timer || !prefs.sonido || beepArmado()) return;
    let vivo = true;
    const GESTOS = ["pointerdown", "keydown", "touchstart"];
    const sacar = () => { for (const ev of GESTOS) window.removeEventListener(ev, armar); };
    function armar() {
      if (!vivo || beepArmado()) return;
      despertarAudio().then((listo) => {
        if (!vivo || !listo) return;
        const q = restante(timer);
        if (q > 0) { agendarBeep(q); sacar(); }
      });
    }
    for (const ev of GESTOS) window.addEventListener(ev, armar, { passive: true });
    // De entrada SOLO si el audio ya venia vivo de un descanso anterior. Sin ese
    // filtro, el intento del montaje llama a `resume()` sin gesto, el navegador
    // deja la promesa PENDIENTE en lugar de rechazarla, y queda un intento
    // colgado que revive junto con el del gesto y agenda dos veces.
    if (audioVivo()) armar();
    return () => { vivo = false; sacar(); };
  }, [timer, prefs.sonido]);

  /** Cerrar el descanso: apaga el beep agendado y saca la notificacion. */
  const cerrarDescanso = () => { limpiarAviso(); setTimer(null); };

  // Los avisos se van solos. Tocarlos tambien los cierra, para quien no quiere
  // esperar: es informacion, no una decision, y nunca bloquea lo que se estaba
  // haciendo — que es toda la diferencia con el `alert()` que reemplaza.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3600);
    return () => clearTimeout(t);
  }, [aviso]);

  const weeks = useMemo(() => {
    const n = activeProgram?.weeks || 4;
    const ws = Array.from({ length: n }, (_, i) => i + 1);
    if (activeProgram?.hasDeload) ws.push("DL");
    return ws;
  }, [activeProgram?.weeks, activeProgram?.hasDeload]);

  const sessName = (id) => { const s = sessions.find((s) => s.id === id); return s ? s.name : id; };
  const activeProgSession = progSession || (sesionesVistas[0]?.id ?? "A");
  const sessionExs = useMemo(() => program.filter((e) => e.session === session).sort((a, b) => a.order - b.order), [program, session]);
  const blocks = useMemo(() => getBlocks(sessionExs), [sessionExs]);
  const block = blocks[blockIdx];

  function countDone(exercise) { let n = 0; for (let i = 1; i <= setsFor(exercise, week, deloadCfg); i++) if (isDone(logs[keyOf(week, exercise.id, i)])) n++; return n; }
  function blockDone(b) { return b.exercises.every((ex) => countDone(ex) >= setsFor(ex, week, deloadCfg)); }

  // Descanso: arranca cuando se completa la vuelta. En superserie, recién al
  // cerrar la serie N de todos los ejercicios del bloque (ese es el punto de la SS).
  function maybeStartRest(exercise, setN, logsAhora = logs) {
    // Apagado desde el Perfil: hay quien lleva el descanso con el reloj de
    // pared, o entrena en circuito y un cronometro que salta solo estorba.
    if (!prefs.descanso) return;
    // Una serie con dropset no esta cerrada hasta el ultimo escalon: entre
    // escalones NO hay descanso, ese es el punto de la tecnica. Si el timer
    // arrancara al cerrar la serie principal, sonaria justo cuando hay que
    // bajar el peso y seguir.
    const total = setsFor(exercise, week, deloadCfg);
    if (!serieCerrada(exercise, setN, total, logsAhora[keyOf(week, exercise.id, setN)])) return;
    const b = blocks.find((bl) => bl.exercises.some((e) => e.id === exercise.id));
    const mates = b && b.type === "superset" ? b.exercises : [exercise];
    const roundDone = mates.every((e) => {
      if (e.id === exercise.id) return true;
      const t = setsFor(e, week, deloadCfg);
      if (setN > t) return true;
      const l = logsAhora[keyOf(week, e.id, setN)];
      return isDone(l) && serieCerrada(e, setN, t, l);
    });
    if (!roundDone) return;
    const rest = Math.max(0, ...mates.map((e) => e.rest || 0));
    if (!rest) return;
    const d = crearDescanso(rest);
    if (!d) return;
    setTimer(d);
    // El beep se AGENDA en el grafo de audio, no se dispara con un temporizador
    // de JavaScript: los temporizadores se congelan con la pantalla apagada y el
    // grafo de audio no. Ver el encabezado de `lib/aviso.js`.
    if (prefs.sonido) {
      despertarAudio().then((listo) => { if (listo) agendarBeep(restante(d)); });
    }
  }

  function onSetChange(exercise, setN, field, val) {
    const k = keyOf(week, exercise.id, setN);
    const prev = logs[k] || {};
    setLogs((L) => {
      const p = L[k] || {};
      const next = { ...p, [field]: val };
      // Auto-mark done when has data
      next.done = isDone(next);
      return { ...L, [k]: next };
    });
    // El primer dato en REPS marca la serie como hecha → dispara el descanso.
    // Solo en la transición vacío → con dato, así editar una serie vieja no lo relanza.
    const justLogged = field === "reps" && String(val).trim() !== "" && !String(prev.reps ?? "").trim();
    if (justLogged) maybeStartRest(exercise, setN);
  }

  /**
   * Un escalon de un dropset. Vive DENTRO de la serie, no al lado: el conteo de
   * series, el tonelaje por serie y el e1RM siguen leyendo `kg`/`reps` de la
   * serie principal sin enterarse de que hay escalones.
   */
  function onPasoChange(exercise, setN, i, field, val) {
    const k = keyOf(week, exercise.id, setN);
    const p = logs[k] || {};
    const prev = pasosDeLog(p)[i] || {};
    const ps = [...pasosDeLog(p)];
    while (ps.length <= i) ps.push({});
    ps[i] = { ...ps[i], [field]: val };
    // Se arma el estado siguiente ACA y no dentro del updater: el updater corre
    // despues, asi que leerlo desde adentro para decidir el descanso miraria el
    // estado viejo.
    const siguiente = { ...logs, [k]: { ...p, pasos: ps } };
    setLogs(siguiente);
    // Mismo criterio que la serie: el primer dato en REPS lo da por hecho. El
    // descanso arranca recien cuando el ULTIMO escalon esta cargado, asi que se
    // evalua contra el estado que se acaba de escribir y no contra el viejo.
    const justLogged = field === "reps" && String(val).trim() !== "" && !String(prev.reps ?? "").trim();
    if (justLogged) maybeStartRest(exercise, setN, siguiente);
  }

  function prevWeekSummary(exercise) {
    const pw = week === "DL" ? 4 : week - 1;
    if (!pw || pw < 1) return null;
    const rows = [];
    for (let i = 1; i <= setsFor(exercise, pw, deloadCfg); i++) { const l = logs[keyOf(pw, exercise.id, i)]; if (l?.done) rows.push(l); }
    if (!rows.length) return null;
    // Los logs guardan lo que sale del input: strings. `isNum` exige un number,
    // asi que sin parsear esto daba 0 siempre y la referencia nunca aparecia.
    const best = Math.max(...rows.map((r) => {
      const kg = parseFloat(r.kg), reps = parseInt(r.reps);
      return isNum(kg) && reps ? brzycki(kg, reps) || 0 : 0;
    }));
    return { pw, rows, e1rm: best > 0 ? Math.round(best) : null };
  }

  function hasSessionData(w, sessId) {
    return program.filter((e) => e.session === sessId).some((ex) => {
      for (let i = 1; i <= setsFor(ex, w, deloadCfg); i++) if (isDone(logs[keyOf(w, ex.id, i)])) return true;
      return false;
    });
  }

  function clearSessionLogs(w, sessId) {
    setLogs((L) => {
      const next = { ...L };
      program.filter((e) => e.session === sessId).forEach((ex) => {
        for (let i = 1; i <= setsFor(ex, w, deloadCfg); i++) delete next[keyOf(w, ex.id, i)];
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

  /** Saca la marca de "sin subir" de una sesion que el servidor ya confirmo. */
  function marcarSubida(entry) {
    setHistory((H) => H.map((h) => (claveSesion(h) === claveSesion(entry) ? { ...h, pendiente: false } : h)));
  }

  function handleConfirmOk() {
    if (confirmAction === "finish") {
      const exs = program.filter((e) => e.session === session);
      const exerciseData = exs.map((exercise) => {
        const sets = [];
        for (let i = 1; i <= setsFor(exercise, week, deloadCfg); i++) {
          const l = logs[keyOf(week, exercise.id, i)];
          if (!l || !isDone(l)) continue;
          // Los escalones son parte de la serie, no series nuevas: si se
          // guardaran sueltos romperian el conteo y encadenarian e1RM distintos.
          const pasos = pasosDeLog(l).filter(pasoHecho)
            .map((p) => ({ kg: parseFloat(p.kg) || null, reps: parseInt(p.reps) || null }));
          sets.push({ setN: i, kg: parseFloat(l.kg) || null, reps: parseInt(l.reps) || null, rir: parseFloat(l.rir) || null, ...(pasos.length ? { pasos } : {}) });
        }
        return { id: exercise.id, name: exercise.name, group: exercise.group, sets, sem: semaphore(exercise, logs, week, deloadCfg) };
      });
      const entry = { id: uid(), programId: activeProgramId, week, session, sessionName: sessName(session), date: Date.now(), duration: sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : null, health: savedHealth, note: sessionNote.trim() || null, exercises: exerciseData, pendiente: conCuenta };
      // Replace existing entry for same week+session, or add new
      setHistory((H) => {
        const existing = H.findIndex((h) => h.week === week && h.session === session);
        if (existing >= 0) { const next = [...H]; next[existing] = entry; return next; }
        return [entry, ...H];
      });

      // Push al cerrar la sesion. Deliberadamente sin await: la sesion ya quedo
      // guardada en local y el usuario tiene que poder salir de la pantalla
      // aunque en el gimnasio no haya senal.
      if (signedIn && activeProgram) {
        setSyncState("Subiendo…");
        pushSession({ program: activeProgram, entry, catalog }).then((r) => {
          marcarRed(r.ok || r.motivo !== "sin-red");
          setSyncState(r.ok
            ? `Última subida: ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
            : r.motivo === "sin-red"
              ? "Sin conexión: quedó guardado local, se sube la próxima vez."
              : "No se pudo subir. Queda guardado local.");
          // Se desmarca SOLO si el servidor confirmo. El push es fire-and-forget
          // a proposito —hay que poder salir de la pantalla sin señal— y por eso
          // mismo puede morir sin avisar si el telefono se bloquea justo despues.
          if (r.ok) marcarSubida(entry);
        });
      }
    }
    // Terminar la sesion SI cancela el descanso, y ademas apaga el beep que
    // quedo agendado en el grafo de audio: sin esto sonaba en el vestuario.
    setSession(null); cerrarDescanso(); setSessionStart(null); setSavedHealth(null);
    setSessionNote("");
    setConfirmAction(null);
  }

  /**
   * Datos de un ejercicio que ya no esta en el programa (lo sustituyeron o lo
   * borraron). El historial guarda el nombre con el que se entreno, asi que sus
   * series siguen siendo atribuibles.
   */
  const exercisesFueraDelPrograma = useMemo(() => {
    const enPrograma = new Set(program.map((e) => e.id));
    const fuera = new Map();
    for (const h of history) {
      for (const ex of h.exercises || []) {
        if (enPrograma.has(ex.id) || fuera.has(ex.id)) continue;
        fuera.set(ex.id, { id: ex.id, name: ex.name, group: ex.group, session: h.session, unit: "reps", retirado: true });
      }
    }
    return fuera;
  }, [program, history]);

  const metrics = useMemo(() => {
    const tonnage = {}; const e1rms = {};
    for (const [k, l] of Object.entries(logs)) {
      if (!l.done) continue; const [w, exId] = k.split("|");
      // Un ejercicio sustituido o borrado sale del programa, pero sus series se
      // hicieron igual: si se descartaran, el tonelaje de una semana ya
      // entrenada bajaria retroactivamente. Se busca primero en el programa y
      // despues entre los retirados, que salen del historial.
      const exercise = program.find((e) => e.id === exId) || exercisesFueraDelPrograma.get(exId);
      if (!exercise || exercise.unit === "pasos") continue;
      // Mismo motivo que en prevWeekSummary: `logs` guarda strings. Sin parsear,
      // `isNum` era false para todo y la pantalla de Progreso quedaba vacia
      // aunque hubiera series cargadas. "BW" da NaN y queda fuera del tonelaje,
      // que es lo correcto: no hay carga externa que sumar.
      // Los escalones de un dropset SUMAN al tonelaje —es trabajo real que
      // antes no se contaba— pero NO alimentan el e1RM, que sale solo de la
      // serie principal.
      //
      // No es una precaucion abstracta: con las refs reales de este programa,
      // el gemelo sentado (50x15 = 81.8) queda por debajo de su propio
      // descuelgue a 38.8kg en cuanto pasa de 20 reps, y a 25 reps daria 116
      // — un +42% que se leeria como una mejora enorme de fuerza sin que haya
      // pasado nada. Brzycki pierde precision arriba de ~12 reps, y un
      // descuelgue al fallo con 22% menos peso vive justamente ahi.
      //
      // Importa mas de lo que parece: el semaforo y las reglas de progresion
      // leen este numero para decidir si subir carga.
      const kg = parseFloat(l.kg), reps = parseInt(l.reps);
      if (isNum(kg) && reps) {
        const e1 = brzycki(kg, reps);
        if (e1) { e1rms[exId] = e1rms[exId] || {}; e1rms[exId][w] = Math.max(e1rms[exId][w] || 0, e1); }
      }
      for (const c of [l, ...pasosDeLog(l)]) {
        const k = parseFloat(c?.kg), r = parseInt(c?.reps);
        if (isNum(k) && r) tonnage[w] = (tonnage[w] || 0) + k * r;
      }
    }
    return { tonnage, e1rms };
  }, [logs, program, exercisesFueraDelPrograma]);

  /**
   * Filas de la tabla de e1RM: los del programa primero, y despues los
   * retirados, marcados. Se recorren las metricas y no el programa — al reves
   * de como estaba, que hacia desaparecer de la pantalla a todo ejercicio que
   * saliera del programa, con sus semanas ya entrenadas incluidas.
   */
  const filasE1rm = useMemo(() => {
    const enPrograma = program.filter((e) => metrics.e1rms[e.id]);
    const retirados = [...exercisesFueraDelPrograma.values()].filter((e) => metrics.e1rms[e.id]);
    return [...enPrograma, ...retirados];
  }, [program, metrics, exercisesFueraDelPrograma]);

  /**
   * El programa puede marcar una semana y sesion como test de maximos — en el
   * Ciclo 2 es "Semana 4, Sesion C = Test de maximos para evaluar progresion
   * del ciclo". Es una sesion que no se autorregula: se va a buscar el tope.
   */
  const esSemanaDeTest = (w) => Boolean(activeProgram?.maxTest) && String(activeProgram.maxTest.week) === String(w);
  const esSesionDeTest = (w, sessId) => esSemanaDeTest(w) && activeProgram.maxTest.session === sessId;

  /** Alta en el catalogo desde el editor, sin salir a otra pantalla. */
  function crearEjercicio(nombre) {
    const { catalog: nuevo, entrada } = agregarAlCatalogo(catalog, { name: nombre, group: null, unit: "reps" });
    setCatalog(nuevo);
    return entrada;
  }

  /**
   * Si el ejercicio que se esta editando ya tiene series registradas y se le
   * cambio la referencia del catalogo, devuelve el nombre con el que se
   * entreno. Es lo que permite avisar que esto es una sustitucion y no una
   * correccion de nombre.
   */
  function nombreSustituido(draft) {
    const original = programaVisto?.exercises?.find((e) => e.id === draft.id);
    if (!original?.exerciseId || original.exerciseId === draft.exerciseId) return null;

    if (!tieneSeriesRegistradas(draft.id, logs, history)) return null;

    return buscarEnCatalogo(catalog, original.exerciseId)?.name || original.name;
  }

  /**
   * Guarda el ejercicio del programa.
   *
   * Si se cambio el ejercicio del catalogo y ya habia series registradas, esto
   * es una SUSTITUCION y no una edicion: entra como un ejercicio nuevo, con id
   * propio, y el anterior sale del programa. Los logs viejos siguen colgando
   * del id viejo, asi que su historial y su e1RM quedan separados — encadenar
   * las series de dos maquinas distintas es exactamente contra lo que advierte
   * el SEED ("su e1RM arranca como serie nueva, no continua la del belt squat").
   *
   * Cambiar el ejercicio SIN series registradas es corregir lo que se cargo mal:
   * ahi se edita en el lugar y no se parte nada.
   */
  function saveExercise(draft, despuesDe) {
    const esSustitucion = Boolean(nombreSustituido(draft));
    // Mudarlo lo saca de la pantalla que se esta mirando. Sin decirlo, guardar
    // se ve igual que borrarlo — y ademas hay que decir lo que NO pasa: el
    // ejercicio conserva su id, asi que las series y el e1RM se van con el.
    const original = ejerciciosVistos.find((e) => e.id === draft.id);
    if (original && original.session !== draft.session && !esSustitucion) {
      const dia = sesionesVistas.find((s) => s.id === draft.session);
      setAviso(`"${draft.name}" pasó a ${dia?.name || draft.session}. Sus series registradas van con él.`);
    }
    setProgram((P) => {
      const antes = P.find((e) => e.id === draft.id);
      // Mudarse de dia rompe toda superserie: agrupa ejercicios que se hacen uno
      // atras del otro, y en otro dia no hay tal cosa. Se suelta la del que se
      // va y la de quien lo apuntaba, en los dos sentidos.
      const cambioDeDia = Boolean(antes) && antes.session !== draft.session;
      let ex = cambioDeDia ? { ...draft, superset: null } : draft;
      let lista;
      if (esSustitucion) {
        ex = { ...ex, id: uid() };
        lista = P
          .map((e) => (e.superset === draft.id ? { ...e, superset: cambioDeDia ? null : ex.id } : e))
          .map((e) => (e.id === draft.id ? ex : e));
      } else {
        const exists = P.some((e) => e.id === draft.id);
        lista = exists ? P.map((e) => (e.id === draft.id ? ex : e)) : [...P, ex];
        if (cambioDeDia) lista = lista.map((e) => (e.superset === ex.id && e.id !== ex.id ? { ...e, superset: null } : e));
      }
      return reubicar(lista, ex, despuesDe);
    });
    setEditing(null);
  }
  function deleteExercise(id) { setProgram((P) => P.filter((e) => e.id !== id).map((e) => (e.superset === id ? { ...e, superset: null } : e))); setEditing(null); }

  /**
   * Guarda los metadatos del programa.
   *
   * "Para quien es" no vive en el localStorage sino en el servidor, porque es lo
   * que decide como se agrupa el programa en TODOS los dispositivos y lo que la
   * seccion de entrenador necesita saber. Se manda aparte y sin bloquear: si no
   * hay senal, el resto de la edicion se guarda igual.
   */
  async function guardarPrograma(draft) {
    const antes = programaVisto?.paraAlumnos ?? false;
    const id = programaVisto?.id;
    updateProgramaVisto({
      name: draft.name, weeks: draft.weeks, hasDeload: draft.hasDeload,
      deload: { ...DELOAD_DEFAULT, ...draft.deload },
      maxTest: draft.maxTest || null,
      paraAlumnos: draft.paraAlumnos ?? false,
    });
    setEditingProgram(null);

    if (signedIn && (draft.paraAlumnos ?? false) !== antes) {
      const r = await marcarParaAlumnos(id, draft.paraAlumnos ?? false);
      if (!r.ok) {
        // Se revierte en pantalla: dejarlo marcado de un lado y no del otro es
        // peor que no haberlo marcado.
        updateProgramaVisto({ paraAlumnos: antes });
        setSyncState(r.error || "No se pudo cambiar para quién es el programa.");
      }
    }
  }

  /**
   * El boton "atras" de Android.
   *
   * Una PWA instalada no tiene barra de navegacion: el unico atras es el del
   * sistema, y por defecto se sale de la app de una. Estando a mitad de un
   * entrenamiento eso es perder la sesion por un gesto reflejo.
   *
   * Se apila un estado en el historial y se retrocede POR DENTRO: primero se
   * cierran las pantallas superpuestas, despues se vuelve a Entrenar, y recien
   * ahi el atras pregunta si se quiere salir. La confirmacion dura unos
   * segundos: si se aprieta atras de nuevo mientras esta en pantalla, se sale.
   */
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const salidaRef = useRef(false);
  salidaRef.current = confirmarSalida;

  useEffect(() => {
    if (!loaded) return;
    const marcar = () => window.history.pushState({ forge: true }, "");
    marcar();

    const alVolver = () => {
      // Cada rama consume el gesto y vuelve a apilar, asi que el historial no
      // se agota mientras haya algo hacia donde retroceder adentro.
      const quedarse = () => marcar();

      // De la mas superpuesta a la menos. La ficha de descripcion y la
      // confirmacion se dibujan ARRIBA de todo, asi que son las primeras en
      // cerrarse: si no, el atras movia la app de abajo y la caja se quedaba
      // flotando encima de otra pantalla.
      // La confirmacion de borrado se dibuja sobre los editores, asi que va
      // primera: el atras tiene que cancelarla a ella, no cerrar lo de abajo.
      if (confirmarBorradoRef.current) { setConfirmarBorrado(null); return quedarse(); }
      // El desplegable de dias no tapa la pantalla, pero esta ABIERTO: el atras
      // tiene que cerrarlo a el antes de mover nada de abajo.
      if (verDiasRef.current) { setVerDias(false); return quedarse(); }
      if (descModalRef.current) { setDescModal(null); return quedarse(); }
      if (confirmActionRef.current) { setConfirmAction(null); return quedarse(); }
      if (editingRef.current) { setEditing(null); return quedarse(); }
      if (editingProgramRef.current) { setEditingProgram(null); return quedarse(); }
      if (editingSessionsRef.current) { setEditingSessions(false); return quedarse(); }
      if (importWizardRef.current) { setImportWizard(null); return quedarse(); }
      if (showMedidasRef.current) { setShowMedidas(false); return quedarse(); }
      if (showAsistenciaRef.current) { setShowAsistencia(false); return quedarse(); }
      if (showProfileRef.current) { setShowProfile(false); return quedarse(); }
      // Mitad de un entrenamiento: el atras pide confirmacion como el boton de
      // salir de la pantalla, no descarta nada en silencio.
      if (sessionRef.current !== null) { setConfirmAction("exit"); return quedarse(); }
      // El detalle de un programa esta un nivel ADENTRO de la lista, asi que el
      // atras vuelve a la lista y no salta a Entrenar: se entro por ahi, y
      // saltarse ese nivel obliga a rehacer el camino entero para mirar el
      // programa siguiente. Sin programas la lista ya es lo unico que hay.
      if (tabRef.current === "programa" && !programListViewRef.current && programsRef.current.length > 0) {
        setProgramListView(true); return quedarse();
      }
      if (tabRef.current !== "entrenar") { setTab("entrenar"); return quedarse(); }

      // Ya en Entrenar: el primer atras avisa, el segundo sale.
      if (salidaRef.current) return;   // no se re-apila: el gesto sale de la app
      setConfirmarSalida(true);
      setTimeout(() => setConfirmarSalida(false), 2500);
      quedarse();
    };

    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, [loaded]);

  // Sin programas, la pestaña Programa SIEMPRE muestra la lista: el detalle de
  // un programa que no existe es una pantalla en blanco donde deberia estar el
  // primer paso.
  const verListaDeProgramas = programListView || programs.length === 0;

  // Entrenamientos cerrados que el servidor todavia no confirmo. El push al
  // terminar es fire-and-forget y puede morir sin dejar rastro —el telefono se
  // bloquea, la app pasa a segundo plano— asi que el unico aviso posible es
  // este. Antes el error existia y se mostraba en Perfil, una pantalla que
  // nadie mira al salir del gimnasio.
  const sinSubir = history.filter((h) => h.pendiente);

  /**
   * Cuantas sesiones tiene hecha cada semana, y si ya esta cerrada.
   *
   * Los indicadores NO esperan a que la semana termine: se actualizan serie por
   * serie. Por eso una semana a medias se ve como un derrumbe al lado de las
   * completas — no muestra menos rendimiento, muestra menos semana. Esto es lo
   * que permite decirlo en pantalla en vez de que haya que deducirlo.
   */
  const semanasHechas = useMemo(() => {
    const porSemana = {};
    for (const h of history) {
      if (h.programId && h.programId !== activeProgramId) continue;
      const w = String(h.week);
      (porSemana[w] ||= new Set()).add(h.session);
    }
    const total = sessions.length || 1;
    return Object.fromEntries(
      Object.entries(porSemana).map(([w, ss]) => [w, { hechas: ss.size, total, cerrada: ss.size >= total }]),
    );
  }, [history, activeProgramId, sessions.length]);

  /** La semana que se esta entrenando: la mas avanzada sin cerrar. */
  const semanaEnCurso = useMemo(() => {
    const abierta = weeks.find((w) => semanasHechas[String(w)] && !semanasHechas[String(w)].cerrada);
    return abierta === undefined ? null : abierta;
  }, [weeks, semanasHechas]);

  /**
   * Al entrar, la semana que toca — no siempre la 1.
   *
   * Arrancar siempre en la primera es un riesgo real: en la semana 3 uno abre
   * la app, ve la semana 1 completa y registra encima de lo que ya entreno.
   * Se elige la primera sin terminar; si estan todas cerradas, la ultima.
   * Solo al abrir: una vez que el usuario toca un chip, manda el.
   */
  const semanaElegida = useRef(false);
  useEffect(() => {
    if (!loaded || semanaElegida.current || !weeks.length) return;
    if (!Object.keys(semanasHechas).length) return;   // todavia no hay historial
    semanaElegida.current = true;
    const pendiente = weeks.find((w) => !semanasHechas[String(w)]?.cerrada);
    setWeek(pendiente === undefined ? weeks[weeks.length - 1] : pendiente);
  }, [loaded, weeks, semanasHechas]);

  /**
   * Bienestar: los tres numeros que la app pide antes de cada sesion.
   *
   * Se venian preguntando todos los dias y solo se veian dentro del detalle de
   * una sesion suelta, que es el unico lugar donde no significan nada. El
   * tonelaje de ese dia sale del historial y no de `logs`, para que cada punto
   * corresponda a la sesion que se estaba respondiendo.
   */
  const datosBienestar = useMemo(() => {
    const tonelajeDe = (h) => tonelajeSesion(h) || null;
    const propias = history.filter((h) => !h.programId || h.programId === activeProgramId);
    return bienestar(propias, tonelajeDe);
  }, [history, activeProgramId]);

  /**
   * Tonelaje por grupo muscular y semana.
   *
   * El total semanal dice cuanto se movio; este dice DONDE. Es lo que permite
   * ver que un grupo se quedo atras mientras el total sube — que es justo lo
   * que el total esconde. Sale de la planilla, que lo tenia y la app no.
   */
  const tonelajePorGrupo = useMemo(() => {
    const out = {};
    for (const [k, l] of Object.entries(logs)) {
      if (!l.done) continue;
      const [w, exId] = k.split("|");
      const ex = program.find((e) => e.id === exId) || exercisesFueraDelPrograma.get(exId);
      if (!ex || ex.unit === "pasos") continue;
      const g = ex.group || "Sin grupo";
      for (const c of [l, ...pasosDeLog(l)]) {
        const kg = parseFloat(c?.kg), reps = parseInt(c?.reps);
        if (!isNum(kg) || !reps) continue;
        (out[g] ||= {})[w] = ((out[g] || {})[w] || 0) + kg * reps;
      }
    }
    return out;
  }, [logs, program, exercisesFueraDelPrograma]);

  // Blocks for Programa tab (must be before early return)
  const progBlocks = useMemo(() => getBlocks(ejerciciosVistos.filter((e) => e.session === activeProgSession)), [ejerciciosVistos, activeProgSession]);

  if (!loaded) return <div style={{ background: "#F2F2F7", minHeight: "100vh" }} />;

  if (showAsistencia) {
    return (
      <div className="forge">
        <style>{CSS}</style>
        <div className="phone"><AsistenciaScreen onClose={() => setShowAsistencia(false)} /></div>
      </div>
    );
  }

  // Medidas tapa la app entera igual que el Perfil: es una tarea larga y
  // sentada, no algo que se consulte entre series.
  if (showMedidas) {
    return (
      <div className="forge">
        <style>{CSS}</style>
        <div className="phone"><MedidasScreen onClose={() => setShowMedidas(false)} /></div>
      </div>
    );
  }

  // El perfil tapa la app entera (sin tabbar): se sale con "Volver".
  if (showProfile) {
    return (
      <div className="forge">
        <style>{CSS}</style>
        <div className="phone">
          <ProfileScreen
            perfilLocal={perfilLocal}
            hayRed={hayRed}
            onClose={() => setShowProfile(false)}
            syncState={syncState}
            onSync={sincronizar}
            syncing={syncing}
            prefs={prefs}
            onPrefs={(cambio) => setPrefs((p) => ({ ...p, ...cambio }))}
            onCerrarSesion={cerrarSesion}
            onVerMedidas={() => { setShowProfile(false); setShowMedidas(true); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="forge">
      <style>{CSS}</style>
      <div className="phone">

        {/* Cuenta: se esconde durante el entrenamiento activo, que usa toda la pantalla */}
        {!(tab === "entrenar" && session !== null) && (
          <>
            <AccountButton onOpenProfile={() => setShowProfile(true)} perfilLocal={perfilLocal} />
            <AvisoInvitacion />
          </>
        )}

        {/* ======== HEALTH CHECK ======== */}
        {tab === "entrenar" && session !== null && healthCheck && (
          <div className="screen">
            <header className="top"><div className="brand">FORGE</div><h1>¿Cómo te sentís hoy?</h1><p className="sub">{weekLabel(week)} · {sessName(session)}</p></header>
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
            <header className="top"><div className="brand">FORGE</div><h1>Entrenar</h1><p className="sub">{activeProgram?.name || "Sin programa"}</p></header>

            {!hayRed && (
              <div className="sinred">
                <strong>Sin conexión</strong>
                <p>Podés entrenar igual. Lo que registres se sube solo cuando vuelva la señal.</p>
              </div>
            )}

            {sinSubir.length > 0 && (
              <div className="sinsubir">
                <div>
                  <strong>{sinSubir.length} entrenamiento{sinSubir.length === 1 ? "" : "s"} sin subir</strong>
                  <p>Está{sinSubir.length === 1 ? "" : "n"} guardado{sinSubir.length === 1 ? "" : "s"} en este teléfono. Si no sube, no lo ve tu entrenador ni aparece en otro dispositivo.</p>
                </div>
                <button className="sinsubir-btn" onClick={sincronizar} disabled={syncing}>
                  {syncing ? "Subiendo…" : "Subir ahora"}
                </button>
              </div>
            )}

            {/* Sin programa no hay nada que entrenar: un selector de semanas y
                sesiones vacias parece una app rota, no una cuenta nueva. */}
            {!activeProgram && (
              <div className="vacio-card">
                <p className="vacio-t">Primero necesitás un programa</p>
                <p className="vacio-p">Elegí uno en la pestaña Programa, o pedile a tu entrenador que te asigne el suyo.</p>
                <button className="btn-secondary" onClick={() => { setTab("programa"); setProgramListView(true); }}>Ir a Programa</button>
              </div>
            )}

            {/* Ya hay programa y todavia no hay ni una sesion registrada: el
                unico momento en que conviene contar el circuito entero. Se
                descarta con un toque y no vuelve — y como se descarta guardando
                una preferencia, tampoco vuelve en el otro dispositivo. */}
            {activeProgram && history.length === 0 && prefs.primerosPasos && (
              <div className="vacio-card primeros">
                <p className="vacio-t">Cómo funciona</p>
                <ol className="pasos">
                  <li>Elegí la <b>semana</b> y tocá una <b>sesión</b>.</li>
                  <li>Respondé cómo llegaste (sueño, estrés, energía). Queda registrado y después se cruza con lo que moviste.</li>
                  <li>Cargá <b>KG</b>, <b>REPS</b> y <b>RIR</b> de cada serie. Con escribir las reps la serie ya cuenta como hecha.</li>
                  <li>El <b>descanso arranca solo</b> al cerrar la última serie del bloque, y sigue corriendo aunque cambies de pestaña.</li>
                  <li>Al final, <b>Terminar</b>: va al historial y se sube.</li>
                </ol>
                <button className="btn-secondary" onClick={() => setPrefs((p) => ({ ...p, primerosPasos: false }))}>Entendido</button>
              </div>
            )}

            {activeProgram && <>
            <div className="weekchips">
              {/* Una semana completa se distingue de una por entrenar: el riesgo
                  no es no encontrarla, es registrar encima de una vieja. */}
              {weeks.map((w) => {
                const est = semanasHechas[String(w)];
                return (
                  <button key={w} className={`chip ${week === w ? "on" : ""} ${w === "DL" ? "dl" : ""} ${est?.cerrada ? "hecha" : est ? "parcial" : ""}`}
                    onClick={() => setWeek(w)}
                    title={est ? `${est.hechas} de ${est.total} sesiones` : "sin entrenar"}>
                    {w === "DL" ? "Deload" : `S${w}`}
                    {est?.cerrada && <span className="chip-ok">✓</span>}
                    {est && !est.cerrada && <span className="chip-n">{est.hechas}/{est.total}</span>}
                  </button>
                );
              })}
            </div>
            {week === "DL" && (
              <div className="dlnote">
                Deload: {deloadCfg.method === "reps"
                  ? `reps al ${100 - deloadCfg.pct}%, mismas series`
                  : `series al ${100 - deloadCfg.pct}% (mínimo ${deloadCfg.minSets})`}, misma intensidad
              </div>
            )}
            {esSemanaDeTest(week) && (
              <div className="testnote">
                Semana de test de máximos en la sesión {activeProgram.maxTest.session}: cierra el ciclo
                y define las referencias del próximo. No la uses para autorregular.
              </div>
            )}
            <div className="sessioncards">
              {sessions.map((sess) => {
                const exs = program.filter((e) => e.session === sess.id);
                const groups = [...new Set(exs.map((e) => e.group))].slice(0, 3).join(" · ");
                const total = exs.reduce((a, e) => a + setsFor(e, week, deloadCfg), 0);
                const done = exs.reduce((a, e) => { let n = 0; for (let i = 1; i <= setsFor(e, week, deloadCfg); i++) if (logs[keyOf(week, e.id, i)]?.done) n++; return a + n; }, 0);
                const allDone = done === total && total > 0;
                return (
                  <button key={sess.id} className={`scard ${allDone ? "completed" : ""}`} onClick={() => startSession(sess.id)}>
                    <div className="sletter">{sess.id}</div>
                    <div className="sinfo"><div className="sname">{sess.name}{esSesionDeTest(week, sess.id) && <span className="testbadge">test</span>}</div><div className="sgroups">{groups}</div><div className="sbar"><div style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} /></div></div>
                    <div className="sright"><span className="spct mono">{allDone ? "Done" : `${done}/${total}`}</span></div>
                  </button>
                );
              })}
            </div>
            </>}
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
              <div key={ex.id} className={`excard ${defDe(ex) ? "con-tec" : ""} ${block.type === "superset" ? "ss-grouped" : ""} ${exI === 0 && block.type === "superset" ? "ss-first" : ""} ${exI === block.exercises.length - 1 && block.type === "superset" ? "ss-last" : ""}`}>
                <div className="excard-head">
                  <div>
                    <div className="eyebrow">{ex.group}{block.type === "superset" && <span className="ss-idx"> · {exI + 1}/{block.exercises.length}</span>}</div>
                    <h2 className={ex.description ? "has-desc" : ""} onClick={() => ex.description && setDescModal(ex)}>{ex.name}{ex.description ? <span className="desc-hint">i</span> : null}</h2>
                    {(() => { const t = defDe(ex); return t ? <span className="tecchip">{t.icono} {t.nombre}{t.pasos > 1 ? ` ×${t.pasos}` : ""}</span> : null; })()}
                  </div>
                  {(() => { const pv = prevWeekSummary(ex); return pv?.e1rm ? <span className="pv-mini mono" title={weekLabel(pv.pw)}>e1RM {pv.e1rm}</span> : null; })()}
                </div>
                <div className="refline mono">
                  Ref: {refLine(ex, week, deloadCfg)}{ex.tempo ? <><span className="sep">|</span> T {ex.tempo}</> : null}<span className="sep">|</span> D {fmtRest(ex.rest)}{ex.rir ? <><span className="sep">|</span> RIR {ex.rir}</> : null}
                </div>
                {/* Cuatro abreviaturas en una linea de doce puntos. Es la
                    prescripcion entera del ejercicio y hasta ahora no habia
                    ninguna pantalla que dijera que significan. Va solo en el
                    primer ejercicio del bloque: repetirla en cada tarjeta la
                    convierte en ruido. */}
                {exI === 0 && (
                  <Ayuda titulo="Qué dice esta línea" mostrar={prefs.ayudas}>
                    <p><b>Ref</b> — el peso de referencia por el rango de repeticiones que toca. Es una sugerencia, no una orden: el semáforo la corrige con lo que hagas.</p>
                    {ex.tempo && <p><b>T</b> — tempo, en segundos por fase: bajada · pausa abajo · subida · pausa arriba. <span className="mono">2-0-1-0</span> es bajar en dos, subir en uno, sin pausas.</p>}
                    <p><b>D</b> — el descanso hasta la serie siguiente.</p>
                    {ex.rir && <p><b>RIR</b> — repeticiones en reserva: cuántas te <em>sobraban</em> al cortar. RIR 2 es terminar pudiendo hacer dos más. Es como se mide el esfuerzo sin ir al fallo.</p>}
                  </Ayuda>
                )}

                {(() => { const t = defDe(ex); return t ? <p className="tec-ayuda">{t.ayuda}</p> : null; })()}

                <div className="sets">
                  <div className="setshead"><span></span><span>{ex.refKg === "BW" ? "+KG" : "KG"}</span><span>{ex.unit === "pasos" ? "PASOS" : "REPS"}</span><span>RIR</span></div>
                  {Array.from({ length: setsFor(ex, week, deloadCfg) }, (_, i) => i + 1).map((n) => (
                    <ExSetRow key={n} ex={ex} n={n} week={week} logs={logs} onSetChange={onSetChange}
                      onPasoChange={onPasoChange} deload={deloadCfg} totalSets={setsFor(ex, week, deloadCfg)} />
                  ))}
                </div>

                {(() => {
                  let best = 0;
                  for (let i = 1; i <= setsFor(ex, week, deloadCfg); i++) {
                    const l = logs[keyOf(week, ex.id, i)];
                    if (!isDone(l)) continue;
                    // Solo la serie principal, igual que en Progreso: un
                    // descuelgue con menos peso y muchas reps infla el Brzycki.
                    if (isNum(parseFloat(l.kg)) && parseInt(l.reps)) best = Math.max(best, brzycki(parseFloat(l.kg), parseInt(l.reps)) || 0);
                  }
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
        {tab === "programa" && verListaDeProgramas && (
          <div className="screen">
            {/* Tocar uno lo ABRE, no lo activa. El activo gobierna Entrenar,
                Historial y Progreso: cambiarlo de rutina a alguien porque
                entro a mirar que tenia el programa de un alumno es justo lo
                que no puede pasar. Se activa entrenandolo, que es explicito. */}
            <header className="top"><div className="brand">FORGE</div><h1>Programas</h1>
              <p className="sub">{programs.length > 1 ? "Tocá uno para verlo" : `${programs.length} programa${programs.length !== 1 ? "s" : ""}`}</p>
            </header>

            {/* Cuenta nueva. Lo primero que ofrece es sincronizar, no crear: si
                alguien la invito como alumna, su programa ya existe del otro
                lado y crear uno propio seria empezar por el lado equivocado. */}
            {programs.length === 0 && (
              <div className="vacio-card">
                <p className="vacio-t">Todavía no tenés ningún programa</p>
                {signedIn ? (
                  <>
                    <p className="vacio-p">
                      Si tu entrenador te asignó uno, aparece acá al sincronizar.
                    </p>
                    <button className="btn-secondary" onClick={sincronizar} disabled={syncing}>
                      {syncing ? "Sincronizando…" : "Buscar mi programa"}
                    </button>
                    {syncState && <p className="vacio-p">{syncState}</p>}
                  </>
                ) : (
                  <p className="vacio-p">
                    Entrá con tu cuenta para recibir el programa de tu entrenador,
                    o armá uno acá abajo.
                  </p>
                )}
              </div>
            )}
            {/* Los grupos se derivan, no hay un campo "tipo de programa": uno
                puede ser propio hoy y estar asignado manana sin cambiar de
                naturaleza. Con un solo grupo no se muestran encabezados. */}
            {/* Los grupos se pliegan. Con uno solo no hay nada que ordenar y no
                se dibujan encabezados; con tres —los mios, los de mis alumnos,
                el de mi entrenador— la lista es de tres cosas distintas y se
                busca en la de uno. Arranca abierto el que tiene el programa que
                se esta entrenando: es el que se vino a buscar. */}
            {gruposDeProgramas.map(({ titulo, ayuda, lista }) => {
              const solo = gruposDeProgramas.length === 1;
              const abierto = solo || (gruposCerrados[titulo] === undefined
                ? lista.some((p) => p.id === activeProgramId)
                : !gruposCerrados[titulo]);
              return (
              <div key={titulo} className="prog-grupo">
                {!solo && (
                  <button className="prog-grupo-head" aria-expanded={abierto}
                    onClick={() => setGruposCerrados((g) => ({ ...g, [titulo]: abierto }))}>
                    <span className="prog-grupo-flecha" aria-hidden="true">{abierto ? "▾" : "▸"}</span>
                    <span className="prog-grupo-t">{titulo}</span>
                    <span className="prog-grupo-n">{lista.length}</span>
                    {!abierto && lista.some((p) => p.id === activeProgramId) && <span className="prog-grupo-act">activo</span>}
                  </button>
                )}
                {ayuda && !solo && abierto && <p className="prog-grupo-ayuda">{ayuda}</p>}
                {/* No se renderiza cuando esta cerrado, en vez de `hidden`: el
                    atributo pone `display: none` con la especificidad del
                    navegador y `.prog-list` lo pisa con su `display: flex` —
                    los grupos se veian "cerrados" con todo a la vista. */}
                {abierto && <div className="prog-list">
                  {lista.map((p) => (
                    <button key={p.id} className={`prog-card ${p.id === activeProgramId ? "active" : ""}`} onClick={() => { setVistoId(p.id); setProgSession(null); setProgramListView(false); }}>
                      <div className="prog-card-main">
                        <div className="prog-card-name">{p.name}</div>
                        <div className="prog-card-meta">{p.sessions.length} {p.sessions.length === 1 ? "sesión" : "sesiones"} · {p.exercises.length} ejercicio{p.exercises.length === 1 ? "" : "s"} · {p.weeks} sem{p.hasDeload ? " + deload" : ""}</div>
                      </div>
                      {p.id === activeProgramId && <span className="prog-active-badge">Activo</span>}
                    </button>
                  ))}
                </div>}
              </div>
              );
            })}
            <button className="addbtn" onClick={() => {
              const id = uid();
              setPrograms((ps) => [...ps, { id, name: "Nuevo programa", weeks: 4, hasDeload: true, sessions: [{ id: "A", name: "Sesión A" }], exercises: [], status: "draft", createdAt: Date.now() }]);
              abrirProgramaNuevo(id);
            }}>+ Crear programa</button>
            <button className="addbtn" style={{ marginTop: 8 }} onClick={() => {
              const basico = crearProgramaBasico(uid);
              setPrograms((ps) => [...ps, basico]);
              abrirProgramaNuevo(basico.id);
            }}>+ Fullbody 3x básico</button>
            <button className="addbtn import-btn" style={{ marginTop: 8 }} onClick={() => setImportWizard({ step: 1 })}>+ Importar Excel</button>
          </div>
        )}

        {/* ======== PROGRAMA — ACTIVE PROGRAM DETAIL ======== */}
        {tab === "programa" && !verListaDeProgramas && (
          <div className="screen">
            <header className="top">
              <div className="brand">FORGE</div>
              <div className="prog-header-row">
                {/* EL TITULO es el selector. Primero fue un hamburguesa suelto
                    —que en una app significa "el menu de la app"— y despues un
                    boton rotulado al lado del titulo; ese boton le disputaba el
                    ancho justo a lo unico que la pantalla existe para mostrar,
                    y con el avatar de cuenta reservando 46px arriba a la derecha
                    quedaba flotando contra el segundo renglon del nombre.

                    Tocar el nombre para cambiar de programa es el patron de
                    mobile, no cuesta ancho, y el ▾ es lo que lo delata. */}
                <h1 className="prog-titulo">
                  <button className="prog-switch-btn" aria-haspopup="true" onClick={() => setProgramListView(true)}>
                    {programaVisto?.name || "Programa"}
                    <span className="prog-titulo-chevron" aria-hidden="true">▾</span>
                  </button>
                </h1>
              </div>
              <p className="sub">{esAsignadoVisto && <span className="prog-coach">de {programaVisto.coachName}</span>}{programaVisto?.weeks || 4} sem{programaVisto?.hasDeload ? " + deload" : ""} · {sesionesVistas.length} {sesionesVistas.length === 1 ? "sesión" : "sesiones"} · {ejerciciosVistos.length} ejercicio{ejerciciosVistos.length === 1 ? "" : "s"}</p>
            </header>
            {/* Estas mirando uno que NO es el que entrenas. Se dice arriba de
                todo y con el nombre del otro: sin eso, la unica diferencia
                entre revisar el programa de un alumno y haberse cambiado de
                rutina es un badge en la pantalla anterior. */}
            {!esElActivo && (
              <div className="prog-revisando">
                <p className="prog-revisando-t">
                  {esDeAlumnosVisto
                    ? "Este programa es para tus alumnos. Lo estás revisando."
                    : "Lo estás revisando."}
                  {activeProgram && <> Seguís entrenando <b>{activeProgram.name}</b>.</>}
                </p>
                <button className="prog-activar-btn" onClick={() => activarPrograma(programaVisto)}>
                  {esDeAlumnosVisto ? "Entrenarlo yo" : "Entrenar este"}
                </button>
              </div>
            )}
            {/* Los dias con cuantos ejercicios tiene cada uno. El numero estaba
                —el editor de sesiones lo muestra— pero no donde se elige. */}
            {/* Los dias, en UN selector. Como chips entraba uno por fila —los
                nombres de verdad son "Volumen & Tempo", "Moderada & Variación"—
                y tres dias se comian media pantalla antes del primer ejercicio;
                en una linea deslizable el tercero quedaba fuera de la vista, que
                es lo mismo que no estar. Desplegado se leen los tres enteros,
                con cuantos ejercicios tiene cada uno. */}
            <div className="dia-sel">
              <button className="dia-sel-btn" aria-haspopup="listbox" aria-expanded={verDias} onClick={() => setVerDias((v) => !v)}>
                <span className="dia-sel-lbl">Día</span>
                <span className="dia-sel-nombre">{sesionesVistas.find((s) => s.id === activeProgSession)?.name || activeProgSession}</span>
                <span className="dia-sel-n mono">{progBlocks.reduce((n, b) => n + b.exercises.length, 0)} ej.</span>
                <span className="dia-sel-chevron" aria-hidden="true">{verDias ? "▴" : "▾"}</span>
              </button>
              {verDias && (
                <>
                  {/* Tocar afuera cierra. Sin esto la unica salida es volver a
                      tocar el selector, que en un telefono nadie prueba. */}
                  <button className="dia-backdrop" aria-label="Cerrar" onClick={() => setVerDias(false)} />
                  <div className="dia-menu" role="listbox">
                    {sesionesVistas.map((s) => {
                      const n = ejerciciosVistos.filter((e) => e.session === s.id).length;
                      const elegido = activeProgSession === s.id;
                      return (
                        <button key={s.id} role="option" aria-selected={elegido} className={`dia-op ${elegido ? "on" : ""}`}
                          onClick={() => { setProgSession(s.id); setVerDias(false); }}>
                          <span className="dia-op-tick" aria-hidden="true">{elegido ? "✓" : ""}</span>
                          <span className="dia-op-nombre">{s.name}</span>
                          <span className="dia-op-n mono">{n} ej.</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            {/* Las dos ediciones juntas y ROTULADAS. El lapiz suelto entre los
                chips era el hamburguesa otra vez: un icono sin nombre, y encima
                caia en una tercera fila cuando el programa tiene cuatro dias.

                `!esAsignado` no es simetria: el editor de sesiones era la unica
                puerta que quedaba abierta en un programa de solo lectura, y
                ademas de renombrar BORRA la sesion con sus ejercicios. Los logs
                son `week|exId|setN`, asi que las series registradas quedan
                colgando de ejercicios que ya no existen — y eso no lo deshace
                ningun pull. */}
            {session === null && !esAsignadoVisto && (
              <div className="prog-acciones">
                <button className="prog-accion" onClick={() => setEditingProgram({ ...programaVisto })}>Editar programa</button>
                <button className="prog-accion prog-dias-btn" onClick={() => setEditingSessions(true)}>Editar días</button>
              </div>
            )}
            <div className="plist">
              {progBlocks.map((b, bi) => (
                <div key={bi} className={b.type === "superset" ? "prog-ss-group" : ""}>
                  {b.type === "superset" && <div className="prog-ss-label">⚡ {b.exercises.length === 2 ? "Superserie" : b.exercises.length === 3 ? "Tri-set" : "Giant set"}</div>}
                  {b.exercises.map((e) => (
                    <button key={e.id} className={`prow ${defDe(e) ? "con-tec" : ""} ${b.type === "superset" ? "in-ss" : ""}`} onClick={() => {
                      // Un aviso con la forma de la app, no un `alert()` del
                      // sistema operativo: el candado ya explica que no se
                      // puede: esto explica por que, y se va solo.
                      if (session !== null) { setAviso("🔒 Estás entrenando. Terminá o cancelá la sesión para editar el programa."); return; }
                      if (esAsignadoVisto) { setDescModal(e); return; }
                      setEditing({ ...e });
                    }}>
                      <div className="pmain"><div className="pname">{e.name}{e.description && <span className="desc-hint-sm">i</span>}{session !== null && <span className="lock-inline">🔒</span>}</div><div className="pmeta">{e.group}{(() => { const t = defDe(e); return t ? <span className="tecchip" style={{ marginLeft: 6 }}>{t.icono} {t.corto || t.nombre}</span> : null; })()}</div></div>
                      {/* El RIR y el descanso estaban solo adentro de Entrenar.
                          El RIR es contra lo que el semaforo juzga la serie, y
                          el descanso es lo que uno mira ANTES de empezar: los
                          dos datos que se van a buscar leyendo el programa. */}
                      <div className="pnums mono">
                        {/* "3x12-12" no es un rango, es un numero escrito dos
                            veces. */}
                        <div>{e.sets}x{e.repsMin === e.repsMax ? e.repsMin : `${e.repsMin}-${e.repsMax}`} · {refLine(e, null, deloadVisto).split(" ×")[0]}</div>
                        <div className="pnums-2">{[String(e.rir ?? "").trim() && `RIR ${e.rir}`, e.rest && `D ${fmtRest(e.rest)}`].filter(Boolean).join(" · ")}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {/* Un dia sin ejercicios se veia como una pantalla rota: la lista
                vacia y un boton. En un programa asignado ni eso. */}
            {!progBlocks.length && (
              <div className="empty">
                {esAsignadoVisto
                  ? "Tu entrenador todavía no cargó ejercicios en este día."
                  : "Este día está vacío. Agregá el primer ejercicio acá abajo."}
              </div>
            )}
            {session === null && (
              <>
                {/* Mirando el dia, lo que sigue es entrenarlo. Antes habia que
                    ir a Entrenar y volver a elegirlo ahi. Usa la semana que ya
                    esta elegida en Entrenar, y pasa por el mismo camino: si esa
                    sesion ya tiene series cargadas, pregunta igual.

                    Solo en el programa activo: entrenar un dia de otro seria
                    cambiar de programa sin decirlo, que es exactamente lo que
                    hace el boton de arriba y por eso ese esta rotulado. */}
                {progBlocks.length > 0 && esElActivo && (
                  <button className="prog-entrenar-btn" onClick={() => { setTab("entrenar"); startSession(activeProgSession); }}>
                    Entrenar {sesionesVistas.find((s) => s.id === activeProgSession)?.name || "este día"}
                  </button>
                )}
                <button className="addbtn" hidden={esAsignadoVisto} onClick={() => setEditing({ id: uid(), session: activeProgSession, order: (Math.max(0, ...ejerciciosVistos.filter((e) => e.session === activeProgSession).map((e) => e.order)) + 1), name: "", group: "", sets: 3, refKg: "", repsMin: 8, repsMax: 12, tempo: "2-0-1-0", rest: 120, rir: "2", superset: null, technique: null, unit: "reps", description: "" })}>+ Agregar ejercicio</button>
              </>
            )}
          </div>
        )}

        {/* ======== HISTORIAL ======== */}
        {tab === "historial" && (() => {
          const histProg = history.filter((h) => !h.programId || h.programId === activeProgramId);
          // Por semana del programa, en el orden en que aparecen. Una lista
          // plana de tarjetas iguales obliga a leer el titulo de cada una para
          // saber donde termina una semana y empieza la otra.
          const porSemana = [];
          for (const h of histProg) {
            const clave = String(h.week);
            const grupo = porSemana.find((g) => g.clave === clave);
            if (grupo) grupo.sesiones.push(h);
            else porSemana.push({ clave, week: h.week, sesiones: [h] });
          }
          return (
          <div className="screen">
            {/* El boton de Excel NO va al lado del titulo: exportar es lo ultimo
                que se hace en esta pantalla y ahi arriba le disputaba el lugar
                al encabezado, igual que le pasaba al selector de programa. Vive
                al pie, despues de lo que se vino a leer. */}
            <header className="top">
              <div className="brand">FORGE</div>
              <h1>Historial</h1>
              <p className="sub">
                {histProg.length} {histProg.length === 1 ? "sesión" : "sesiones"}
                {porSemana.length > 1 ? ` en ${porSemana.length} semanas` : ""}
                {activeProgram ? ` · ${activeProgram.name}` : ""}
              </p>
            </header>
            {histProg.length === 0 && <div className="empty">Completá tu primera sesión para verla acá.</div>}
            {/* El punto de color existe desde la primera version y hasta ahora
                no habia una sola pantalla que dijera que significa: las
                etiquetas de `SEM_LABELS` solo se usaban para el export a
                Excel. Un color sin leyenda es una decoracion. */}
            {histProg.length > 0 && prefs.ayudas && (
              <Ayuda titulo="Qué es el punto de color">
                <p>El <b>semáforo</b> compara lo que hiciste contra lo que pedía el programa, ejercicio por ejercicio.</p>
                <div className="sem-leyenda">
                  <span><i style={{ background: SEM_COLORS.green }} /> {SEM_LABELS.green}</span>
                  <span><i style={{ background: SEM_COLORS.yellow }} /> {SEM_LABELS.yellow}</span>
                  <span><i style={{ background: SEM_COLORS.red }} /> {SEM_LABELS.red}</span>
                </div>
                <p style={{ marginTop: 7 }}><b>Verde</b>: llegaste al tope de repeticiones con el RIR que pedía — la próxima va más peso. <b>Amarillo</b>: llegaste a las repeticiones pero con menos reserva de la pedida — mantené la carga. <b>Rojo</b>: no llegaste al rango; revisá la carga, el descanso o cómo llegaste ese día.</p>
              </Ayuda>
            )}
            {porSemana.map(({ clave, week, sesiones }) => (
              <div key={clave} className="hist-semana">
                <div className="hist-semana-head">
                  <span className="hist-semana-t">{weekLabel(week)}</span>
                  <span className="hist-semana-n">{sesiones.length} {sesiones.length === 1 ? "sesión" : "sesiones"}</span>
                </div>
                {sesiones.map((h) => {
                  const hechos = h.exercises.filter((e) => e.sets.length > 0);
                  const ton = tonelajeSesion(h);
                  // Como fue la sesion, sin abrirla: cuantos ejercicios
                  // quedaron en cada color. El semaforo ya existia adentro y
                  // habia que desplegar para verlo, ejercicio por ejercicio.
                  const conteo = { green: 0, yellow: 0, red: 0 };
                  for (const e of hechos) if (conteo[e.sem] !== undefined) conteo[e.sem]++;
                  const abierta = expandedLog === h.id;
                  return (
                  <div key={h.id} className="hist-card">
                    <button className="hist-head" aria-expanded={abierta} onClick={() => setExpandedLog(abierta ? null : h.id)}>
                      <div className="hist-left">
                        <div className="hist-title">
                          {h.sessionName || sessName(h.session)}
                          {h.pendiente && <span className="hist-pend" title="Guardado en este teléfono, todavía no subió">sin subir</span>}
                        </div>
                        <div className="hist-meta">
                          {fmtDate(h.date)}{h.duration ? ` · ${h.duration} min` : ""}
                          {ton > 0 ? ` · ${round1(ton / 1000)}t` : ""} · {hechos.length} ej.
                        </div>
                        <div className="hist-sem">
                          {["green", "yellow", "red"].map((c) => (conteo[c] ? (
                            <span key={c} className="hist-sem-p">
                              <i style={{ background: SEM_COLORS[c] }} />{conteo[c]}
                            </span>
                          ) : null))}
                          {h.health && (
                            <span className="hist-health mono">😴{h.health.sleep} 😤{h.health.stress} ⚡{h.health.energy}</span>
                          )}
                        </div>
                      </div>
                      <span className="hist-chev">{abierta ? "▴" : "▾"}</span>
                    </button>
                    {abierta && (
                      <div className="hist-body">
                        {h.note && <p className="hist-nota">{h.note}</p>}
                        {hechos.map((e) => (
                          <div key={e.id} className="hist-ex">
                            <div className="hist-exhead"><span className="sem-dot-sm" style={{ background: SEM_COLORS[e.sem] }} /><span className="hist-exname">{e.name}</span></div>
                            {/* Una serie por pastilla. Corridas en una linea
                                monoespaciada —"120×10 @4 130×10 @3"— hay que
                                contar donde termina cada una. */}
                            <div className="hist-sets">
                              {e.sets.map((s, i) => (
                                <span key={i} className="hist-set mono">
                                  {isNum(s.kg) ? s.kg : "BW"}<i>×</i>{s.reps}
                                  {isNum(s.rir) ? <em>@{s.rir}</em> : null}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            ))}
            {histProg.length > 0 && (
              <button className="btn-secondary" onClick={() => exportHistory(histProg, activeProgram?.name)}>
                ↓ Exportar a Excel
              </button>
            )}
          </div>
          );
        })()}

        {/* ======== PROGRESO ======== */}
        {tab === "progreso" && (
          <div className="screen">
            <header className="top"><div className="brand">FORGE</div><h1>Progreso</h1><p className="sub">e1RM (Brzycki) y tonelaje del ciclo</p></header>
            <div className="card">
              <div className="cardtitle">Tonelaje semanal</div>
              <Ayuda titulo="Qué es el tonelaje" mostrar={prefs.ayudas}>
                <p>Todo el peso que moviste en la semana: se suma <b>kilos × repeticiones</b> de cada serie, incluidos los escalones de un dropset.</p>
                <p>Es una medida de <em>volumen</em>, no de fuerza. Sube si entrenás más o más pesado, y baja en la semana de descarga — ahí bajar es lo correcto.</p>
              </Ayuda>
              {/* Una semana a medias NO se compara contra una completa: se marca
                  rayada y dice cuantas sesiones lleva. El % contra la anterior
                  solo se muestra entre semanas CERRADAS — comparar 1 sesion
                  contra 3 da un -60% que no significa nada. */}
              {(() => { const vals = weeks.map((w) => metrics.tonnage[String(w)] || 0); const max = Math.max(...vals, 1);
                return weeks.map((w, i) => {
                  const v = vals[i];
                  const est = semanasHechas[String(w)];
                  const cerrada = est?.cerrada;
                  const prevEst = i > 0 ? semanasHechas[String(weeks[i - 1])] : null;
                  const prev = i > 0 ? vals[i - 1] : 0;
                  const comparable = cerrada && prevEst?.cerrada && prev > 0 && v > 0;
                  const delta = comparable ? Math.round(((v - prev) / prev) * 100) : null;
                  return (
                    <div key={w} className="tonrow">
                      <span className="tonlbl">{w === "DL" ? "DL" : `S${w}`}</span>
                      <div className="tonbar"><div className={cerrada ? "" : "encurso"} style={{ width: `${(v / max) * 100}%` }} /></div>
                      <span className="tonval mono">{v > 0 ? `${round1(v / 1000)}t` : "—"}</span>
                      <span className={`tondelta mono ${delta > 0 ? "up" : delta < 0 ? "dn" : ""}`}>
                        {delta !== null ? `${delta > 0 ? "+" : ""}${delta}%` : est ? `${est.hechas}/${est.total}` : ""}
                      </span>
                    </div>
                  );
                }); })()}
              {(() => {
                const abierta = weeks.find((w) => semanasHechas[String(w)] && !semanasHechas[String(w)].cerrada);
                if (!abierta) return null;
                const e = semanasHechas[String(abierta)];
                return <p className="fhint" style={{ marginTop: 10 }}>
                  {weekLabel(abierta)} está en curso: {e.hechas} de {e.total} sesiones. Su barra va a seguir creciendo.
                </p>;
              })()}
            </div>

            {datosBienestar.sesiones.length >= 2 && (
              <div className="card">
                <div className="cardtitle">Cómo llegaste a entrenar</div>
                <p className="fhint" style={{ marginBottom: 10 }}>
                  Lo que respondés antes de cada sesión. Ojo con el estrés: 5 es mucho,
                  al revés que los otros dos.
                </p>
                {(() => {
                  const ult = datosBienestar.sesiones.slice(-14);
                  return (
                    <>
                      <div className="bien-graf">
                        {ult.map((s, i) => (
                          <div key={i} className="bien-col" title={`${weekLabel(s.week)} · ${s.session}`}>
                            {BIENESTAR.map(({ id }) => (
                              <span key={id} className={`bien-p ${id}`}
                                style={{ bottom: `${((s[id] ?? 0) - 1) / 4 * 100}%`, opacity: s[id] ? 1 : 0 }} />
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="bien-leyenda">
                        {BIENESTAR.map(({ id, label }) => (
                          <span key={id} className="bien-item">
                            <span className={`bien-p ${id}`} />
                            {label} <b className="mono">{datosBienestar.promedios[id] ?? "—"}</b>
                          </span>
                        ))}
                      </div>
                      {(() => {
                        // Solo se afirma algo cuando hay con que: pocas sesiones
                        // o respuestas siempre iguales no son una conclusion.
                        const lineas = BIENESTAR.map(({ id, label, bueno }) => {
                          const r = datosBienestar.contraTonelaje[id];
                          const f = fuerzaCorrelacion(r);
                          if (!f || f === "sin relación clara") return null;
                          const masVolumen = bueno === "alto" ? r > 0 : r < 0;
                          return `${label.toLowerCase()}: los días que ${bueno === "alto" ? "llegaste mejor" : "llegaste más estresado"} moviste ${masVolumen ? "más" : "menos"} volumen`;
                        }).filter(Boolean);
                        if (!lineas.length) {
                          return <p className="fhint" style={{ marginTop: 10 }}>
                            Todavía no hay una relación clara con el volumen que movés. Con más sesiones
                            registradas se va a ver, si es que la hay.
                          </p>;
                        }
                        return <p className="fhint" style={{ marginTop: 10 }}>
                          Contra el tonelaje de cada día — {lineas.join("; ")}.
                        </p>;
                      })()}
                    </>
                  );
                })()}
              </div>
            )}

            <div className="card">
              <div className="cardtitle">Medidas corporales</div>
              <p className="fhint" style={{ marginBottom: 10 }}>
                Peso, composición, circunferencias y proporciones. El entrenamiento se mide
                en el gimnasio; el resultado, con una cinta métrica.
              </p>
              {/* La EVOLUCION va acá y no escondida detrás del botón: el peso
                  del Perfil era un número sin fecha —se corregía y no quedaba
                  rastro del anterior— mientras las tomas se guardan por fecha
                  desde el primer día. El historial existía y no había dónde
                  verlo. Cargar es otra tarea y sigue en su pantalla. */}
              {signedIn && !hayRed && !medidas.length
                ? <p className="fhint">Sin conexión no se pueden traer las mediciones.</p>
                : <EvolucionMedidas tomas={medidas} />}
              <button className="btn-secondary" onClick={() => setShowMedidas(true)}>Ver mis medidas</button>
            </div>

            <div className="card">
              <div className="cardtitle">Asistencia</div>
              <p className="fhint" style={{ marginBottom: 10 }}>
                Días de gimnasio por mes. La adherencia dice si cumpliste esta semana;
                esto dice si el hábito se sostiene.
              </p>
              <button className="btn-secondary" onClick={() => setShowAsistencia(true)}>Ver mi asistencia</button>
            </div>

            <div className="card">
              <div className="cardtitle">Tonelaje por grupo muscular</div>
              {(() => {
                const grupos = Object.entries(tonelajePorGrupo)
                  .map(([g, porSem]) => ({ grupo: g, porSem, total: Object.values(porSem).reduce((a, b) => a + b, 0) }))
                  .sort((a, b) => b.total - a.total);
                if (!grupos.length) return <div className="empty">Registrá series para verlo.</div>;

                const sel = grupos.find((g) => g.grupo === grupoSel) || null;
                const maxTotal = Math.max(...grupos.map((g) => g.total), 1);

                return (
                  <>
                    <div className="grupo-chips">
                      <button className={`chip ${!sel ? "on" : ""}`} onClick={() => setGrupoSel(null)}>Todos</button>
                      {grupos.map((g) => (
                        <button key={g.grupo} className={`chip ${sel?.grupo === g.grupo ? "on" : ""}`}
                          onClick={() => setGrupoSel(g.grupo)}>{g.grupo}</button>
                      ))}
                    </div>

                    {/* Sin grupo elegido, la pregunta es entre grupos: barras
                        horizontales del ciclo, ordenadas. Doce mini-graficos
                        apilados no comparan nada — ese era el problema. */}
                    {!sel && (
                      <>
                        <p className="fhint" style={{ margin: "10px 0" }}>Total del ciclo. Tocá un grupo para ver su evolución semana a semana.</p>
                        {grupos.map((g) => (
                          <button key={g.grupo} className="ghrow" onClick={() => setGrupoSel(g.grupo)}>
                            <span className="ghnom">{g.grupo}</span>
                            <span className="ghbar"><span style={{ width: `${Math.max(3, (g.total / maxTotal) * 100)}%` }} /></span>
                            <span className="ghval mono">{round1(g.total / 1000)}t</span>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Con un grupo elegido, la pregunta es en el tiempo. Un solo
                        grafico grande, con los valores escritos. */}
                    {sel && (() => {
                      const vals = weeks.map((w) => sel.porSem[String(w)] || 0);
                      const maxSem = Math.max(...vals, 1);
                      return (
                        <>
                          <p className="fhint" style={{ margin: "10px 0" }}>
                            <strong>{sel.grupo}</strong> · {round1(sel.total / 1000)}t en el ciclo
                          </p>
                          <div className="gsem">
                            {weeks.map((w, i) => (
                              <div key={w} className="gsem-col">
                                <span className="gsem-v mono">{vals[i] ? `${round1(vals[i] / 1000)}t` : "—"}</span>
                                <span className="gsem-hueco">
                                  <span className={`gsem-b ${!vals[i] ? "vacia" : semanasHechas[String(w)]?.cerrada ? "" : "encurso"}`}
                                    style={{ height: `${vals[i] ? Math.max(6, (vals[i] / maxSem) * 100) : 2}%` }} />
                                </span>
                                <span className="gsem-l">{w === "DL" ? "DL" : `S${w}`}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </>
                );
              })()}
            </div>

            <div className="card">
              <div className="cardtitle">e1RM por ejercicio</div>
              <Ayuda titulo="Qué es el e1RM" mostrar={prefs.ayudas}>
                <p><b>e1RM</b> es el máximo estimado a una repetición: cuánto levantarías una sola vez, calculado a partir de una serie normal. No hace falta probarlo — que es el punto, porque probar un máximo real cansa y tiene riesgo.</p>
                <p>Sale de la fórmula de Brzycki: <span className="mono">kg × 36 / (37 − reps)</span>. Cada semana toma tu mejor serie. Pierde precisión arriba de unas 12 repeticiones, así que en ejercicios de rango alto tomalo como tendencia y no como número.</p>
                <p>Sirve para comparar semanas del mismo ejercicio. <b>No</b> se hereda al cambiar de máquina: ahí empieza una serie nueva.</p>
              </Ayuda>
              {(() => {
                const nSem = activeProgram?.weeks || 4;
                const cols = `1fr repeat(${nSem}, 34px) 50px`;
                const deltas = filasE1rm.map((e) => deltaE1rm(metrics.e1rms[e.id], { semanaEnCurso }));
                const resumen = resumenCiclo(deltas);
                return (
                  <>
                    <div className="e1head mono" style={{ gridTemplateColumns: cols }}>
                      <span></span>
                      {Array.from({ length: nSem }, (_, i) => <span key={i}>S{i + 1}</span>)}
                      <span>Δ</span>
                    </div>
                    {filasE1rm.map((e, idx) => {
                      const row = Array.from({ length: nSem }, (_, i) => metrics.e1rms[e.id][String(i + 1)]);
                      const d = deltas[idx];
                      // El mismo ejercicio puede estar en dos sesiones (o quedar con
                      // nombre repetido tras una edicion). Se agrupa por id, asi que
                      // serian dos filas identicas: la sesion las distingue.
                      const repetido = filasE1rm.filter((o) => o.name === e.name).length > 1;
                      return (
                        <div key={e.id} className={`e1row ${e.retirado ? "retirado" : ""}`} style={{ gridTemplateColumns: cols }}>
                          <span className="e1name">
                            <span className="txt">{e.name}</span>
                            {repetido && <span className="e1sess">{e.session}</span>}
                            {e.retirado && <span className="e1out" title="Ya no está en el programa">fuera</span>}
                          </span>
                          {row.map((v, i) => <span key={i} className="mono e1v">{v ? Math.round(v) : "·"}</span>)}
                          <span className={`e1delta mono ${d.delta > 0 ? "up" : d.delta < 0 ? "dn" : ""} ${d.provisional ? "prov" : ""}`}
                            title={d.delta === null ? "Hace falta más de una semana con datos"
                              : `De ${d.primera} a ${d.ultima} kg${d.provisional ? " · la última semana sigue en curso" : ""}`}>
                            {d.delta === null ? "·" : <>
                              <b>{d.delta > 0 ? "+" : ""}{d.delta}</b>
                              <small>{d.pct > 0 ? "+" : ""}{d.pct}%</small>
                            </>}
                          </span>
                        </div>
                      );
                    })}
                    {resumen.total > 0 && (
                      <p className="fhint" style={{ marginTop: 10 }}>
                        {resumen.suben} {resumen.suben === 1 ? "ejercicio subió" : "ejercicios subieron"}
                        {resumen.bajan > 0 && `, ${resumen.bajan} bajó${resumen.bajan === 1 ? "" : "n"}`}
                        {resumen.iguales > 0 && `, ${resumen.iguales} igual${resumen.iguales === 1 ? "" : "es"}`}
                        {" "}en el ciclo.
                        {resumen.provisionales > 0 && ` ${resumen.provisionales} con la semana en curso todavía abierta.`}
                      </p>
                    )}
                  </>
                );
              })()}
              {Object.keys(metrics.e1rms).length === 0 && <div className="empty">Registrá series con kg y reps para ver tu e1RM acá.</div>}
            </div>
          </div>
        )}

        {/* ======== TIMER ========
            Se dibuja fuera de las pestañas a proposito: el descanso corre
            aunque uno se vaya a mirar el historial. */}
        {timer && (
          <div className={`timerbar ${quedan === 0 ? "zero" : ""}`}>
            <div className="tfill" style={{ width: `${avance(timer) * 100}%` }} />
            <div className="tcontent">
              <span className="tlabel">{quedan === 0 ? "A LA BARRA!" : "DESCANSO"}</span>
              <span className="ttime mono">{fmtTime(quedan)}</span>
              <button className="tskip" onClick={cerrarDescanso}>{quedan === 0 ? "OK" : "Saltar"}</button>
            </div>
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

        {/* ======== DESCRIPTION MODAL ========
            En un programa asignado esta ficha es lo UNICO que devuelve tocar una
            fila, y dibujaba nada mas que `description`: los ejercicios sin nota
            —que son la mayoria— abrian una caja muda con el nombre y un OK.
            Ahora lo primero es la prescripcion, que existe siempre; la nota del
            entrenador es lo que se agrega cuando la hay. */}
        {descModal && (() => {
          const tec = defDe(descModal);
          const ref = refFor(descModal, null);
          const carga = ref === null || ref === "" ? null
            : ref === "BW" ? "peso corporal"
            : `${ref}${isNum(ref) ? " kg" : ""}`;
          const detalle = [
            String(descModal.rir ?? "").trim() && `RIR ${descModal.rir}`,
            descModal.rest && `descanso ${fmtRest(descModal.rest)}`,
            descModal.tempo && `tempo ${descModal.tempo}`,
          ].filter(Boolean).join(" · ");
          return (
          <div className="overlay centered" onClick={() => setDescModal(null)}>
            <div className="confirm-box desc-modal" onClick={(e) => e.stopPropagation()}>
              <div className="desc-modal-head">
                <div className="eyebrow">{descModal.group}</div>
                <h3>{descModal.name}</h3>
              </div>
              <p className="desc-modal-presc mono">
                {descModal.sets} × {descModal.repsMin === descModal.repsMax ? descModal.repsMin : `${descModal.repsMin}-${descModal.repsMax}`} {descModal.unit === "pasos" ? "pasos" : "reps"}
                {carga ? ` · ${carga}` : ""}
              </p>
              {detalle && <p className="desc-modal-meta">{detalle}</p>}
              {tec && (
                <>
                  <p className="desc-modal-tec"><span className="tecchip">{tec.icono} {tec.nombre}{tec.pasos > 1 ? ` ×${tec.pasos}` : ""}</span></p>
                  <p className="tec-ayuda">{tec.ayuda}</p>
                </>
              )}
              {descModal.description && <p className="desc-modal-body">{descModal.description}</p>}
              <button className="confirm-ok" style={{ width: "100%", marginTop: 12 }} onClick={() => setDescModal(null)}>OK</button>
            </div>
          </div>
          );
        })()}

        {/* ======== CONFIRM MODAL ======== */}
        {confirmAction && (
          <div className="overlay centered" onClick={() => setConfirmAction(null)}>
            <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
              <p className="confirm-msg">{confirmAction === "finish" ? "Terminar la sesión y guardar al historial?" : "Salir sin guardar?"}</p>
              {/* La nota es el unico canal de vuelta hacia el entrenador: el alumno
                  no edita la prescripcion, pero si cuenta como le fue. */}
              {confirmAction === "finish" && (
                <>
                  <textarea className="note-input" rows={3} maxLength={500}
                    placeholder={esAsignado ? `Nota para ${activeProgram?.coachName || "tu entrenador"} (opcional)` : "Cómo te fue (opcional)"}
                    value={sessionNote} onChange={(e) => setSessionNote(e.target.value)} />
                  <p className="note-hint">
                    {esAsignado
                      ? "La lee quien te entrena. Molestias, cargas que quedaron cortas, lo que sea."
                      : "Queda en tu historial."}
                  </p>
                </>
              )}
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
                        const borrar = () => {
                          setSessions((S) => S.filter((x) => x.id !== s.id));
                          setProgram((P) => P.filter((e) => e.session !== s.id));
                          if (activeProgSession === s.id) setProgSession(null);
                        };
                        if (!exCount) return borrar();
                        setConfirmarBorrado({
                          mensaje: `¿Eliminar "${s.name}"?`,
                          detalle: `Se van con ella ${exCount} ejercicio${exCount === 1 ? "" : "s"}. Las series que ya registraste quedan en el historial, pero sin el ejercicio del que colgaban.`,
                          textoOk: "Eliminar",
                          onOk: borrar,
                        });
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

        {editing && <ExerciseEditor
          draft={editing}
          setDraft={setEditing}
          siblings={ejerciciosVistos.filter((e) => e.session === editing.session && e.id !== editing.id)}
          onSave={saveExercise}
          onDelete={deleteExercise}
          isNew={!program.some((e) => e.id === editing.id)}
          catalog={catalog}
          onCrearEjercicio={crearEjercicio}
          sustituido={nombreSustituido(editing)}
          semanasDelPrograma={semanasVistas}
          sessions={sesionesVistas}
          todos={ejerciciosVistos}
        />}

        {/* ======== PROGRAM EDITOR MODAL ======== */}
        {editingProgram && (
          <div className="overlay" onClick={() => setEditingProgram(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheethead"><h3>Editar programa</h3><button className="x" onClick={() => setEditingProgram(null)}>&times;</button></div>
              <div className="ed-form">
                <label className="ed-full"><span>Nombre</span><input value={editingProgram.name} onChange={(e) => setEditingProgram((p) => ({ ...p, name: e.target.value }))} /></label>

                {/* Para quien es. Antes esto solo se sabia DESPUES de asignarlo,
                    asi que un programa escrito para un alumno vivia mezclado con
                    la rutina propia hasta que hubiera alguien a quien darselo. */}
                {signedIn && (
                  <label className="ed-full"><span>Para quién es</span>
                    <div className="ed-toggle-row">
                      <button className={`ed-toggle ${editingProgram.paraAlumnos ? "" : "on"}`}
                        onClick={() => setEditingProgram((p) => ({ ...p, paraAlumnos: false }))}>Para mí</button>
                      <button className={`ed-toggle ${editingProgram.paraAlumnos ? "on" : ""}`}
                        onClick={() => setEditingProgram((p) => ({ ...p, paraAlumnos: true }))}>Para alumnos</button>
                    </div>
                  </label>
                )}
                <div className="ed-row2">
                  <label><span>Semanas</span><input className="mono" inputMode="numeric" value={editingProgram.weeks} onChange={(e) => setEditingProgram((p) => ({ ...p, weeks: parseInt(e.target.value) || 0 }))} /></label>
                  <label className="ed-check-label"><span>Deload</span><div className="ed-toggle-row"><button className={`ed-toggle ${editingProgram.hasDeload ? "on" : ""}`} onClick={() => setEditingProgram((p) => ({ ...p, hasDeload: !p.hasDeload }))}>{editingProgram.hasDeload ? "Si" : "No"}</button></div></label>
                </div>

                {editingProgram.hasDeload && (() => {
                  const d = { ...DELOAD_DEFAULT, ...editingProgram.deload };
                  const setD = (campo, valor) => setEditingProgram((p) => ({ ...p, deload: { ...DELOAD_DEFAULT, ...p.deload, [campo]: valor } }));
                  return (
                    <>
                      <div className="ed-row2">
                        <label><span>Reducir</span>
                          <input className="mono" inputMode="numeric" value={d.pct}
                            onChange={(e) => setD("pct", Math.min(90, Math.max(0, parseInt(e.target.value) || 0)))} />
                        </label>
                        <label className="ed-check-label"><span>Quitando</span>
                          <div className="ed-toggle-row">
                            <button className={`ed-toggle ${d.method === "sets" ? "on" : ""}`} onClick={() => setD("method", "sets")}>Series</button>
                            <button className={`ed-toggle ${d.method === "reps" ? "on" : ""}`} onClick={() => setD("method", "reps")}>Reps</button>
                          </div>
                        </label>
                      </div>
                      {d.method === "sets" && (
                        <label className="ed-full"><span>Mínimo de series</span>
                          <input className="mono" inputMode="numeric" value={d.minSets}
                            onChange={(e) => setD("minSets", Math.max(1, parseInt(e.target.value) || 1))} />
                        </label>
                      )}
                      <p className="ed-hint2">
                        {d.method === "sets"
                          ? `Deload al ${100 - d.pct}% de las series, nunca menos de ${d.minSets}. Un ejercicio de 3 series pasa a ${setsFor({ sets: 3 }, "DL", d)}; uno de 2, a ${setsFor({ sets: 2 }, "DL", d)}.`
                          : `Deload al ${100 - d.pct}% de las reps, con las mismas series. Un rango de 10-12 pasa a ${repsFor({ repsMin: 10, repsMax: 12 }, "DL", d).min}-${repsFor({ repsMin: 10, repsMax: 12 }, "DL", d).max}.`}
                      </p>
                    </>
                  );
                })()}

                {/* Test de maximos: una sesion del ciclo que no se autorregula
                    sino que va a buscar el tope para calibrar el ciclo siguiente. */}
                <div className="ed-row2">
                  <label><span>Test de máximos · semana</span>
                    <input className="mono" inputMode="numeric" placeholder="—"
                      value={editingProgram.maxTest?.week ?? ""}
                      onChange={(e) => {
                        const w = parseInt(e.target.value);
                        setEditingProgram((p) => ({ ...p, maxTest: isNaN(w) ? null : { week: w, session: p.maxTest?.session || "C" } }));
                      }} />
                  </label>
                  <label><span>Sesión</span>
                    <select value={editingProgram.maxTest?.session || ""}
                      disabled={!editingProgram.maxTest}
                      onChange={(e) => setEditingProgram((p) => ({ ...p, maxTest: { ...p.maxTest, session: e.target.value } }))}>
                      {(programaVisto?.sessions || []).map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
                    </select>
                  </label>
                </div>
                <p className="ed-hint2">Semana vacía = el programa no tiene test.</p>
              </div>
              <div className="sheetactions" style={{ flexDirection: "column", gap: 8 }}>
                <button className="save" onClick={() => { guardarPrograma(editingProgram); }}>Guardar</button>
                <button className="prog-dup-btn" onClick={() => {
                  const id = uid();
                  const dup = { ...programaVisto, id, name: programaVisto.name + " (copia)", exercises: programaVisto.exercises.map((e) => ({ ...e, id: uid() })), createdAt: Date.now(), updatedAt: Date.now(), readOnly: false, assignmentId: undefined, coachName: undefined, asignadoA: undefined };
                  setPrograms((ps) => [...ps, dup]);
                  // La copia se abre, no se activa: duplicar es casi siempre el
                  // primer paso de escribirle algo a alguien, no de cambiarse
                  // uno de rutina. Y la copia de un programa asignado no hereda
                  // a quien estaba asignado el original.
                  abrirProgramaNuevo(id);
                  setEditingProgram(null);
                }}>Duplicar programa</button>
                {/* Se puede borrar el ultimo. Antes estaba escondido tras
                    `programs.length > 1`, que no era una regla de producto sino
                    un parche: sin estado vacio, quedarse sin programas rompia la
                    app. Ahora la pantalla vacia existe y ofrece los tres caminos. */}
                {(
                  <button className="del" style={{ width: "100%" }} onClick={() => setConfirmarBorrado({
                    mensaje: `¿Eliminar "${programaVisto.name}"?`,
                    detalle: esElActivo
                      ? "No se puede deshacer. El historial de las sesiones que ya hiciste se queda."
                      : "No se puede deshacer. Es el que estás revisando, no el que entrenás.",
                    textoOk: "Eliminar",
                    onOk: () => {
                      const id = programaVisto.id;
                      const remaining = programs.filter((p) => p.id !== id);
                      // Lapida: el borrado tiene que viajar. Sin esto el pull
                      // siguiente lo trae de vuelta como si nada.
                      if (!programaVisto.readOnly) {
                        setBorrados((b) => ({ ...b, [id]: Date.now() }));
                        if (signedIn) pushBorrados([id]);
                      }
                      setPrograms(remaining);
                      // Solo si se borro el que se estaba entrenando. Puede no
                      // quedar ninguno: `remaining[0].id` reventaba la app al
                      // borrar el ultimo, que desde que las cuentas arrancan
                      // vacias dejo de ser un caso imposible.
                      if (id === activeProgramId) setActiveProgramId(remaining[0]?.id ?? null);
                      setVistoId(null);
                      setProgSession(null);
                      setEditingProgram(null);
                      setProgramListView(true);
                    },
                  })}>Eliminar programa</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======== IMPORT WIZARD ======== */}
        {importWizard && <ImportWizard wizard={importWizard} setWizard={setImportWizard} programas={programs} onImport={(name, preview, actualizar) => {
          // Actualizar el que ya existe en vez de duplicarlo. Lo importante no
          // es evitar la copia: es que los ejercicios CONSERVEN SU ID, porque
          // los logs son `week|exId|setN` y con ids nuevos las series quedan
          // colgando del programa viejo. Ver `lib/importar.js`.
          if (actualizar) {
            const { program } = fusionarPrograma(actualizar, { name, sessions: preview.sessions, exercises: preview.exercises });
            setPrograms((ps) => ps.map((p) => (p.id === program.id ? program : p)));
            abrirProgramaNuevo(program.id);
            setImportWizard(null);
            return;
          }
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
          abrirProgramaNuevo(id);
          setImportWizard(null);
        }} />}

        {/* ======== CONFIRM DE BORRADO ========
            Va DESPUES de los editores a proposito: todos los `.overlay` comparten
            el mismo z-index, asi que el que gana es el ultimo del DOM — y esta
            caja se abre desde adentro del editor de sesiones y del de programa. */}
        {confirmarBorrado && (
          <div className="overlay centered" onClick={() => setConfirmarBorrado(null)}>
            <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
              <p className="confirm-msg">{confirmarBorrado.mensaje}</p>
              {confirmarBorrado.detalle && <p className="confirm-detalle">{confirmarBorrado.detalle}</p>}
              <div className="confirm-actions">
                <button className="confirm-cancel" onClick={() => setConfirmarBorrado(null)}>Cancelar</button>
                <button className="confirm-del" onClick={() => { const f = confirmarBorrado.onOk; setConfirmarBorrado(null); f(); }}>
                  {confirmarBorrado.textoOk || "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmarSalida && (
          <div className="salir-aviso">Tocá atrás otra vez para salir de FORGE</div>
        )}

        {/* Avisos de la app. Flotan sobre la tabbar como el de salida, no
            bloquean nada y se van solos. */}
        {aviso && !confirmarSalida && (
          <div className="toast" role="status" onClick={() => setAviso(null)}>{aviso}</div>
        )}

        {/* Cambiar de pestaña NO cancela el descanso. Lo hacia, y era el bug
            mas caro de esta pantalla: el descanso es tiempo real —sigue
            corriendo aunque uno mire el historial— y matarlo al salir de
            Entrenar convertia una consulta de dos segundos en perder la cuenta.
            La barra se dibuja fuera de las pestañas, asi que se ve desde
            cualquiera de las cuatro. */}
        <nav className="tabbar">
          {[["programa", "Programa", "▤"], ["entrenar", "Entrenar", "◉"], ["historial", "Historial", "☰"], ["progreso", "Progreso", "↗"]].map(([id, label, icon]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}><span className="ticon">{icon}</span>{label}</button>
          ))}
        </nav>
      </div>
    </div>
  );
}

/** Cuantas semanas tienen una referencia propia. */
const contarRefs = (ex) => Object.keys(ex?.refsByWeek || {}).length;

/**
 * Una seccion plegable del editor.
 *
 * Cerrada muestra un RESUMEN de lo que hay adentro: sin eso, plegar no ordena
 * —esconde—, y quien busca por que ese ejercicio tiene dropset no encontraria
 * nada. Es la misma regla que el Perfil, donde plegar "Conexión" escondia el
 * unico diagnostico que hay para "no abre sin señal".
 */
function EdSec({ titulo, resumen, abiertoInicial, children }) {
  const [abierto, setAbierto] = useState(Boolean(abiertoInicial));
  return (
    <div className="ed-sec ed-full">
      <button type="button" className="ed-sec-head" onClick={() => setAbierto((a) => !a)}>
        <span className="ed-sec-flecha" aria-hidden="true">{abierto ? "▾" : "▸"}</span>
        <span className="ed-sec-t">{titulo}</span>
        {!abierto && resumen && <span className="ed-sec-r mono">{resumen}</span>}
      </button>
      {abierto && <div className="ed-sec-body">{children}</div>}
    </div>
  );
}

function ExerciseEditor({ draft, setDraft, siblings, onSave, onDelete, isNew, catalog, onCrearEjercicio, sustituido, semanasDelPrograma, sessions, todos }) {
  const set = (f, v) => setDraft((d) => ({ ...d, [f]: v }));
  const num = (v, int) => { const n = int ? parseInt(v) : parseFloat(v); return isNaN(n) ? "" : n; };

  /**
   * Donde va el ejercicio: dia y posicion.
   *
   * La posicion se pregunta como "va despues de tal ejercicio" y no como un
   * numero. El numero obliga a contar filas para responder algo que la pantalla
   * de al lado ya muestra en orden, y despues a re-contar si uno se equivoca.
   *
   * `enDia` son los hermanos del dia ELEGIDO —no del dia original—, asi que al
   * cambiar de dia la lista de destinos se rehace sola.
   */
  const enDia = (s) => todos.filter((e) => e.session === s && e.id !== draft.id).sort((a, b) => a.order - b.order);
  const [despues, setDespues] = useState(() => {
    const previos = enDia(draft.session).filter((e) => e.order < draft.order);
    return previos.length ? previos[previos.length - 1].id : "";
  });
  const hermanos = enDia(draft.session);
  const cambiarDeDia = (s) => {
    // Al final del dia nuevo: es donde uno espera que caiga lo que acaba de
    // mudar, y cualquier otra posicion seria una que nadie pidio.
    const destino = enDia(s);
    setDespues(destino.length ? destino[destino.length - 1].id : "");
    // La superserie apunta a un ejercicio del dia viejo: en el nuevo no
    // significa nada. `saveExercise` la suelta igual, esto lo muestra antes.
    setDraft((d) => ({ ...d, session: s, superset: null }));
  };
  // Elegir otro ejercicio del catalogo es sustituir, no renombrar: el nombre y
  // el grupo pasan a ser los del ejercicio nuevo.
  const elegirDelCatalogo = (c) => setDraft((d) => ({ ...d, exerciseId: c.id, name: c.name, group: c.group || "", unit: c.unit || d.unit }));
  return (
    <div className="overlay" onClick={() => setDraft(null)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheethead"><h3>{isNew ? "Nuevo ejercicio" : "Editar ejercicio"}</h3><button className="x" onClick={() => setDraft(null)}>×</button></div>
        <div className="ed-form">
          <ExercisePicker catalog={catalog} value={draft.exerciseId} onChange={elegirDelCatalogo} onCreate={onCrearEjercicio} />
          {sustituido && (
            <p className="ed-warn">
              Estás cambiando de ejercicio. Las series ya registradas quedan con
              <strong> {sustituido}</strong> y su e1RM no se encadena con el nuevo.
            </p>
          )}
          {/* `ed-donde` no es decorativa: es como se agarran estos dos selects
              sin contar por indice. El editor tiene cinco, y el de Unidad
              ocupaba este lugar hasta hoy — un test por posicion pasaba con la
              pantalla vieja. */}
          <div className="ed-row2 ed-donde">
            <label><span>Día</span>
              <select value={draft.session} onChange={(e) => cambiarDeDia(e.target.value)}>
                {(sessions || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label><span>Va después de</span>
              <select value={despues} onChange={(e) => setDespues(e.target.value)}>
                <option value="">— primero del día —</option>
                {hermanos.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <div className="ed-row3">
            <label><span>Series</span><input className="mono" inputMode="numeric" value={draft.sets} onChange={(e) => set("sets", num(e.target.value, true))} /></label>
            <label><span>Reps min</span><input className="mono" inputMode="numeric" value={draft.repsMin} onChange={(e) => set("repsMin", num(e.target.value, true))} /></label>
            <label><span>Reps max</span><input className="mono" inputMode="numeric" value={draft.repsMax} onChange={(e) => set("repsMax", num(e.target.value, true))} /></label>
          </div>
          <div className="ed-row2">
            <label><span>Ref KG</span><input className="mono" value={draft.refKg ?? ""} onChange={(e) => { const v = e.target.value.trim(); const n = parseFloat(v); set("refKg", v === "" ? null : !isNaN(n) && String(n) === v ? n : v); }} placeholder="120" /></label>
            <label><span>RIR</span><input className="mono" value={draft.rir} onChange={(e) => set("rir", e.target.value)} placeholder="2-3" /></label>
          </div>

          {/* Refs por semana: la progresion de este programa es autorregulada,
              asi que subir la ref en la semana 4 no puede cambiar la de las
              semanas que ya se entrenaron. Vacio = usa la referencia general.

              Va como las otras dos secciones y no con su propio estilo: tres
              plegables que se ven distinto entre si es otra vez el problema que
              esto vino a resolver. */}
          <EdSec titulo="Referencias por semana"
            resumen={contarRefs(draft) > 0 ? `${contarRefs(draft)} cargadas` : ""}
            abiertoInicial={contarRefs(draft) > 0}>
              <>
                <div className="ref-grid">
                  {semanasDelPrograma.map((w) => (
                    <label key={w} className="ref-cell">
                      <span>{w === "DL" ? "DL" : `S${w}`}</span>
                      <input className="mono" inputMode="decimal"
                        value={draft.refsByWeek?.[String(w)] ?? ""}
                        placeholder={draft.refKg ?? "—"}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          const n = parseFloat(v);
                          const valor = v === "" ? undefined : (!isNaN(n) && String(n) === v ? n : v);
                          setDraft((d) => {
                            const refs = { ...d.refsByWeek };
                            if (valor === undefined) delete refs[String(w)];
                            else refs[String(w)] = valor;
                            return { ...d, refsByWeek: Object.keys(refs).length ? refs : undefined };
                          });
                        }} />
                    </label>
                  ))}
                </div>
                <p className="ed-hint">Vacío usa la referencia general ({draft.refKg ?? "sin definir"}). Sirve para subir la carga a mitad de ciclo sin tocar lo ya entrenado.</p>
              </>
          </EdSec>
          {/* Lo de arriba es lo que se cambia seguido —que ejercicio, donde va,
              cuantas series, con cuanto—. Lo de abajo se define una vez cuando
              se escribe el programa y despues casi no se toca: catorce campos
              seguidos hacen que encontrar el que uno vino a cambiar sea el
              trabajo. Cada seccion lleva su RESUMEN cerrada, o plegar seria
              esconder. */}
          <EdSec titulo="Cómo se ejecuta"
            resumen={[draft.tempo, `${fmtRest(draft.rest || 0)}`, draft.superset ? "superserie" : null, defDe(draft)?.corto].filter(Boolean).join(" · ")}
            abiertoInicial={Boolean(draft.superset || draft.technique)}>
            <div className="ed-row2">
              <label><span>Descanso (seg)</span><input className="mono" inputMode="numeric" value={draft.rest} onChange={(e) => set("rest", num(e.target.value, true))} /></label>
              <label><span>Tempo</span><input className="mono" value={draft.tempo} onChange={(e) => set("tempo", e.target.value)} placeholder="2-0-1-0" /></label>
            </div>
            <label className="ed-full"><span>Unidad</span><select value={draft.unit} onChange={(e) => set("unit", e.target.value)}><option value="reps">reps</option><option value="pasos">pasos</option></select></label>
            <label className="ed-full"><span>Superserie con</span><select value={draft.superset ?? ""} onChange={(e) => set("superset", e.target.value || null)}><option value="">— sin superserie —</option>{siblings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            {/* La tecnica va JUNTO a la superserie porque son la misma pregunta
                vista desde dos lados: como se ejecuta. Pero no son lo mismo — una
                agrupa ejercicios y la otra pasa adentro de una serie — asi que
                llevan colores de familia distintos. */}
            <label className="ed-full"><span>Técnica</span>
              <select value={draft.technique?.tipo ?? ""} onChange={(e) => set("technique", e.target.value ? normalizarTecnica({ tipo: e.target.value }) : null)}>
                <option value="">— sin técnica —</option>
                {Object.values(TECNICAS).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
            {draft.technique?.tipo && (
              <div className="ed-row2">
                {/* "Bajadas" solo para las tecnicas que registran escalones. Una
                    isometrica en estiramiento no tiene ninguna: preguntar cuantas
                    es ofrecer configurar algo que no existe. */}
                {TECNICAS[draft.technique.tipo]?.pasos > 0 && (
                  <label><span>Bajadas</span>
                    <select value={draft.technique.pasos} onChange={(e) => set("technique", normalizarTecnica({ ...draft.technique, pasos: Number(e.target.value) }))}>
                      {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                )}
                <label><span>En qué series</span>
                  <select value={draft.technique.aplica} onChange={(e) => set("technique", normalizarTecnica({ ...draft.technique, aplica: e.target.value }))}>
                    <option value="ultima">Solo la última</option>
                    <option value="todas">Todas</option>
                  </select>
                </label>
              </div>
            )}
          </EdSec>
          <EdSec titulo="Notas"
            resumen={draft.description?.trim() ? "1 nota" : ""}
            abiertoInicial={Boolean(draft.description?.trim())}>
            <label className="ed-full"><textarea className="ed-textarea" rows={3} value={draft.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Postura, agarre, indicaciones del entrenador..." /></label>
          </EdSec>
        </div>
        <div className="sheetactions">
          {!isNew && <button className="del" onClick={() => onDelete(draft.id)}>Eliminar</button>}
          <button className="save" disabled={!draft.name || !draft.sets} onClick={() => onSave({ ...draft, repsMin: draft.repsMin || 0, repsMax: draft.repsMax || 0, rest: draft.rest || 90 }, despues)}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Excel import helpers ---------- */
const FIELD_ALIASES = {
  // EL ORDEN IMPORTA y estos dos van PRIMEROS. `matchColumn` se queda con el
  // primer campo cuyo alias este CONTENIDO en el encabezado, y "Nombre sesion"
  // contiene "sesion" (de `session`) y tambien "nombre" (de `name`): puesto mas
  // abajo, ninguno de los dos llegaria nunca a mapearse.
  programName: ["nombre del programa", "nombre programa", "programa", "program"],
  sessionName: ["nombre de la sesion", "nombre de sesion", "nombre sesion", "nombre de la sesión", "nombre de sesión", "nombre sesión", "sesion nombre"],
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
  technique: ["tecnica", "técnica", "technique", "dropset"],
  order:    ["orden", "order", "#", "nro"],
  unit:     ["unidad", "unit", "medida"],
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
  const s = String(val).trim();
  const up = s.toUpperCase();
  if (up === "BW" || up === "BODYWEIGHT") return "BW";
  const n = parseFloat(s);
  // parseFloat es permisivo ("25kg/m" -> 25), asi que solo se toma como numero si
  // la cadena ENTERA lo es. Mismo criterio que el input de Ref KG del editor.
  // Solo se normaliza BW; el resto queda como lo escribio el usuario.
  return !isNaN(n) && String(n) === s ? n : s;
}

function parseExcelData(rows, mapping) {
  const exercises = [];
  const sessionSet = new Set();
  const nombresDeSesion = new Map();
  let nombrePrograma = "";
  let order = 0;

  for (const row of rows) {
    const name = row[mapping.name];
    if (!name || !String(name).trim()) continue;

    const sessionRaw = mapping.session != null ? String(row[mapping.session] || "A").trim().toUpperCase() : "A";
    const session = sessionRaw.charAt(0);
    sessionSet.add(session);

    if (mapping.sessionName != null && !nombresDeSesion.has(session)) {
      const n = String(row[mapping.sessionName] || "").trim();
      if (n) nombresDeSesion.set(session, n);
    }
    if (mapping.programName != null && !nombrePrograma) {
      nombrePrograma = String(row[mapping.programName] || "").trim();
    }

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
      // La tecnica no puede ser texto libre: si no se reconoce, entra como nada
      // y el ejercicio se dibuja normal. Pintar de violeta algo que nadie sabe
      // ejecutar es peor que no pintarlo.
      technique: mapping.technique != null ? normalizarTecnica({ tipo: tecnicaPorAlias(row[mapping.technique]) }) : null,
      unit: mapping.unit != null && String(row[mapping.unit] || "").trim().toLowerCase().startsWith("paso") ? "pasos" : "reps",
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

  // El nombre de la sesion se toma de la PRIMERA fila de esa sesion que lo
  // traiga. Es un dato de la sesion escrito en una fila de ejercicio, asi que
  // repetirlo en las diez filas es lo natural al armar la planilla y no puede
  // ser obligatorio en ninguna.
  const sessions = [...sessionSet].sort().map((id) => ({ id, name: nombresDeSesion.get(id) || `Sesion ${id}` }));
  // Sin columna, el wizard cae al nombre del archivo — que es como un programa
  // termina llamandose "forge-programa-vigente".
  return { exercises, sessions, programName: nombrePrograma || null };
}

function downloadTemplate() {
  // "Programa" y "Nombre sesion" van PRIMERAS y se repiten en cada fila. Sin
  // ellas el programa se llamaba como el archivo y las sesiones quedaban
  // "Sesion A", "Sesion B" — que es lo unico que se ve al elegir que entrenar.
  const header = ["Programa", "Sesion", "Nombre sesion", "Orden", "Ejercicio", "Grupo muscular", "Series", "Reps min", "Reps max", "Ref KG", "Tempo", "Descanso", "RIR", "Superserie", "Tecnica", "Unidad", "Descripcion"];
  const P = "Mi programa";
  const examples = [
    [P, "A", "Torso", 1, "Sentadilla", "Cuadriceps", 4, 8, 10, 100, "2-0-1-0", "150", "2-3", "", "", "reps", "Barra alta, rodillas hacia afuera"],
    [P, "A", "Torso", 2, "Press plano", "Pecho", 3, 8, 10, 70, "2-0-1-0", "2'30\"", "2-3", "", "", "reps", ""],
    [P, "A", "Torso", 3, "Remo con barra", "Espalda", 3, 8, 10, 60, "2-0-1-1", "2'", "2-3", "", "", "reps", "Agarre prono, tirar al ombligo"],
    [P, "A", "Torso", 4, "Curl biceps", "Biceps", 3, 10, 12, 12.5, "2-0-1-0", "60", "1-2", "Extension triceps", "", "reps", ""],
    [P, "A", "Torso", 5, "Extension triceps", "Triceps", 3, 10, 12, "", "2-0-1-0", "60", "1-2", "Curl biceps", "dropset", "reps", "La ultima serie con dos bajadas de peso, sin descanso"],
    [P, "B", "Pierna", 1, "Peso muerto", "Isquios", 4, 6, 8, 120, "2-0-1-0", "3'", "2-3", "", "", "reps", "Convencional, espalda neutra"],
    [P, "B", "Pierna", 2, "Dominadas", "Espalda", 3, 4, 8, "BW", "2-0-1-0", "180", "2-3", "", "", "reps", ""],
    [P, "B", "Pierna", 3, "Gemelo sentado", "Gemelos", 3, 10, 12, 45, "1-0-1-0", "90", "1-2", "", "isoest", "reps", "Aguantar abajo 15-30\" en la ultima repeticion"],
    [P, "B", "Pierna", 4, "Caminata granjero", "Core", 3, 40, 60, "25kg/m", "", "120", "", "", "", "pasos", "Unidad 'pasos' para medir distancia en vez de repeticiones"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...examples]);
  // Column widths
  ws["!cols"] = [{ wch: 18 }, { wch: 8 }, { wch: 16 }, { wch: 6 }, { wch: 22 }, { wch: 16 }, { wch: 7 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 35 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Programa");
  XLSX.writeFile(wb, "forge-plantilla-programa.xlsx");
}

/* ---------- Excel export: historial ---------- */
// Dos hojas con grano distinto: "Sesiones" para leer el ciclo de un vistazo,
// "Series" con una fila por set — que es el grano que sirve para tabla dinamica.
function exportHistory(entries, programName) {
  const stamp = (ts) => {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const sesiones = [["Fecha", "Semana", "Sesion", "Nombre sesion", "Duracion (min)", "Sueno", "Estres", "Energia", "Ejercicios", "Series", "Tonelaje (kg)"]];
  const series = [["Fecha", "Semana", "Sesion", "Ejercicio", "Grupo", "Serie", "KG", "Reps", "RIR", "e1RM", "Semaforo"]];

  for (const h of [...entries].sort((a, b) => a.date - b.date)) {
    const exs = (h.exercises || []).filter((e) => e.sets?.length);
    let tonelaje = 0, nSeries = 0;
    for (const e of exs) {
      for (const s of e.sets) {
        nSeries++;
        if (isNum(s.kg) && isNum(s.reps)) tonelaje += s.kg * s.reps;
        const e1 = isNum(s.kg) && isNum(s.reps) ? brzycki(s.kg, s.reps) : null;
        series.push([stamp(h.date), h.week, h.session, e.name, e.group || "", s.setN, isNum(s.kg) ? s.kg : "BW", s.reps ?? "", isNum(s.rir) ? s.rir : "", e1 ? round1(e1) : "", SEM_LABELS[e.sem] || ""]);
      }
    }
    sesiones.push([stamp(h.date), h.week, h.session, h.sessionName || "", h.duration ?? "", h.health?.sleep ?? "", h.health?.stress ?? "", h.health?.energy ?? "", exs.length, nSeries, round1(tonelaje)]);
  }

  const wb = XLSX.utils.book_new();
  const wsS = XLSX.utils.aoa_to_sheet(sesiones);
  wsS["!cols"] = [{ wch: 17 }, { wch: 8 }, { wch: 8 }, { wch: 24 }, { wch: 14 }, { wch: 7 }, { wch: 7 }, { wch: 8 }, { wch: 11 }, { wch: 8 }, { wch: 13 }];
  XLSX.utils.book_append_sheet(wb, wsS, "Sesiones");
  const wsD = XLSX.utils.aoa_to_sheet(series);
  wsD["!cols"] = [{ wch: 17 }, { wch: 8 }, { wch: 8 }, { wch: 26 }, { wch: 16 }, { wch: 7 }, { wch: 8 }, { wch: 7 }, { wch: 6 }, { wch: 8 }, { wch: 13 }];
  XLSX.utils.book_append_sheet(wb, wsD, "Series");

  const slug = (programName || "programa").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  XLSX.writeFile(wb, `forge-historial-${slug}-${stamp(Date.now()).slice(0, 10)}.xlsx`);
}

function ImportWizard({ wizard, setWizard, onImport, programas = [] }) {
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
      { key: "technique", label: "Tecnica (dropset)", required: false },
      { key: "order", label: "Orden", required: false },
      { key: "unit", label: "Unidad (reps/pasos)", required: false },
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
              const { exercises, sessions, programName } = parseExcelData(wizard.rows, wizard.mapping);
              // El nombre del archivo es el ULTIMO recurso, no el primero: es
              // como un programa termina llamandose "forge-programa-vigente".
              setWizard((w) => ({ ...w, step: 3, name: programName || w.name, preview: { exercises, sessions } }));
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
    const yaExiste = candidatoAActualizar(programas, wizard.name);
    // Se calcula para MOSTRARLO, no para aplicarlo: cuantos conservan historial
    // y cuales salen. Un import que actualiza en silencio no deja ver que se
    // sustituyo un ejercicio.
    const fusion = yaExiste
      ? fusionarPrograma(yaExiste, { name: wizard.name, sessions, exercises })
      : { conservados: 0, nuevos: exercises.length, quitados: [] };
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
          {/* Ya hay un programa con este nombre. Se ofrece ACTUALIZARLO, y se
              dice antes de tocar nada que pasa con lo registrado: importar de
              nuevo sin esto deja dos copias y las series colgadas de la vieja. */}
          {yaExiste && (
            <div className="import-existe">
              <p className="import-existe-t">Ya tenés «{yaExiste.name}»</p>
              <p className="import-existe-d">
                Actualizarlo conserva lo que ya entrenaste: los ejercicios que siguen llamándose
                igual mantienen su historial. Los que cambiaron de nombre entran como ejercicio
                nuevo.
                {fusion.quitados.length > 0 && ` Sale${fusion.quitados.length === 1 ? "" : "n"} ${fusion.quitados.length}: ${fusion.quitados.slice(0, 3).join(", ")}${fusion.quitados.length > 3 ? "…" : ""}.`}
              </p>
              <p className="import-existe-n mono">
                {fusion.conservados} conserva{fusion.conservados === 1 ? "" : "n"} historial · {fusion.nuevos} nuev{fusion.nuevos === 1 ? "o" : "os"}
              </p>
              {/* Cambiar de dia conserva el id a proposito —es la misma maquina,
                  el e1RM sigue— pero es justo lo que uno querria poder
                  desmentir de un vistazo si el archivo tenia un error. */}
              {fusion.mudados?.length > 0 && (
                <p className="import-existe-d" style={{ marginTop: 6 }}>
                  Cambian de día y siguen con su historial:{" "}
                  {fusion.mudados.slice(0, 4).map((m) => `${m.name} (${m.de}→${m.a})`).join(", ")}
                  {fusion.mudados.length > 4 ? "…" : ""}.
                </p>
              )}
            </div>
          )}
          <div className="navrow" style={{ marginTop: 16 }}>
            <button className="navbtn" onClick={() => setWizard((w) => ({ ...w, step: 2, preview: null }))}>Atras</button>
            {yaExiste
              ? <button className="navbtn pri" onClick={() => onImport(wizard.name, wizard.preview, yaExiste)}>Actualizar</button>
              : <button className="navbtn pri" onClick={() => onImport(wizard.name, wizard.preview)}>Importar</button>}
          </div>
          {yaExiste && (
            <button className="import-otro" onClick={() => onImport(wizard.name, wizard.preview)}>
              Crear uno nuevo aparte
            </button>
          )}
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
/* El selector de dia. Los dias del programa, a diferencia de las SEMANAS de
   Entrenar, tienen nombre propio y largo: no entran como chips. */
.dia-sel { position: relative; margin-bottom: 12px; }
.dia-sel-btn { display: flex; align-items: center; gap: 9px; width: 100%; height: 46px; padding: 0 14px; border-radius: 12px; border: 1px solid #D1D1D6; background: #FFF; cursor: pointer; text-align: left; }
.dia-sel-lbl { font: 600 10px 'Inter'; letter-spacing: .1em; text-transform: uppercase; color: #8E8E93; flex-shrink: 0; }
.dia-sel-nombre { flex: 1; min-width: 0; font: 600 15px 'Inter'; color: #1C1C1E; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dia-sel-n { font-size: 12px; color: #636366; flex-shrink: 0; }
.dia-sel-chevron { font-size: 11px; color: #2C6BED; flex-shrink: 0; }
/* Cubre la pantalla para que tocar afuera cierre, sin dibujar nada: un panel
   anclado no oscurece lo de atras — solo hay que poder salir de el. */
.dia-backdrop { position: fixed; inset: 0; z-index: 20; border: 0; padding: 0; background: transparent; cursor: default; }
.dia-menu { position: absolute; top: 50px; left: 0; right: 0; z-index: 21; background: #FFF; border-radius: 12px; border: 1px solid #E5E5EA; box-shadow: 0 8px 24px rgba(0,0,0,.14); overflow: hidden; }
.dia-op { display: flex; align-items: center; gap: 9px; width: 100%; padding: 13px 14px; border: 0; border-bottom: 1px solid #F2F2F7; background: none; cursor: pointer; text-align: left; }
.dia-op:last-child { border-bottom: none; }
.dia-op.on { background: #EBF2FF; }
.dia-op:active { background: #F2F2F7; }
.dia-op-tick { width: 14px; flex-shrink: 0; color: #2C6BED; font-size: 13px; font-weight: 700; }
.dia-op-nombre { flex: 1; min-width: 0; font: 500 15px 'Inter'; color: #1C1C1E; }
.dia-op.on .dia-op-nombre { font-weight: 600; }
.dia-op-n { font-size: 12px; color: #8E8E93; flex-shrink: 0; }
.chip { padding: 9px 16px; border-radius: 999px; border: 1px solid #D1D1D6; background: #FFF; color: #636366; font: 600 13px 'Inter'; cursor: pointer; transition: all .15s; }
.chip.on { background: #2C6BED; border-color: #2C6BED; color: #FFF; }
.chip.dl.on { background: #E8A317; border-color: #E8A317; color: #FFF; }
/* Semana ya completa: no se esconde, se distingue. Sigue siendo tocable para
   revisar o reentrenar, pero deja de parecer la que toca. */
.chip.hecha { background: #F1F8F3; border-color: #BFE3CB; color: #1E7A3D; }
.chip.hecha.on { background: #1E9E4A; border-color: #1E9E4A; color: #FFF; }
.chip.parcial { border-color: #F0D69B; color: #8A6A2B; }
.chip.parcial.on { background: #E8A317; border-color: #E8A317; color: #FFF; }
.chip-ok { margin-left: 5px; font-size: 11px; }
.chip-n { margin-left: 5px; font-size: 10px; opacity: .75; font-family: 'DM Mono', monospace; }
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

.ssbanner { background: #E8F6F8; border: 1px solid #0E8F9E; color: #0A6F7B; font-size: 14px; font-weight: 700; padding: 10px 14px; border-radius: 10px; margin-bottom: 10px; }

/* Tecnicas intraserie (dropset y familia).
   Violeta, y nunca de la familia del semaforo: el semaforo dice COMO TE FUE y
   la tecnica dice COMO SE HACE. El color codifica la FAMILIA; cual es
   exactamente lo dice el chip, que ademas es lo que hace que no dependa solo
   del color. */
.tecchip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700;
  letter-spacing: .3px; text-transform: uppercase; padding: 3px 8px; border-radius: 999px;
  background: #F3EDFC; color: #5E2BAA; border: 1px solid #7A3FD4; }
.excard.con-tec { border-left: 3px solid #7A3FD4; }
.prow.con-tec { border-left: 3px solid #7A3FD4; }
.setrow.paso { background: #FAF7FE; }
.setrow.paso .setn { color: #7A3FD4; font-weight: 700; }
.setrow.paso .nf { border-color: #E3D6F7; }
.nf-off { display: flex; align-items: center; justify-content: center; color: #C7C7CC; font-size: 15px; }
.tec-ayuda { font-size: 12px; color: #5E2BAA; background: #F3EDFC; border-radius: 8px; padding: 6px 10px; margin: 0 0 8px; }

/* Exercise card — single and superset grouped */
.excard { background: #FFF; border: none; border-radius: 16px; padding: 20px 16px; box-shadow: 0 1px 4px rgba(0,0,0,.06); margin-bottom: 10px; }
.excard.ss-grouped { border-radius: 0; margin-bottom: 0; box-shadow: none; border-bottom: 1px solid #F2F2F7; }
.excard.ss-first { border-radius: 16px 16px 0 0; border-left: 3px solid #0E8F9E; }
.excard.ss-grouped:not(.ss-first):not(.ss-last) { border-left: 3px solid #0E8F9E; }
.excard.ss-last { border-radius: 0 0 16px 16px; border-bottom: none; border-left: 3px solid #0E8F9E; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
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
.prog-ss-group { background: #FFF; border-radius: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.06); border-left: 3px solid #0E8F9E; overflow: hidden; }
.prog-ss-label { font-size: 12px; font-weight: 700; color: #0A6F7B; padding: 8px 14px 4px; background: #E8F6F8; }
.prow { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; text-align: left; padding: 14px 16px; background: #FFF; border: none; border-radius: 12px; color: inherit; cursor: pointer; transition: background .15s; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
.prow.in-ss { border-radius: 0; box-shadow: none; border-bottom: 1px solid #F2F2F7; }
.prow.in-ss:last-child { border-bottom: none; }
.prow:active { background: #F2F2F7; }
.pname { font-weight: 600; font-size: 15px; color: #1C1C1E; }
.pmeta { color: #636366; font-size: 12px; margin-top: 2px; }
.pnums { color: #48484A; font-size: 13px; text-align: right; flex-shrink: 0; }
.pnums-2 { color: #8E8E93; font-size: 11.5px; margin-top: 2px; }
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
.hist-health { display: inline-flex; gap: 6px; font-size: 11.5px; color: #8E8E93; flex-shrink: 0; margin-left: auto; }
.hist-chev { color: #AEAEB2; font-size: 12px; }
.hist-body { padding: 0 16px 14px; border-top: 1px solid #F2F2F7; }
.hist-ex { padding: 8px 0; border-bottom: 1px solid #F2F2F7; }
.hist-ex:last-child { border-bottom: none; }
.hist-exhead { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.hist-exname { font-weight: 500; font-size: 14px; }
.sem-dot-sm { width: 8px; height: 8px; border-radius: 50%; }
/* Una pastilla por serie: corridas en una linea monoespaciada hay que contar
   donde termina cada una. */
.hist-sets { display: flex; flex-wrap: wrap; gap: 6px; }
.hist-set { padding: 3px 8px; border-radius: 8px; background: #F2F2F7; color: #1C1C1E; font-size: 12px; white-space: nowrap; }
.hist-set i { color: #AEAEB2; font-style: normal; margin: 0 1px; }
.hist-set em { color: #8E8E93; font-style: normal; margin-left: 4px; }
/* Las sesiones, por semana del programa. */
.hist-semana { margin-bottom: 6px; }
.hist-semana-head { display: flex; align-items: baseline; gap: 8px; margin: 16px 0 8px; }
.hist-semana-t { font: 600 11px 'Inter'; letter-spacing: .12em; text-transform: uppercase; color: #636366; }
.hist-semana-n { font: 400 11px 'Inter'; color: #AEAEB2; }
/* Como fue la sesion, sin abrirla. */
.hist-sem { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.hist-sem-p { display: inline-flex; align-items: center; gap: 4px; font: 600 11.5px 'Inter'; color: #636366; }
.hist-sem-p i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.hist-nota { margin: 10px 0 4px; padding: 9px 11px; border-radius: 10px; background: #F7F7FA; border-left: 3px solid #D1D1D6; font: 400 13px 'Inter'; line-height: 1.5; color: #3A3A3C; white-space: pre-wrap; }

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
.e1head { display: grid; grid-template-columns: 1fr repeat(4, 42px); gap: 5px; font-size: 11px; color: #636366; padding-bottom: 8px; border-bottom: 1px solid #E5E5EA; margin-bottom: 6px; }
.e1head span { text-align: right; } .e1head span:first-child { text-align: left; }
.e1row { display: grid; grid-template-columns: 1fr repeat(4, 42px); gap: 5px; align-items: center; padding: 8px 0; border-bottom: 1px solid #F2F2F7; }
.e1row:last-child { border-bottom: none; }
/* Flex para que el badge de sesion o de "fuera" no se lo coma la elipsis:
   se encoge el nombre, no la etiqueta que explica de que fila se trata. */
.e1name { display: flex; align-items: center; gap: 3px; min-width: 0; font-size: 13.5px; font-weight: 500; color: #1C1C1E; }
/* Dos lineas antes que puntos suspensivos: "Sentadilla pend..." y "Sentadilla
   pendular con barra" son la misma fila truncada, y la tabla existe justamente
   para distinguir ejercicios. */
.e1name > .txt { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.25; }
.e1name > .e1sess, .e1name > .e1out, .e1name > .tr { flex: 0 0 auto; }
.tr { font-size: 13px; } .tr.up { color: #34C759; } .tr.dn { color: #FF3B30; }
.e1v { font-size: 13px; text-align: right; color: #3A3A3C; }
/* Δ del ciclo: el numero absoluto arriba y el % abajo. Dos numeros en una
   columna porque +7 no dice lo mismo en un press de 80 que en un curl de 18. */
.e1delta { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.15; color: #8E8E93; }
.e1delta b { font-size: 13px; font-weight: 700; }
.e1delta small { font-size: 10px; opacity: .85; }
.e1delta.up { color: #1E9E4A; } .e1delta.dn { color: #C7261B; }
/* Provisional: la ultima semana sigue abierta y puede faltar la serie pesada. */
.e1delta.prov { opacity: .55; font-style: italic; }
.empty { color: #636366; font-size: 14px; padding: 10px 0; }
.tabbar { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; display: flex; background: rgba(255,255,255,.92); backdrop-filter: blur(16px); border-top: 1px solid #E5E5EA; z-index: 40; }
.tabbar button { flex: 1; padding: 10px 0 14px; background: none; border: none; color: #636366; font: 500 11px 'Inter'; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.tabbar button.on { color: #2C6BED; }

/* ---- cuenta y perfil ---- */
.acct { position: absolute; top: 18px; right: 18px; z-index: 30; width: 36px; height: 36px; padding: 0; border-radius: 999px; border: 1px solid #E5E5EA; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.acct-img { width: 100%; height: 100%; object-fit: cover; }
.acct-ini { font: 600 15px 'Inter'; color: #2C6BED; }
.acct-in { width: auto; height: auto; padding: 7px 14px; font: 600 13px 'Inter'; color: #2C6BED; text-decoration: none; }
.prof-head { display: flex; align-items: center; gap: 14px; }
.prof-img { width: 52px; height: 52px; border-radius: 999px; object-fit: cover; }
.prof-ini { width: 52px; height: 52px; border-radius: 999px; background: #EEF3FE; color: #2C6BED; font: 700 20px 'Inter'; display: flex; align-items: center; justify-content: center; }
.prof-name { font: 600 17px 'Inter'; color: #1C1C1E; }
.prof-role { font: 400 13px 'Inter'; color: #8E8E93; margin-top: 2px; }
/* El peso se muestra, no se edita: se carga con las medidas, que llevan fecha. */
.prof-peso { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: #F7F7FA; border: 1px solid #ECECF1; }
.prof-peso-l { font: 600 10px 'Inter'; letter-spacing: .06em; text-transform: uppercase; color: #8E8E93; }
.prof-peso-v { font-size: 17px; color: #1C1C1E; margin-top: 3px; }
.prof-peso-v i { font-style: normal; font-size: 11.5px; color: #AEAEB2; margin-left: 8px; }
.cbtn-chico { flex-shrink: 0; height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid #2C6BED; background: #FFF; color: #2C6BED; font: 600 12.5px 'Inter'; cursor: pointer; }
.flabel { display: block; font: 600 12px 'Inter'; color: #636366; text-transform: uppercase; letter-spacing: 0.04em; margin: 14px 0 6px; }
.flabel:first-child { margin-top: 0; }
.finput { width: 100%; height: 50px; box-sizing: border-box; padding: 0 14px; font-size: 16px; border: 1px solid #E5E5EA; border-radius: 12px; background: #FAFAFC; }
.finput:focus { outline: none; border-color: #2C6BED; background: #fff; }
.fhint { font: 400 13px 'Inter'; color: #8E8E93; line-height: 1.45; margin: 8px 0 0; }
.ferror { font: 500 13px 'Inter'; color: #D93025; margin: 10px 0 0; }
.btn-primary { width: 100%; height: 50px; margin-top: 18px; border: 0; border-radius: 12px; background: #2C6BED; color: #fff; font: 600 16px 'Inter'; cursor: pointer; }
.btn-primary:disabled { opacity: .45; cursor: default; }
.btn-ghost { width: 100%; height: 50px; margin-top: 12px; border: 1px solid #E5E5EA; border-radius: 12px; background: #fff; color: #636366; font: 600 15px 'Inter'; cursor: pointer; }
.e1sess { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px; background: #EEF3FE; color: #2C6BED; font: 600 10px 'Inter'; vertical-align: middle; }
.e1out { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px; background: #F2F2F7; color: #8E8E93; font: 600 10px 'Inter'; vertical-align: middle; }
.e1row.retirado .e1name { color: #8E8E93; }
.btn-secondary { width: 100%; height: 46px; margin-top: 12px; border: 1px solid #2C6BED; border-radius: 12px; background: #fff; color: #2C6BED; font: 600 15px 'Inter'; cursor: pointer; }
.btn-secondary:disabled { opacity: .5; cursor: default; }
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
.note-input { width: 100%; padding: 10px 12px; border-radius: 12px; border: 1.5px solid #D1D1D6; background: #F2F2F7; font: 400 14px 'Inter'; color: #1C1C1E; resize: vertical; text-align: left; }
.note-input:focus { outline: none; border-color: #2C6BED; background: #FFF; }
.note-hint { font-size: 11px; color: #8E8E93; text-align: left; margin: 6px 0 14px; line-height: 1.4; }
.confirm-cancel { flex: 1; height: 44px; border-radius: 10px; border: 1px solid #D1D1D6; background: #FFF; color: #636366; font: 600 15px 'Inter'; cursor: pointer; }
.confirm-ok { flex: 1; height: 44px; border-radius: 10px; border: none; background: #2C6BED; color: #FFF; font: 600 15px 'Inter'; cursor: pointer; }
/* El detalle va bajo la pregunta: que se lleva puesto el borrado. La pregunta
   sola —"¿Eliminar X?"— no alcanza para decidir. */
.confirm-detalle { font-size: 13px; color: #636366; line-height: 1.45; text-align: left; margin: -12px 0 18px; }
/* Confirmar un borrado no puede ser el mismo boton azul que confirma cualquier
   otra cosa: el color es la mitad del aviso. */
.confirm-del { flex: 1; height: 44px; border-radius: 10px; border: none; background: #FF3B30; color: #FFF; font: 600 15px 'Inter'; cursor: pointer; }

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
.picker-btn { width: 100%; min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid #E5E5EA; border-radius: 10px; background: #fff; cursor: pointer; text-align: left; }
/* La regla .ed-form span pone todo en mayusculas para los labels del
   formulario; el contenido del selector son nombres de ejercicio y tienen que
   leerse tal cual. (Ojo: esta constante es un template string — nada de
   backticks ni de dollar-llave adentro.) */
.ed-form .picker-name, .picker-name { font: 500 14px 'Inter'; color: #1C1C1E; text-transform: none; letter-spacing: 0; }
.ed-form .picker-grp, .picker-grp { font: 500 11px 'Inter'; color: #2C6BED; background: #EEF3FE; padding: 2px 7px; border-radius: 999px; text-transform: none; letter-spacing: 0; }
.ed-form .picker-ph, .picker-ph { font: 400 14px 'Inter'; color: #A1A1AA; text-transform: none; letter-spacing: 0; }
.picker-open { display: flex; flex-direction: column; gap: 6px; }
.picker-label { font: 600 11px 'Inter'; color: #636366; text-transform: uppercase; letter-spacing: .04em; }
.picker-search { width: 100%; height: 42px; box-sizing: border-box; padding: 0 12px; font-size: 16px; border: 1px solid #2C6BED; border-radius: 10px; }
.picker-list { max-height: 210px; overflow-y: auto; border: 1px solid #E5E5EA; border-radius: 10px; }
.picker-item { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; background: none; border: 0; border-bottom: 1px solid #F2F2F7; cursor: pointer; text-align: left; }
.picker-item:last-child { border-bottom: none; }
.picker-item.on { background: #EEF3FE; }
.picker-item.nuevo { justify-content: flex-start; gap: 4px; color: #2C6BED; font: 500 14px 'Inter'; text-transform: none; letter-spacing: 0; }
.picker-item.nuevo strong { color: #2C6BED; font-weight: 600; }
.picker-empty { padding: 14px 12px; font: 400 13px 'Inter'; color: #8E8E93; }
.picker-cancel { align-self: flex-start; padding: 6px 0; background: none; border: 0; color: #8E8E93; font: 500 13px 'Inter'; cursor: pointer; }
.ed-warn { width: 100%; margin: 2px 0 0; padding: 10px 12px; border-radius: 10px; background: #FFF7E6; color: #8A5B00; font: 400 12.5px 'Inter'; line-height: 1.45; }
.testnote { font-size: 13px; color: #1F4B99; background: #EEF3FE; border: 1px solid #B9CDF5; padding: 8px 14px; border-radius: 10px; margin-bottom: 12px; font-weight: 500; line-height: 1.45; }
.testbadge { display: inline-block; margin-left: 7px; padding: 1px 7px; border-radius: 999px; background: #EEF3FE; color: #2C6BED; font: 600 10px 'Inter'; vertical-align: middle; text-transform: uppercase; letter-spacing: .06em; }
.ed-hint2 { width: 100%; margin: 2px 0 0; font: 400 12.5px 'Inter'; line-height: 1.45; color: #8E8E93; text-transform: none; letter-spacing: 0; }
.btn-peligro { width: 100%; height: 50px; margin-top: 16px; border: 0; border-radius: 12px; background: #D93025; color: #fff; font: 600 15px 'Inter'; cursor: pointer; }
.prog-grupo { margin-bottom: 6px; }
.prog-grupo-head { display: flex; align-items: center; gap: 8px; width: 100%; margin: 16px 0 6px; padding: 4px 0; background: none; border: 0; cursor: pointer; text-align: left; }
.prog-grupo-flecha { color: #2C6BED; font-size: 11px; }
.prog-grupo-act { margin-left: auto; padding: 1px 8px; border-radius: 999px; border: 1px solid #2C6BED; color: #2C6BED; font: 700 10px 'Inter'; text-transform: uppercase; letter-spacing: .06em; }
.prog-grupo-t { font: 600 11px 'Inter'; letter-spacing: .12em; text-transform: uppercase; color: #636366; }
.prog-grupo-n { padding: 1px 7px; border-radius: 999px; background: #F2F2F7; color: #8E8E93; font: 600 10px 'Inter'; }
.prog-grupo-ayuda { margin: 0 0 8px; font: 400 12.5px 'Inter'; line-height: 1.45; color: #8E8E93; }
.prog-coach { display: inline-block; margin-right: 8px; padding: 2px 8px; border-radius: 999px; background: #EEF3FE; color: #2C6BED; font: 600 11px 'Inter'; }
.aviso { color: #1F7A3D; }
/* Semana en curso: rayada, para que no se lea como una caida de rendimiento. */
.tonbar div.encurso { background: repeating-linear-gradient(45deg, #2C6BED, #2C6BED 4px, #9DBBF5 4px, #9DBBF5 8px); }
.grupo-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.grupo-chips .chip { padding: 7px 12px; font-size: 12px; }
/* Comparacion ENTRE grupos: barra horizontal, que es donde el ojo compara bien. */
.ghrow { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 0; border: 0; background: none; cursor: pointer; text-align: left; }
.ghnom { flex: 0 0 92px; font: 500 12.5px 'Inter'; color: #1C1C1E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ghbar { flex: 1; height: 16px; background: #F2F2F7; border-radius: 4px; overflow: hidden; }
.ghbar > span { display: block; height: 100%; background: #2C6BED; border-radius: 4px; }
.ghval { flex: 0 0 44px; text-align: right; font-size: 12px; color: #48484A; }
/* Evolucion de UN grupo: vertical, grande, con el valor escrito. */
.gsem { display: flex; align-items: flex-end; gap: 8px; height: 120px; }
.gsem-col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 5px; height: 100%; }
.gsem-hueco { flex: 1; width: 100%; display: flex; align-items: flex-end; min-height: 0; }
.gsem-v { font-size: 10px; color: #48484A; font-weight: 600; }
.gsem-b { display: block; width: 100%; background: #2C6BED; border-radius: 5px 5px 0 0; min-height: 2px; }
.gsem-b.encurso { background: repeating-linear-gradient(45deg, #2C6BED, #2C6BED 3px, #9DBBF5 3px, #9DBBF5 6px); }
.gsem-b.vacia { background: #E5E5EA; }
.gsem-l { font: 600 10px 'Inter'; color: #AEAEB2; }

/* Bienestar: tres series de 1 a 5 sobre la misma grilla. Puntos y no barras
   porque son escalas, no cantidades: apilarlas sugeriria una suma que no existe. */
.bien-graf { position: relative; display: flex; gap: 3px; height: 96px; padding: 6px 0; border-bottom: 1px solid #E5E5EA; }
.bien-col { position: relative; flex: 1; min-width: 0; }
.bien-p { position: absolute; left: 50%; width: 7px; height: 7px; margin-left: -3.5px; border-radius: 50%; }
.bien-p.sleep { background: #2C6BED; }
.bien-p.energy { background: #34C759; }
.bien-p.stress { background: #FF9500; }
.bien-leyenda { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font: 400 12px 'Inter'; color: #636366; }
.bien-item { display: inline-flex; align-items: center; gap: 5px; }
.bien-item .bien-p { position: static; margin: 0; }
.bien-item b { color: #1C1C1E; }
/* Entrenamientos que no llegaron al servidor. El push al terminar es
   fire-and-forget y puede morir sin dejar rastro; esto es lo unico que lo hace
   visible antes de que pasen dias. */
.sinsubir { display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin-bottom: 14px; border-radius: 12px; background: #FFF7E6; border: 1px solid #F0D69B; }
.sinsubir strong { display: block; font: 600 13.5px 'Inter'; color: #7A5600; }
.sinsubir p { margin: 3px 0 0; font: 400 12px 'Inter'; color: #8A6A2B; line-height: 1.4; }
.sinsubir-btn { flex-shrink: 0; padding: 9px 14px; border-radius: 10px; border: 0; background: #E8A317; color: #fff; font: 600 13px 'Inter'; cursor: pointer; }
.sinsubir-btn:disabled { opacity: .6; }
/* Estado REAL de la conexion, distinto de "el modo offline esta listo". */
.sinred { padding: 11px 14px; margin-bottom: 14px; border-radius: 12px; background: #F2F2F7; border: 1px solid #E1E1E6; }
.sinred strong { display: block; font: 600 13.5px 'Inter'; color: #48484A; }
.sinred p { margin: 3px 0 0; font: 400 12px 'Inter'; color: #8E8E93; line-height: 1.4; }
/* Aviso de salida: flotante sobre la tabbar, se va solo. */
.salir-aviso { position: fixed; left: 50%; transform: translateX(-50%); bottom: 88px; z-index: 40; padding: 10px 18px; border-radius: 999px; background: rgba(28,28,30,.92); color: #fff; font: 600 13px 'Inter'; box-shadow: 0 4px 16px rgba(0,0,0,.2); }
/* Los avisos de la app. Misma familia que el de salida —flotan sobre la
   tabbar y se van solos— pero con lugar para una frase entera. Reemplazan al
   alert() del navegador, que en el telefono es una caja del sistema operativo:
   bloquea la app, no se parece en nada al resto y hay que tocarla para seguir. */
.toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: 88px; z-index: 41; width: calc(100% - 32px); max-width: 398px; box-sizing: border-box; padding: 13px 16px; border-radius: 14px; background: rgba(28,28,30,.94); color: #fff; font: 500 13.5px 'Inter'; line-height: 1.45; text-align: left; box-shadow: 0 6px 22px rgba(0,0,0,.24); cursor: pointer; animation: toast-in .18s ease-out; }
@keyframes toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

/* ---------- Ayudas contextuales ----------
   Cerradas ocupan una linea y no compiten con el dato. No son un tour: viven
   en la pantalla donde nace la duda y se quedan ahi. Se apagan todas juntas
   desde el Perfil. */
.ayuda-i { display: inline-flex; align-items: center; gap: 6px; margin: 2px 0 0; padding: 5px 11px 5px 6px; border: 0; border-radius: 999px; background: #F0F4FE; color: #2C6BED; font: 600 12px 'Inter'; cursor: pointer; }
.ayuda-i.on { background: #2C6BED; color: #fff; }
.ayuda-glifo { display: inline-flex; align-items: center; justify-content: center; width: 17px; height: 17px; border-radius: 50%; background: #2C6BED; color: #fff; font: 700 11px 'Inter'; }
.ayuda-i.on .ayuda-glifo { background: rgba(255,255,255,.22); }
.ayuda-txt { margin: 8px 0 4px; padding: 11px 13px; border-radius: 12px; background: #F0F4FE; border: 1px solid #DCE6FC; color: #3A3A3C; font: 400 12.5px 'Inter'; line-height: 1.55; }
.ayuda-txt b { color: #1C1C1E; font-weight: 600; }
.ayuda-txt p { margin: 0 0 7px; }
.ayuda-txt p:last-child { margin-bottom: 0; }

/* Leyenda del semaforo. El punto de color existia desde el principio y no
   existia ninguna pantalla que dijera que significa: las etiquetas solo se
   usaban para el export a Excel. */
.sem-leyenda { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 4px; }
.sem-leyenda span { display: inline-flex; align-items: center; gap: 5px; font: 400 12px 'Inter'; color: #636366; }
.sem-leyenda i { width: 9px; height: 9px; border-radius: 50%; }

/* ---------- Secciones plegables del Perfil ----------
   La pantalla paso de tres tarjetas a seis y dejo de leerse de un vistazo:
   para llegar a "Entrenar a otros" habia que bajar por veinte lineas de
   preferencias. Plegada, cada seccion ocupa un renglon. El resumen del
   encabezado es lo que evita que plegar signifique esconder. */
.sec { background: #FFF; border: none; border-radius: 14px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.06); overflow: hidden; }
.sec-head { display: flex; align-items: center; gap: 12px; width: 100%; padding: 16px 18px; border: 0; background: none; text-align: left; cursor: pointer; }
.sec-txt { flex: 1; min-width: 0; }
.sec-t { display: block; font: 600 15px 'Inter'; color: #1C1C1E; }
.sec-r { display: block; font: 400 12.5px 'Inter'; color: #8E8E93; line-height: 1.4; margin-top: 3px; }
.sec-flecha { flex: 0 0 auto; font-size: 20px; color: #C7C7CC; transition: transform .18s; }
.sec.on .sec-flecha { transform: rotate(90deg); }
.sec-cuerpo { padding: 0 18px 18px; }

/* ---------- Preferencias (Perfil) ----------
   Titulo y explicacion van en RENGLONES distintos. Eran dos <span> sueltos, o
   sea en linea, y en pantalla se leia "Cronómetro de descansoArranca solo al
   cerrar cada serie" — todo pegado. */
.pref { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 12px 0; border-bottom: 1px solid #F0F0F4; }
.pref:last-of-type { border-bottom: 0; }
.pref-txt { flex: 1; min-width: 0; }
.pref-t { display: block; font: 600 14px 'Inter'; color: #1C1C1E; line-height: 1.35; }
.pref-d { display: block; font: 400 12px 'Inter'; color: #8E8E93; line-height: 1.45; margin-top: 3px; }

/* ---------- La puerta a la app del entrenador ----------
   Era un enlace gris al fondo de la pantalla, debajo de todo. No es una opcion
   mas: es cambiar de app entera. */
a.puerta { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; padding: 15px 16px; border-radius: 14px; background: #2C6BED; color: #fff; text-decoration: none; box-shadow: 0 2px 10px rgba(44,107,237,.28); }
.puerta-ico { flex: 0 0 auto; font-size: 22px; line-height: 1; }
.puerta-txt { flex: 1; min-width: 0; }
.puerta-t { display: block; font: 600 15px 'Inter'; }
.puerta-d { display: block; font: 400 12.5px 'Inter'; color: rgba(255,255,255,.82); line-height: 1.4; margin-top: 2px; }
.puerta-flecha { flex: 0 0 auto; font-size: 17px; color: rgba(255,255,255,.9); }
.pref.off .pref-t, .pref.off .pref-d { color: #AEAEB2; }
.sw { flex: 0 0 auto; position: relative; width: 50px; height: 30px; margin-top: 2px; border: 0; border-radius: 999px; background: #D1D1D6; cursor: pointer; transition: background .18s; }
.sw.on { background: #2C6BED; }
.sw:disabled { opacity: .45; cursor: default; }
.sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .18s; }
.sw.on::after { transform: translateX(20px); }
.hist-pend { margin-left: 7px; padding: 1px 7px; border-radius: 999px; background: #FFF0D0; color: #8A6A2B; font: 600 10px 'Inter'; text-transform: uppercase; letter-spacing: .05em; vertical-align: middle; }
/* El mismo boton, pero como enlace: la puerta a la seccion de entrenador. */
a.btn-ghost { display: flex; align-items: center; justify-content: center; text-decoration: none; }
/* Salir del perfil, arriba de todo. Cerrar sesion queda visualmente aparte:
   son dos formas de "irse" y confundirlas cuesta caro. */
.volver-top { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 16px; padding: 9px 16px; border-radius: 999px; border: 1px solid #D1D1D6; background: #FFF; color: #2C6BED; font: 600 14px 'Inter'; cursor: pointer; }
.btn-salir { width: 100%; height: 46px; margin-top: 10px; border: 0; border-radius: 12px; background: none; color: #8E8E93; font: 500 14px 'Inter'; cursor: pointer; }
.btn-salir:hover { color: #D93025; }

/* Estado vacio: cuenta nueva, o alumna esperando que le asignen el programa. */
.vacio-card { background: #FFF; border-radius: 16px; padding: 20px 18px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.vacio-t { font: 600 16px 'Inter'; color: #1C1C1E; margin-bottom: 6px; }
.vacio-p { font: 400 13px 'Inter'; color: #8E8E93; line-height: 1.5; margin-bottom: 12px; }
/* Primeros pasos: el circuito entero, una sola vez, con programa y sin
   historial. Despues se descarta y no vuelve. */
.primeros { border: 1px solid #DCE6FC; }
.pasos { margin: 10px 0 4px; padding-left: 20px; }
.pasos li { font: 400 13px 'Inter'; color: #48484A; line-height: 1.55; margin-bottom: 8px; }
.pasos b { color: #1C1C1E; font-weight: 600; }

/* Evolucion de una medida en el tiempo. Una linea sin grilla: lo que se lee de
   un vistazo es la FORMA, y un numero sobre cada punto convierte el grafico en
   una tabla mal dibujada. */
.evo { margin-bottom: 12px; }
.evo-svg { width: 100%; height: 96px; display: block; overflow: visible; }
.evo-pie { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; margin-top: 6px; }
.evo-ext { font-size: 12px; color: #636366; display: flex; flex-direction: column; line-height: 1.3; }
.evo-ext.der { text-align: right; }
.evo-ext i { font-style: normal; font-size: 10.5px; color: #AEAEB2; }
.evo-delta { flex: 1; text-align: center; font-size: 11.5px; color: #8E8E93; align-self: center; }
.evo-delta.up { color: #1E7A3D; }
.evo-delta.dn { color: #B3261E; }

/* Medidas corporales */
.med-grupo { width: 100%; text-align: left; padding: 0; border: 0; background: none; font: 600 14px 'Inter'; color: #1C1C1E; cursor: pointer; }
.med-campo { margin-bottom: 14px; }
.med-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.med-dato { background: #F7F7FA; border: 1px solid #ECECF1; border-radius: 12px; padding: 11px 12px; }
.med-dato-l { font: 600 10px 'Inter'; letter-spacing: .06em; text-transform: uppercase; color: #8E8E93; }
.med-dato-v { font: 700 20px 'DM Mono', monospace; color: #1C1C1E; margin-top: 3px; }
.med-dato-v small { font-size: 12px; color: #8E8E93; font-weight: 400; }
.med-dato-d { font-size: 11px; font-weight: 600; margin-top: 2px; }
.med-dato-d.bien { color: #1E9E4A; } .med-dato-d.mal { color: #C77700; }
.med-asim { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid #F2F2F7; font-size: 12.5px; }
.med-asim:first-of-type { border-top: none; }
.med-asim.alerta { background: #FFF8E7; margin: 0 -8px; padding: 9px 8px; border-radius: 8px; border-top-color: transparent; }
.med-asim-n { flex: 1; font-weight: 600; color: #1C1C1E; }
.med-asim-p { font-weight: 700; }
.med-asim-p.bien { color: #1E9E4A; } .med-asim-p.mal { color: #C77700; }
.med-prop, .med-ratio, .med-hist { display: flex; align-items: center; gap: 8px; padding: 9px 0; border-top: 1px solid #F2F2F7; font-size: 13px; }
.med-prop:first-of-type, .med-ratio:first-of-type, .med-hist:first-of-type { border-top: none; }
.med-prop-l { flex: 1; min-width: 0; } .med-ratio > div:first-child { flex: 1; min-width: 0; }
.med-hist > div:first-child { flex: 1; min-width: 0; }
/* Son <span> uno al lado del otro: sin block, el nombre y la regla salen
   pegados ("PechoCintura + 25 cm"). Mismo caso que la lista de alumnos. */
.med-prop-n, .med-prop-r { display: block; }
.med-prop-n { font: 600 13px 'Inter'; color: #1C1C1E; }
.med-prop-r { font: 400 11px 'Inter'; color: #AEAEB2; margin-top: 1px; }
.med-prop-t { color: #AEAEB2; font-size: 12px; }
.med-prop-d { font-weight: 700; font-size: 12.5px; min-width: 38px; text-align: right; }
.med-prop-d.bien { color: #1E9E4A; } .med-prop-d.falta { color: #C77700; }
.med-ok { color: #1E9E4A; font-weight: 700; } .med-falta { color: #C77700; font-weight: 700; }
.med-borrar { padding: 4px 10px; border: 0; background: none; color: #C7C7CC; font-size: 18px; cursor: pointer; }
.med-borrar:hover { color: #C7261B; }

/* Asistencia */
.asis-barras { position: relative; display: flex; align-items: flex-end; gap: 4px; height: 130px; margin-top: 4px; }
.asis-prom { position: absolute; left: 0; right: 0; border-top: 1px dashed #C7C7CC; pointer-events: none; }
.asis-prom span { position: absolute; right: 0; top: -8px; background: #FFF; padding: 0 3px; font-size: 9px; color: #AEAEB2; }
.asis-col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 3px; height: 100%; min-width: 0; }
.asis-hueco { flex: 1; width: 100%; display: flex; align-items: flex-end; min-height: 0; }
.asis-n { font-size: 9px; color: #48484A; font-weight: 600; }
.asis-b { display: block; width: 100%; background: #2C6BED; border-radius: 3px 3px 0 0; min-height: 2px; }
.asis-b.bajo { background: #9DBBF5; }
.asis-b.encurso { background: repeating-linear-gradient(45deg, #2C6BED, #2C6BED 3px, #9DBBF5 3px, #9DBBF5 6px); }
.asis-m { font: 600 9px 'Inter'; color: #AEAEB2; }
.asis-desde { display: flex; gap: 8px; flex-wrap: wrap; }
.asis-fila { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid #F2F2F7; font-size: 13px; }
.asis-fila:first-of-type { border-top: none; }
.asis-fila-m { flex: 1; font: 600 13px 'Inter'; }
.asis-mini { padding: 3px 9px; border-radius: 999px; border: 1px solid #E5E5EA; background: #fff; color: #8E8E93; font: 600 11px 'Inter'; cursor: pointer; }
.asis-mini:hover { border-color: #2C6BED; color: #2C6BED; }
.asis-anio { border-top: 1px solid #F2F2F7; }
.asis-anio:first-of-type { border-top: none; }
.asis-anio-head { display: flex; align-items: baseline; justify-content: space-between; width: 100%; padding: 11px 0; border: 0; background: none; cursor: pointer; }
.asis-anio-n { font: 700 14px 'Inter'; color: #1C1C1E; }
.asis-anio-r { font-size: 12px; color: #8E8E93; }
.asis-anio .asis-fila { padding-left: 14px; }
.invite-banner { position: absolute; top: 62px; left: 16px; right: 16px; z-index: 25; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-radius: 12px; background: #EEF3FE; border: 1px solid #B9CDF5; font: 400 13px 'Inter'; color: #1F4B99; line-height: 1.4; }
.invite-acciones { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.invite-ver { color: #2C6BED; font-weight: 600; text-decoration: none; white-space: nowrap; }
.invite-x { background: none; border: 0; color: #7A93C4; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }
.consent { margin: 4px 0 16px; padding: 14px; border-radius: 12px; background: #FAFAFC; border: 1px solid #E5E5EA; }
.consent-t { margin: 0 0 8px; font: 400 13.5px 'Inter'; color: #444; line-height: 1.5; }
.consent ul { margin: 0 0 10px; padding-left: 18px; }
.consent li { font: 400 13.5px 'Inter'; color: #444; line-height: 1.6; }
.consent-check { display: flex; align-items: flex-start; gap: 9px; margin-bottom: 16px; cursor: pointer; }
.consent-check input { margin-top: 2px; width: 18px; height: 18px; flex: 0 0 auto; }
.consent-check span { font: 500 14px 'Inter'; color: #1C1C1E; }
.ref-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 4px; }
.ref-cell { display: flex; flex-direction: column; gap: 3px; }
.ref-cell input { width: 100%; box-sizing: border-box; text-align: center; padding: 8px 2px; }
.ed-hint { width: 100%; margin: 2px 0 0; font: 400 12.5px 'Inter'; line-height: 1.45; color: #8E8E93; }
/* Secciones plegables del editor. Cerradas dicen que hay adentro. */
.ed-sec { border-top: 1px solid #F2F2F7; padding-top: 10px; }
.ed-sec-head { display: flex; align-items: center; gap: 7px; width: 100%; padding: 4px 0; background: none; border: 0; cursor: pointer; text-align: left; }
.ed-sec-flecha { color: #2C6BED; font-size: 11px; }
.ed-sec-t { font: 600 13px 'Inter'; color: #1C1C1E; text-transform: none; letter-spacing: 0; }
.ed-sec-r { flex: 1; min-width: 0; font-size: 11.5px; color: #8E8E93; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: none; letter-spacing: 0; }
.ed-sec-body { display: flex; flex-direction: column; gap: 12px; margin-top: 10px; }
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
/* El boton de cuenta flota arriba a la derecha (position absolute), asi que
   esta fila tiene que dejarle su lugar o el menu de programas le queda debajo. */
.prog-header-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-right: 46px; }
/* El nombre del programa se PARTE en renglones antes que cortarse: es justo el
   dato que la pantalla existe para mostrar, y "Hipertrofia …" no identifica a
   ninguno. Tres y no dos, porque con el boton al lado "Plan de fuerza — Martín"
   entraba por un caracter. Y break-word, no anywhere: anywhere parte la palabra
   aunque entre entera en el renglon siguiente ("Recomposició / n — Julia"). */
.prog-header-row h1 { flex: 1; min-width: 0; overflow-wrap: break-word; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
/* El titulo ES el boton: hereda su tipografia y no le saca ancho a nada. */
.prog-switch-btn { display: inline; padding: 0; margin: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.prog-titulo-chevron { display: inline-block; margin-left: 8px; font-size: 0.62em; line-height: 1; color: #2C6BED; vertical-align: middle; }
.prog-switch-btn:active .prog-titulo-chevron { opacity: .5; }
.export-btn { height: 38px; padding: 0 14px; border-radius: 10px; background: #FFF; border: 1px solid #D1D1D6; color: #2C6BED; font: 600 13px 'Inter'; cursor: pointer; flex-shrink: 0; }
.export-btn:active { background: #F2F2F7; }
/* Las dos ediciones del programa, juntas y con nombre. Van despues de los dias
   porque son lo secundario de esta pantalla: primero se lee el plan. */
/* Estas mirando uno que no es el que entrenas. Amarillo de aviso y no rojo de
   error: no esta mal mirar, pero tiene que notarse. */
.prog-revisando { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; padding: 11px 13px; border-radius: 12px; background: #FFF8E1; border: 1px solid #E8C840; }
.prog-revisando-t { flex: 1; font: 400 12.5px 'Inter'; line-height: 1.45; color: #7A5600; }
.prog-activar-btn { flex-shrink: 0; height: 34px; padding: 0 13px; border-radius: 999px; border: none; background: #2C6BED; color: #FFF; font: 600 12.5px 'Inter'; cursor: pointer; }
.prog-acciones { display: flex; gap: 8px; margin: -6px 0 14px; }
.prog-accion { height: 34px; padding: 0 13px; border-radius: 999px; border: 1px solid #D1D1D6; background: #FFF; color: #48484A; font: 600 12.5px 'Inter'; cursor: pointer; }
.prog-accion:active { background: #F2F2F7; }
/* Lo que sigue despues de leer el dia. Solido y azul: es la unica accion de
   esta pantalla que lleva a otra parte. */
.prog-entrenar-btn { width: 100%; height: 50px; margin-top: 14px; padding: 0 14px; border: none; border-radius: 12px; background: #2C6BED; color: #FFF; font: 600 15px 'Inter'; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prog-entrenar-btn:active { background: #2559C7; }
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
/* La prescripcion va antes que la nota y con el peso de un titulo: es el dato
   que se busca parado al lado de la maquina. */
.desc-modal-presc { font-size: 16px; font-weight: 500; color: #1C1C1E; }
.desc-modal-meta { font-size: 13px; color: #636366; margin-top: 4px; }
.desc-modal-tec { margin-top: 10px; }
.desc-modal-tec + .tec-ayuda { margin-top: 6px; }
.desc-modal-presc + .desc-modal-body, .desc-modal-meta + .desc-modal-body,
.tec-ayuda + .desc-modal-body { margin-top: 12px; border-top: 1px solid #F2F2F7; padding-top: 12px; }
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
/* El aviso de "ya lo tenés". Azul y no amarillo: no es una advertencia, es la
   opcion buena — actualizar conserva el historial y duplicar lo parte. */
.import-existe { margin-top: 14px; padding: 12px 14px; background: #EEF3FE; border: 1px solid #D3E0FB; border-radius: 12px; }
.import-existe-t { margin: 0 0 4px; font-weight: 700; font-size: 14px; color: #1B4FBF; }
.import-existe-d { margin: 0; font-size: 13px; line-height: 1.45; color: #3A3A3C; }
.import-existe-n { margin: 8px 0 0; font-size: 12px; color: #1B4FBF; font-weight: 600; }
/* Crear una copia aparte existe, pero no compite visualmente con actualizar. */
.import-otro { display: block; width: 100%; margin-top: 10px; padding: 10px; background: none; border: none; color: #6C6C70; font-size: 13px; text-decoration: underline; cursor: pointer; }
.import-btn { border-color: #2C6BED; color: #2C6BED; border-style: dashed; }
.import-divider { display: flex; align-items: center; gap: 12px; margin: 14px 0; color: #AEAEB2; font-size: 13px; }
.import-divider::before, .import-divider::after { content: ''; flex: 1; height: 1px; background: #D1D1D6; }
.import-hint { font-size: 12px; color: #AEAEB2; text-align: center; margin-top: 8px; }
@media (prefers-reduced-motion: reduce) { .forge * { transition: none !important; } }
`;
