"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { agregarAlCatalogo, normalizar } from "@/lib/catalog";
// Alias obligatorio: `normalizar` ya es la del catalogo en este archivo.
import { TECNICAS, defDe, normalizar as normalizarTecnica } from "@/lib/tecnicas";

/**
 * Editar el programa desde la seccion de entrenador.
 *
 * Hasta ahora el entrenador asignaba y duplicaba aca, pero para cambiar un
 * ejercicio tenia que cruzar a la pestaña Programa de su propia app de atleta —
 * una pantalla de 430px pensada para usar con una mano en el gimnasio, no para
 * planificar sentado. Esto cierra el circuito: duplicar, adaptar y asignar en un
 * solo lugar.
 *
 * Edicion EN LINEA y no un modal por ejercicio. En el celular un modal es lo
 * correcto porque no entra otra cosa; en una pantalla ancha, abrir y cerrar
 * dieciocho modales para ajustar series es trabajo de mas.
 *
 * Escribe directo en el servidor. Lo que se guarda le llega al alumno en su
 * proxima sincronizacion, porque un programa asignado se reemplaza entero.
 */
export default function EditorPrograma({ programaId, alumno, onCerrar, onGuardado }) {
  const [prog, setProg] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [nuevosDelCatalogo, setNuevosDelCatalogo] = useState([]);
  const [sesion, setSesion] = useState(null);
  const [estado, setEstado] = useState("cargando");
  const [error, setError] = useState(null);
  const [sucio, setSucio] = useState(false);

  const cargar = useCallback(async () => {
    setEstado("cargando");
    try {
      const r = await fetch(`/api/coach/programa?programa=${encodeURIComponent(programaId)}`);
      const d = await r.json();
      if (!r.ok) { setError(d.error); setEstado("error"); return; }
      setProg(d.programa);
      setCatalog(d.catalog || []);
      setSesion((s) => s || d.programa.sessions[0]?.id || null);
      setEstado("listo");
    } catch { setEstado("error"); setError("Sin conexión."); }
  }, [programaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiar = (fn) => { setProg(fn); setSucio(true); setError(null); };

  const editarEjercicio = (id, campos) =>
    cambiar((p) => ({ ...p, exercises: p.exercises.map((e) => (e.id === id ? { ...e, ...campos } : e)) }));

  /**
   * Cambiar el ejercicio de una fila.
   *
   * Si esa fila YA tiene series registradas, esto es una sustitucion y no una
   * correccion de nombre: entra como ejercicio nuevo con id propio y el anterior
   * sale del programa. Encadenar el e1RM de dos maquinas distintas es
   * exactamente lo que no hay que hacer, y es la razon de que el catalogo exista.
   */
  const elegirEjercicio = (id, entrada) => {
    const actual = prog.exercises.find((e) => e.id === id);
    const esSustitucion = actual.tieneSeries && actual.exerciseId && actual.exerciseId !== entrada.id;

    cambiar((p) => ({
      ...p,
      exercises: p.exercises.map((e) => {
        if (e.id !== id) return e;
        const base = { ...e, exerciseId: entrada.id, name: entrada.name, group: entrada.group || "", unit: entrada.unit || e.unit };
        // Id nuevo = ejercicio nuevo: sus series arrancan de cero.
        return esSustitucion
          ? { ...base, id: `nuevo-${Math.random().toString(36).slice(2, 9)}`, tieneSeries: false, sustituyeA: actual.name }
          : base;
      }),
    }));
  };

  /** Alta al vuelo: el ejercicio que no esta en el catalogo se crea al tipearlo. */
  const crearEnCatalogo = (nombre) => {
    const { catalog: siguiente, entrada } = agregarAlCatalogo(catalog, { name: nombre, group: null, unit: "reps" });
    setCatalog(siguiente);
    setNuevosDelCatalogo((n) => (n.some((x) => x.id === entrada.id) ? n : [...n, entrada]));
    return entrada;
  };

  const agregarEjercicio = () => cambiar((p) => ({
    ...p,
    exercises: [...p.exercises, {
      id: `nuevo-${Math.random().toString(36).slice(2, 9)}`,
      session: sesion, order: 999, name: "", group: "", exerciseId: null,
      sets: 3, repsMin: 8, repsMax: 12, refKg: null, tempo: "", rest: 90, rir: "2-3",
      superset: null, technique: null, unit: "reps", description: "", tieneSeries: false,
    }],
  }));

  const borrarEjercicio = (id) => cambiar((p) => ({
    ...p,
    exercises: p.exercises.filter((e) => e.id !== id).map((e) => (e.superset === id ? { ...e, superset: null } : e)),
  }));

  const mover = (id, delta) => cambiar((p) => {
    const dela = p.exercises.filter((e) => e.session === sesion);
    const otros = p.exercises.filter((e) => e.session !== sesion);
    const i = dela.findIndex((e) => e.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= dela.length) return p;
    [dela[i], dela[j]] = [dela[j], dela[i]];
    return { ...p, exercises: [...otros, ...dela] };
  });

  const guardar = async () => {
    setEstado("guardando");
    setError(null);
    try {
      const r = await fetch("/api/coach/programa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programa: {
            ...prog,
            // Los ejercicios sin ejercicio elegido no se guardan: son filas que
            // el entrenador agrego y no llego a completar.
            exercises: prog.exercises.filter((e) => e.exerciseId || e.name),
          },
          catalog: nuevosDelCatalogo,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "No se pudo guardar."); setEstado("listo"); return; }
      setProg(d.programa);
      setNuevosDelCatalogo([]);
      setSucio(false);
      setEstado("listo");
      onGuardado?.();
    } catch {
      setError("Sin conexión. No se guardó nada.");
      setEstado("listo");
    }
  };

  if (estado === "cargando") return <div className="ccard cvacio">Cargando el programa…</div>;
  if (estado === "error") return <div className="ccard cvacio">{error || "No pudimos cargar el programa."}</div>;

  const dela = prog.exercises.filter((e) => e.session === sesion);
  const primero = (alumno?.name || "").split(" ")[0];

  return (
    <>
      <div className="ccard">
        <div className="ficha-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <input className="cinput ed-nombre" value={prog.name}
              onChange={(e) => cambiar((p) => ({ ...p, name: e.target.value }))} maxLength={80} />
            <p className="chint" style={{ marginTop: 6 }}>
              {alumno
                ? `Lo que cambies acá le llega a ${primero} cuando sincronice.`
                : "Los cambios llegan a quien lo esté entrenando al sincronizar."}
            </p>
          </div>
          <div className="ficha-acc">
            <button className="cbtn chico" onClick={onCerrar}>{sucio ? "Descartar" : "Cerrar"}</button>
            <button className="cbtn pri chico" onClick={guardar} disabled={!sucio || estado === "guardando"}>
              {estado === "guardando" ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
        {error && <p className="cerror">{error}</p>}
      </div>

      <div className="ccard">
        <div className="mgrid">
          <div className="mtile">
            <div className="mlabel">Semanas</div>
            <input className="cinput mono" inputMode="numeric" value={prog.weeks}
              onChange={(e) => cambiar((p) => ({ ...p, weeks: Math.max(1, parseInt(e.target.value, 10) || 1) }))} />
          </div>
          <div className="mtile">
            <div className="mlabel">Deload</div>
            <div className="ed-toggle-fila">
              <button className={`cbtn chico ${prog.hasDeload ? "pri" : ""}`}
                onClick={() => cambiar((p) => ({ ...p, hasDeload: true }))}>Sí</button>
              <button className={`cbtn chico ${prog.hasDeload ? "" : "pri"}`}
                onClick={() => cambiar((p) => ({ ...p, hasDeload: false }))}>No</button>
            </div>
          </div>
          <div className="mtile">
            <div className="mlabel">Ejercicios</div>
            <div className="mval">{prog.exercises.length}</div>
          </div>
        </div>
      </div>

      <div className="ccard">
        <div className="ccard-head">
          <h2>Ejercicios</h2>
          <span className="ccard-sub">{dela.length} en esta sesión</span>
        </div>

        <div className="ed-sesiones">
          {prog.sessions.map((s) => (
            <button key={s.id} className={`cbtn chico ${sesion === s.id ? "pri" : ""}`} onClick={() => setSesion(s.id)}>
              {s.id} · {s.name}
            </button>
          ))}
        </div>

        <datalist id="catalogo-coach">
          {catalog.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>

        {dela.length === 0 && <p className="chint">Esta sesión no tiene ejercicios todavía.</p>}

        {dela.map((e, i) => (
          <FilaEjercicio
            key={e.id} ex={e} n={i + 1} ultimo={i === dela.length - 1}
            catalog={catalog}
            onElegir={(entrada) => elegirEjercicio(e.id, entrada)}
            onCrear={crearEnCatalogo}
            onEditar={(campos) => editarEjercicio(e.id, campos)}
            onBorrar={() => borrarEjercicio(e.id)}
            onMover={(d) => mover(e.id, d)}
          />
        ))}

        <button className="cbtn" style={{ marginTop: 12 }} onClick={agregarEjercicio}>+ Agregar ejercicio</button>
      </div>
    </>
  );
}

function FilaEjercicio({ ex, n, ultimo, catalog, onElegir, onCrear, onEditar, onBorrar, onMover }) {
  const [texto, setTexto] = useState(ex.name || "");
  const [verNota, setVerNota] = useState(Boolean(ex.description));

  useEffect(() => { setTexto(ex.name || ""); }, [ex.name]);

  const porNombre = useMemo(
    () => new Map(catalog.map((c) => [normalizar(c.name), c])),
    [catalog],
  );

  // Se resuelve al salir del campo y no en cada tecla: buscar contra el catalogo
  // mientras se escribe elegiria un ejercicio distinto en cada letra.
  const resolver = () => {
    const t = texto.trim();
    if (!t || normalizar(t) === normalizar(ex.name || "")) return;
    const encontrado = porNombre.get(normalizar(t));
    onElegir(encontrado || onCrear(t));
  };

  const num = (v, entero) => {
    const x = entero ? parseInt(v, 10) : parseFloat(v);
    return Number.isNaN(x) ? "" : x;
  };

  return (
    <div className="ed-fila">
      <div className="ed-fila-top">
        <span className="ed-n mono">{n}</span>
        {/* Marca y no frase: en un programa de seis ejercicios ya entrenados,
            repetir la advertencia seis veces la vuelve invisible. */}
        {ex.tieneSeries && !ex.sustituyeA && (
          <span className="ed-entrenado" title="Ya lo entrenó: cambiarlo por otro cuenta como sustitución">entrenado</span>
        )}
        {(() => { const t = defDe(ex); return t ? <span className="ed-tec">↓ {t.nombre}{t.pasos > 1 ? ` ×${t.pasos}` : ""}</span> : null; })()}
        <input className="cinput ed-ex" list="catalogo-coach" value={texto} placeholder="Buscar o crear ejercicio…"
          onChange={(ev) => setTexto(ev.target.value)} onBlur={resolver}
          onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); }} />
        <div className="ed-fila-acc">
          <button className="ed-mini" onClick={() => onMover(-1)} disabled={n === 1} aria-label="Subir">↑</button>
          <button className="ed-mini" onClick={() => onMover(1)} disabled={ultimo} aria-label="Bajar">↓</button>
          <button className="ed-mini borrar" onClick={onBorrar} aria-label="Quitar">×</button>
        </div>
      </div>

      {ex.sustituyeA && (
        <p className="ed-aviso">
          Sustituye a <strong>{ex.sustituyeA}</strong>. Las series ya registradas quedan con el
          anterior y el e1RM no se encadena — son dos ejercicios distintos.
        </p>
      )}

      <div className="ed-campos">
        <label><span>Series</span>
          <input className="cinput mono" inputMode="numeric" value={ex.sets}
            onChange={(e) => onEditar({ sets: num(e.target.value, true) })} /></label>
        <label><span>Reps min</span>
          <input className="cinput mono" inputMode="numeric" value={ex.repsMin ?? ""}
            onChange={(e) => onEditar({ repsMin: num(e.target.value, true) })} /></label>
        <label><span>Reps max</span>
          <input className="cinput mono" inputMode="numeric" value={ex.repsMax ?? ""}
            onChange={(e) => onEditar({ repsMax: num(e.target.value, true) })} /></label>
        <label><span>Ref kg</span>
          <input className="cinput mono" value={ex.refKg ?? ""} placeholder="—"
            onChange={(e) => {
              const v = e.target.value.trim();
              const x = parseFloat(v);
              onEditar({ refKg: v === "" ? null : (!Number.isNaN(x) && String(x) === v ? x : v) });
            }} /></label>
        <label><span>Descanso</span>
          <input className="cinput mono" inputMode="numeric" value={ex.rest ?? ""}
            onChange={(e) => onEditar({ rest: num(e.target.value, true) })} /></label>
        <label><span>RIR</span>
          <input className="cinput mono" value={ex.rir ?? ""} placeholder="2-3"
            onChange={(e) => onEditar({ rir: e.target.value })} /></label>
        {/* El coach prescribe la tecnica; el alumno la registra. Si el chip no
            estuviera tambien aca, el entrenador estaria pidiendo algo que no
            puede ver. */}
        <label><span>Técnica</span>
          <select className="cinput" value={ex.technique?.tipo ?? ""}
            onChange={(e) => onEditar({ technique: e.target.value ? normalizarTecnica({ tipo: e.target.value }) : null })}>
            <option value="">— sin técnica —</option>
            {Object.values(TECNICAS).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select></label>
        {ex.technique?.tipo && (
          <label><span>Bajadas</span>
            <select className="cinput" value={ex.technique.pasos}
              onChange={(e) => onEditar({ technique: normalizarTecnica({ ...ex.technique, pasos: Number(e.target.value) }) })}>
              {[1, 2, 3].map((k) => <option key={k} value={k}>{k}</option>)}
            </select></label>
        )}
      </div>

      <button className="ed-nota-btn" onClick={() => setVerNota((v) => !v)}>
        {verNota ? "▾" : "▸"} Nota para el alumno{ex.description ? " ·" : ""}
      </button>
      {verNota && (
        <textarea className="cinput ed-nota" rows={2} value={ex.description || ""}
          placeholder="Cómo ejecutarlo, qué cuidar, sustituciones…"
          onChange={(e) => onEditar({ description: e.target.value })} />
      )}
    </div>
  );
}
