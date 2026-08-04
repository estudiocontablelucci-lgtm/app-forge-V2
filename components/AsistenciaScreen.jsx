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

  /** Los meses agrupados por año, del mas nuevo al mas viejo. */
  const porAnio = useMemo(() => {
    if (!res?.serie.length) return [];
    const mapa = new Map();
    for (const x of res.serie) {
      const a = x.mes.slice(0, 4);
      if (!mapa.has(a)) mapa.set(a, []);
      mapa.get(a).push(x);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([anio, meses]) => {
      const total = meses.reduce((s, x) => s + x.dias, 0);
      return {
        anio,
        meses: [...meses].reverse(),
        total,
        promedio: Math.round((total / meses.length) * 10) / 10,
      };
    });
  }, [res]);

  const [anioAbierto, setAnioAbierto] = useState(null);
  useEffect(() => {
    // El año en curso abierto; los anteriores, plegados.
    if (porAnio.length && anioAbierto === null) setAnioAbierto(porAnio[0].anio);
  }, [porAnio, anioAbierto]);

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

  /**
   * Escala truncada, con el piso a la vista.
   *
   * Arrancando en cero, doce meses entre 9 y 13 dias son doce barras iguales:
   * el grafico ocupa lugar y no responde nada. El piso se calcula sobre los
   * meses CERRADOS (el que esta en curso siempre esta abajo y aplastaria la
   * escala) y se escribe en pantalla, porque una escala truncada sin decirlo
   * exagera las diferencias sin que se note.
   */
  const cerrados = ultimos.filter((x) => x.mes !== res?.mesActual?.mes && x.dias > 0);
  const piso = cerrados.length >= 2 ? Math.max(0, Math.min(...cerrados.map((x) => x.dias)) - 2) : 0;
  const alto = (v) => {
    if (!v) return 2;
    const rango = Math.max(1, max - piso);
    return Math.max(5, Math.min(100, ((v - piso) / rango) * 100));
  };

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
              {/* Linea del promedio: sin una referencia, cada barra se compara
                  solo contra la de al lado. */}
              {res.promedio > piso && (
                <div className="asis-prom" style={{ bottom: `calc(14px + (100% - 30px) * ${alto(res.promedio) / 100})` }}>
                  <span className="mono">{res.promedio}</span>
                </div>
              )}
              {ultimos.map((x) => (
                <div key={x.mes} className="asis-col" title={`${etiquetaMes(x.mes)}: ${x.dias} días`}>
                  <span className="asis-n mono">{x.dias || ""}</span>
                  {/* El hueco es lo que mide 100%: si el % fuera de la columna
                      entera, la barra mas alta se comeria el numero y la etiqueta
                      y todas las de arriba quedarian aplastadas contra el techo. */}
                  <span className="asis-hueco">
                    <span className={`asis-b ${x.dias >= (res.promedio ?? 0) ? "" : "bajo"} ${x.mes === res.mesActual?.mes ? "encurso" : ""}`}
                      style={{ height: `${alto(x.dias)}%` }} />
                  </span>
                  <span className="asis-m">{etiquetaMes(x.mes).split(" ")[0]}</span>
                </div>
              ))}
            </div>
            <p className="fhint" style={{ marginTop: 8 }}>
              Las claras están por debajo de tu promedio; la rayada es el mes en curso.
              {piso > 0 && <> La escala arranca en <strong>{piso}</strong> días, no en cero, para que se noten las diferencias.</>}
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
            {/* Por año, y solo el actual abierto. Una lista plana de meses no
                tiene techo: a los tres años son treinta y seis filas para llegar
                al boton de abajo. El resumen del año cerrado dice mas que sus
                doce filas. */}
            {porAnio.map(({ anio, meses, total, promedio }) => (
              <div key={anio} className="asis-anio">
                <button className="asis-anio-head" onClick={() => setAnioAbierto(anioAbierto === anio ? null : anio)}>
                  <span className="asis-anio-n">{anioAbierto === anio ? "▾" : "▸"} {anio}</span>
                  <span className="asis-anio-r mono">{total} días · {promedio}/mes</span>
                </button>
                {anioAbierto === anio && meses.map((x) => (
                  <div key={x.mes} className="asis-fila">
                    <span className="asis-fila-m">{etiquetaMes(x.mes)}</span>
                    <span className="mono">{x.dias} días</span>
                    {manualDe.has(x.mes)
                      ? <button className="asis-mini" onClick={() => volverAlAutomatico(x.mes)} title="Volver al cálculo automático">a mano ×</button>
                      : <button className="asis-mini" onClick={() => setEditando({ mes: x.mes, dias: String(x.dias) })}>corregir</button>}
                  </div>
                ))}
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
