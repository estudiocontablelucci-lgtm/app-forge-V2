"use client";

import { useEffect, useState } from "react";

/**
 * Ficha de un alumno: que programa tiene y con que kilos entrena.
 *
 * La calibracion por alumno es lo que distingue a un entrenador con varios
 * alumnos de uno con una planilla: la plantilla se escribe una vez y los kilos
 * se ajustan por persona, sin tocarla ni pisarle la carga a otro.
 */
export default function AlumnoDetalle({ alumno, onVolver }) {
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState("cargando");
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(null);

  const cargar = async () => {
    try {
      const r = await fetch(`/api/coach/asignar?alumno=${encodeURIComponent(alumno.id)}`);
      if (!r.ok) throw new Error(String(r.status));
      setDatos(await r.json());
      setEstado("listo");
    } catch { setEstado("error"); }
  };

  useEffect(() => { cargar(); }, [alumno.id]);

  const asignar = async (programaId) => {
    setEstado("guardando");
    setError(null);
    const r = await fetch("/api/coach/asignar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alumno: alumno.id, programa: programaId }),
    });
    const d = await r.json();
    if (!r.ok) { setError(d.error); setEstado("listo"); return; }
    await cargar();
  };

  const fijarRef = async (ejercicioId, valor) => {
    setGuardando(ejercicioId);
    await fetch("/api/coach/asignar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alumno: alumno.id, ejercicio: ejercicioId, refKg: valor === "" ? null : valor }),
    });
    setGuardando(null);
  };

  if (estado === "cargando") return <div className="empty">Cargando…</div>;
  if (estado === "error") return <div className="empty">No pudimos cargar los datos de {alumno.name}.</div>;

  const { programas = [], asignado } = datos || {};

  return (
    <>
      <button className="btn-ghost" onClick={onVolver}>← Alumnos</button>

      <div className="card">
        <div className="cardtitle">{alumno.name}</div>
        <p className="fhint">{alumno.email}</p>
      </div>

      <div className="card">
        <div className="cardtitle">Programa asignado</div>
        {asignado
          ? <p className="fhint"><strong>{asignado.name}</strong> · {asignado.exercises.length} ejercicios · {asignado.weeks} semanas</p>
          : <p className="fhint">Todavía no le asignaste ninguno.</p>}

        {programas.length === 0 && <p className="fhint">No tenés programas para asignar. Creá uno primero desde la pestaña Programa.</p>}

        {programas.map((p) => (
          <button key={p.id} className="btn-secondary" disabled={estado === "guardando" || asignado?.id === p.id}
            onClick={() => asignar(p.id)}>
            {asignado?.id === p.id ? `${p.name} (asignado)` : `Asignar "${p.name}"`}
          </button>
        ))}
        {error && <p className="ferror">{error}</p>}
      </div>

      {asignado && (
        <div className="card">
          <div className="cardtitle">Kilos de {alumno.name.split(" ")[0]}</div>
          <p className="fhint">
            Vacío usa la referencia de la plantilla. Lo que pongas acá es solo para este alumno.
          </p>
          {asignado.exercises.map((e) => (
            <div key={e.id} className="ref-alumno">
              <div>
                <div className="alumno-name">{e.name}</div>
                <div className="alumno-sub">plantilla: {e.refKg ?? "—"}</div>
              </div>
              <input className="finput mono ref-input" inputMode="decimal"
                defaultValue={datos.asignado.refsDelAlumno?.[e.id]?.refKg ?? ""}
                placeholder={e.refKg ?? "—"}
                onBlur={(ev) => fijarRef(e.id, ev.target.value.trim())} />
              {guardando === e.id && <span className="ref-ok">…</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
