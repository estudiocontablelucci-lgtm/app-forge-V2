"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Asignar un programa al alumno.
 *
 * El camino principal es duplicar y adaptar, no compartir. Un programa asignado
 * a dos personas es un programa que no se le puede tocar a ninguna de las dos
 * sin cambiarle la rutina a la otra — asi que cuando el programa ya lo entrena
 * alguien mas, la accion que se ofrece primero es duplicarlo.
 */
export default function AsignarPrograma({ alumno, onAsignado }) {
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState("cargando");
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/coach/asignar?alumno=${encodeURIComponent(alumno.id)}`);
      if (!r.ok) throw new Error(String(r.status));
      setDatos(await r.json());
      setEstado("listo");
    } catch { setEstado("error"); }
  }, [alumno.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const asignar = async (programaId, duplicar) => {
    setEstado("guardando");
    setError(null);
    try {
      const r = await fetch("/api/coach/asignar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alumno: alumno.id,
          programa: programaId,
          duplicar,
          nombre: duplicar ? nombreDeCopia(datos, programaId, alumno) : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "No se pudo asignar."); setEstado("listo"); return; }
      setAbierto(false);
      await cargar();
      onAsignado?.();
    } catch {
      setError("Sin conexión.");
      setEstado("listo");
    }
  };

  if (estado === "cargando") return <div className="ccard"><p className="chint">Cargando programas…</p></div>;
  if (estado === "error") return <div className="ccard"><p className="chint">No pudimos cargar tus programas.</p></div>;

  const { programas = [], asignado } = datos || {};
  const primero = (alumno.name || alumno.email || "").split(" ")[0];

  return (
    <div className="ccard">
      <div className="ccard-head">
        <h2>Asignación</h2>
        {asignado && <span className="badge">{asignado.name}</span>}
      </div>

      {asignado
        ? <p className="chint">
            {primero} entrena <strong>{asignado.name}</strong> — {asignado.exercises.length} ejercicios,
            {" "}{asignado.weeks} semanas. Para cambiarle la rutina, editá ese programa desde la pestaña
            {" "}<strong>Programa</strong> de tu app; los cambios le llegan al sincronizar.
          </p>
        : <p className="chint">Todavía no le asignaste un programa.</p>}

      {!abierto && (
        <button className={`cbtn ${asignado ? "" : "pri"}`} style={{ marginTop: 12 }} onClick={() => setAbierto(true)}>
          {asignado ? "Cambiar de programa" : "Asignar un programa"}
        </button>
      )}

      {abierto && (
        <div style={{ marginTop: 8 }}>
          {programas.length === 0 && (
            <p className="chint">
              No tenés programas para asignar. Creá uno desde la pestaña Programa de tu app
              y sincronizá para que llegue acá.
            </p>
          )}

          {programas.map((p) => {
            const otros = (p.asignadoA || []).filter((a) => a.id !== alumno.id);
            const yaEsSuyo = asignado?.id === p.id;
            return (
              <div key={p.id} className="prow">
                <div className="pinfo">
                  <div className="pname">{p.name}</div>
                  <div className="psub">
                    {p.weeks} semanas
                    {yaEsSuyo && " · asignado a esta persona"}
                    {otros.length > 0 && ` · lo entrena ${otros.map((o) => o.name).join(", ")}`}
                  </div>
                </div>
                <div className="pacc">
                  <button className="cbtn chico" disabled={estado === "guardando"}
                    onClick={() => asignar(p.id, true)}>
                    Duplicar y asignar
                  </button>
                  <button className="cbtn chico" disabled={estado === "guardando" || yaEsSuyo || otros.length > 0}
                    title={otros.length > 0 ? "Ya lo entrena otra persona: duplicalo para poder adaptárselo" : undefined}
                    onClick={() => asignar(p.id, false)}>
                    {yaEsSuyo ? "Asignado" : "Asignar"}
                  </button>
                </div>
              </div>
            );
          })}

          <p className="chint" style={{ marginTop: 12 }}>
            Duplicar deja una copia propia de {primero}: adaptarla no le toca la rutina a nadie más.
          </p>
          {error && <p className="cerror">{error}</p>}
          <button className="cbtn chico" style={{ marginTop: 10 }} onClick={() => { setAbierto(false); setError(null); }}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Los programas se nombran por CONTENIDO, no por alumno ("Hipertrofia 4 sem",
 * no "Programa de Juan"): el alumno ve ese nombre en su app. La copia agrega
 * una marca corta solo para que el entrenador distinga las suyas en la lista.
 */
function nombreDeCopia(datos, programaId, alumno) {
  const base = datos?.programas?.find((p) => p.id === programaId)?.name || "Programa";
  const primero = (alumno.name || alumno.email || "").split(" ")[0];
  return `${base} · ${primero}`;
}
