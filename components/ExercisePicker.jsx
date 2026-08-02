"use client";

import { useMemo, useState } from "react";
import { normalizar } from "@/lib/catalog";

/**
 * Selector de ejercicio contra el catalogo, con alta al vuelo.
 *
 * Reemplaza al input de texto libre. Escribir el nombre a mano era la causa de
 * que el mismo ejercicio existiera dos veces con distinta grafia y de que la
 * app no pudiera distinguir un typo corregido de un cambio de ejercicio.
 *
 * Si lo que se escribe no existe todavia, ofrece crearlo — no hay que salir a
 * cargar el catalogo aparte antes de armar el programa.
 */
export default function ExercisePicker({ catalog, value, onChange, onCreate }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const seleccionado = useMemo(
    () => (catalog || []).find((c) => c.id === value) || null,
    [catalog, value],
  );

  const resultados = useMemo(() => {
    const q = normalizar(busqueda);
    const lista = [...(catalog || [])].sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (!q) return lista;
    return lista.filter((c) => normalizar(c.name).includes(q) || normalizar(c.group || "").includes(q));
  }, [catalog, busqueda]);

  const exacto = resultados.some((c) => normalizar(c.name) === normalizar(busqueda));
  const puedeCrear = busqueda.trim().length > 1 && !exacto;

  if (!abierto) {
    return (
      <label className="ed-full">
        <span>Ejercicio</span>
        <button type="button" className="picker-btn" onClick={() => { setAbierto(true); setBusqueda(""); }}>
          {seleccionado
            ? <><span className="picker-name">{seleccionado.name}</span>{seleccionado.group && <span className="picker-grp">{seleccionado.group}</span>}</>
            : <span className="picker-ph">Elegir ejercicio…</span>}
        </button>
      </label>
    );
  }

  const elegir = (c) => { onChange(c); setAbierto(false); };

  return (
    <div className="ed-full picker-open">
      <span className="picker-label">Ejercicio</span>
      <input
        className="picker-search"
        autoFocus
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar o crear…"
      />
      <div className="picker-list">
        {resultados.map((c) => (
          <button type="button" key={c.id} className={`picker-item ${c.id === value ? "on" : ""}`} onClick={() => elegir(c)}>
            <span className="picker-name">{c.name}</span>
            {c.group && <span className="picker-grp">{c.group}</span>}
          </button>
        ))}
        {!resultados.length && !puedeCrear && <div className="picker-empty">Nada con ese nombre.</div>}
        {puedeCrear && (
          <button type="button" className="picker-item nuevo" onClick={() => { const c = onCreate(busqueda.trim()); if (c) elegir(c); }}>
            Crear <strong>{busqueda.trim()}</strong>
          </button>
        )}
      </div>
      <button type="button" className="picker-cancel" onClick={() => setAbierto(false)}>Cancelar</button>
    </div>
  );
}
