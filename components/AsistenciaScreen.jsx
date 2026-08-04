"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resumen, etiquetaMes } from "@/lib/asistencia";

/**
 * Asistencia al gimnasio: dias por mes, con su promedio.
 *
 * Es la pregunta larga, distinta de la adherencia al programa. La adherencia
 * dice si esta semana se cumplio; esto dice si el habito se sostiene, que es lo
 * unico que explica dos anios de progreso o su ausencia.
 *
 * El grafico es de barras por mes porque asi estaba en la planilla y porque es
 * la forma en que se lee un habito: no importa el numero de un mes, importa la
 * silueta de los ultimos doce.
 */
export default function AsistenciaScreen({ onClose }) {
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState("cargando");
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(null); // { mes, dias }
  const [desde, setDesde] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/asistencia");
      if (!r.ok) throw new Error(String(r.status));
      setDatos(await r.json());
      setEstado("listo");
    } catch { setEstado("error"); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const res = useMemo(
    () => (datos ? resumen(datos.meses, { desde }) : null),
    [datos, desde],
  );

  /**
   * Ultimos 6 y 12 meses cerrados, y el anio en curso. Son los tramos con los
   * que uno se compara de verdad; un mes cualquiera de la serie no dice nada.
   */
  const cortes = useMemo(() => {
    if (!res?.serie.length) return [];
    const cerrados = res.serie.filter((x) => x.mes !== res.mesActual?.mes);
    const out = [];
    for (const n of [6, 12]) {
      if (cerrados.length > n) out.push({ mes: cerrados[cerrados.length - n].mes, label: `últimos ${n}` });
    }
    const anio = `${new Date().getFullYear()}-01`;
    if (res.serie.some((x) => x.mes < anio)) out.push({ mes: anio, label: `${new Date().getFullYear()}` });
    return out;
  }, [res]);

  const manualDe = useMemo(
    () => new Set((datos?.manual || []).map((m) => m.mes)),
    [datos],
  );

  const guardar = async () => {
    setError(null);
    try {
      const r = await fetch("/api/asistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editando),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error); return; }
      setDatos(d);
      setEditando(null);
    } catch { setError("Sin conexión."); }
  };

  const volverAlAutomatico = async (mes) => {
    const r = await fetch(`/api/asistencia?mes=${encodeURIComponent(mes)}`, { method: "DELETE" });
    if (r.ok) setDatos(await r.json());
  };

  if (estado === "cargando") return <div className="screen"><div className="empty">Cargando…</div></div>;

  const ultimos = res ? res.serie.slice(-14) : [];
  const max = Math.max(...ultimos.map((x) => x.dias), 1);

  return (
    <div className="screen">
      <button className="volver-top" onClick={onClose}>← Volver</button>
      <header className="top">
        <div className="brand">FORGE</div>
        <h1>Asistencia</h1>
        <p className="sub">Días de gimnasio por mes</p>
      </header>

      {estado === "error" && <div className="card"><p className="fhint">No pudimos cargar tu asistencia.</p></div>}

      {res && res.serie.length === 0 && (
        <div className="vacio-card">
          <p className="vacio-t">Todavía no hay meses</p>
          <p className="vacio-p">
            Se calcula solo con cada entrenamiento que registres. Si venías anotando
            en otro lado, podés cargar los meses anteriores a mano.
          </p>
          <button className="btn-primary" onClick={() => setEditando({ mes: new Date().toISOString().slice(0, 7), dias: "" })}>
            Cargar un mes
          </button>
        </div>
      )}

      {res && res.serie.length > 0 && (
        <>
          <div className="card">
            <div className="cardtitle">Promedio</div>
            <div className="med-grid">
              <div className="med-dato">
                <div className="med-dato-l">Por mes</div>
                <div className="med-dato-v mono">{res.promedio ?? "—"}<small> días</small></div>
                <div className="med-dato-d">{res.serie.length} meses · {res.total} días</div>
              </div>
              <div className="med-dato">
                <div className="med-dato-l">Racha</div>
                <div className="med-dato-v mono">{res.racha}<small> meses</small></div>
                <div className="med-dato-d">seguidos entrenando</div>
              </div>
              {res.mejor && (
                <div className="med-dato">
                  <div className="med-dato-l">Mejor mes</div>
                  <div className="med-dato-v mono">{res.mejor.dias}<small> días</small></div>
                  <div className="med-dato-d">{etiquetaMes(res.mejor.mes)}</div>
                </div>
              )}
              {res.mesActual && (
                <div className="med-dato">
                  <div className="med-dato-l">Este mes</div>
                  <div className="med-dato-v mono">{res.mesActual.dias}<small> días</small></div>
                  <div className="med-dato-d">todavía en curso</div>
                </div>
              )}
            </div>
            <p className="fhint" style={{ marginTop: 10 }}>
              El mes en curso no entra en el promedio: está a mitad de camino.
            </p>
          </div>

          <div className="card">
            <div className="cardtitle">Últimos meses</div>
            <div className="asis-barras">
              {ultimos.map((x) => (
                <div key={x.mes} className="asis-col" title={`${etiquetaMes(x.mes)}: ${x.dias} días`}>
                  <span className="asis-n mono">{x.dias || ""}</span>
                  <div className={`asis-b ${x.dias >= (res.promedio ?? 0) ? "" : "bajo"} ${x.mes === res.mesActual?.mes ? "encurso" : ""}`}
                    style={{ height: `${x.dias ? Math.max(6, (x.dias / max) * 100) : 2}%` }} />
                  <span className="asis-m">{etiquetaMes(x.mes).split(" ")[0]}</span>
                </div>
              ))}
            </div>
            <p className="fhint" style={{ marginTop: 8 }}>
              Las barras claras están por debajo de tu promedio. La rayada es el mes en curso.
            </p>
          </div>

          {/* Comparar contra un corte es lo que muestra si algo cambio: el
              historico completo diluye una mejora reciente entre datos viejos. */}
          <div className="card">
            <div className="cardtitle">Comparar desde</div>
            {/* Cortes que significan algo, no indices arbitrarios de la serie. */}
            <div className="asis-desde">
              {cortes.map((c) => (
                <button key={c.mes} className={`chip ${desde === c.mes ? "on" : ""}`}
                  onClick={() => setDesde(desde === c.mes ? null : c.mes)}>
                  {c.label}
                </button>
              ))}
            </div>
            {res.promedioDesde !== null ? (
              <p className="fhint" style={{ marginTop: 10 }}>
                Desde {etiquetaMes(res.desde)}: <strong>{res.promedioDesde} días/mes</strong>
                {" "}contra {res.promedio} de todo el historial —{" "}
                {res.promedioDesde > res.promedio ? "vas mejor que tu promedio." : "por debajo de tu promedio."}
              </p>
            ) : (
              <p className="fhint" style={{ marginTop: 10 }}>Elegí un mes para comparar ese tramo contra todo tu historial.</p>
            )}
          </div>

          <div className="card">
            <div className="cardtitle">Meses</div>
            <p className="fhint" style={{ marginBottom: 10 }}>
              Se calculan solos con lo que registrás. Cargá a mano solo los que la app no vivió.
            </p>
            {[...res.serie].reverse().map((x) => (
              <div key={x.mes} className="asis-fila">
                <span className="asis-fila-m">{etiquetaMes(x.mes)}</span>
                <span className="mono">{x.dias} días</span>
                {manualDe.has(x.mes)
                  ? <button className="asis-mini" onClick={() => volverAlAutomatico(x.mes)} title="Volver al cálculo automático">a mano ×</button>
                  : <button className="asis-mini" onClick={() => setEditando({ mes: x.mes, dias: String(x.dias) })}>corregir</button>}
              </div>
            ))}
            <button className="btn-secondary" style={{ marginTop: 12 }}
              onClick={() => setEditando({ mes: "", dias: "" })}>+ Cargar un mes anterior</button>
          </div>
        </>
      )}

      {editando && (
        <div className="overlay centered" onClick={() => setEditando(null)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()} style={{ textAlign: "left" }}>
            <p className="confirm-msg">{editando.mes ? `Días de ${etiquetaMes(editando.mes)}` : "Cargar un mes"}</p>
            {!editando.mes && (
              <>
                <label className="flabel">Mes</label>
                <input className="finput mono" type="month" value={editando.mes}
                  onChange={(e) => setEditando((x) => ({ ...x, mes: e.target.value }))} />
              </>
            )}
            <label className="flabel">Días entrenados</label>
            <input className="finput mono" inputMode="numeric" value={editando.dias} placeholder="9"
              onChange={(e) => setEditando((x) => ({ ...x, dias: e.target.value }))} />
            <p className="note-hint">Lo que cargues acá manda sobre lo que calcula la app para ese mes.</p>
            {error && <p className="ferror">{error}</p>}
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="confirm-ok" onClick={guardar} disabled={!editando.mes || editando.dias === ""}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
