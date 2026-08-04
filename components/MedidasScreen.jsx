"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GRUPOS, ALTURA, derivadas, ratios, proporciones, asimetrias, contra } from "@/lib/medidas";

/**
 * Medidas corporales del atleta.
 *
 * Lo que la app no tenia y la planilla si. No es un formulario largo por gusto:
 * la composicion sola no dice nada sin las circunferencias, y las
 * circunferencias solas no dicen nada sin la comparacion contra la toma
 * anterior — que es lo unico que distingue "creci" de "me mido distinto".
 *
 * Va contra el servidor y no por localStorage: se carga sentado despues de
 * medirse, no en el gimnasio sin señal, y el entrenador tiene que poder verlas.
 */
export default function MedidasScreen({ onClose }) {
  const [tomas, setTomas] = useState([]);
  const [estado, setEstado] = useState("cargando");
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(null); // { fecha, valores, nota }
  const [abierto, setAbierto] = useState("bascula");

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/medidas");
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setTomas(d.medidas || []);
      setEstado("listo");
    } catch { setEstado("error"); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const ultima = tomas[0] || null;
  const anterior = tomas[1] || null;

  const ficha = useMemo(() => {
    if (!ultima) return null;
    return {
      d: derivadas(ultima.valores),
      r: ratios(ultima.valores),
      p: proporciones(ultima.valores),
      a: asimetrias(ultima.valores),
      delta: anterior ? contra(ultima.valores, anterior.valores) : {},
    };
  }, [ultima, anterior]);

  const nuevaToma = () => {
    const hoy = new Date().toISOString().slice(0, 10);
    // La altura se arrastra: no cambia y volver a medirla cada vez es una
    // invitacion a cargarla distinta.
    setEditando({
      fecha: hoy,
      valores: ultima?.valores?.altura ? { altura: ultima.valores.altura } : {},
      nota: "",
    });
    setAbierto("bascula");
  };

  const guardar = async () => {
    setEstado("guardando");
    setError(null);
    try {
      const r = await fetch("/api/medidas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editando),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error); setEstado("listo"); return; }
      setEditando(null);
      await cargar();
    } catch {
      setError("Sin conexión. No se guardó.");
      setEstado("listo");
    }
  };

  const borrar = async (id) => {
    if (!window.confirm("Eliminar esta medición?")) return;
    await fetch(`/api/medidas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await cargar();
  };

  const set = (campo, v) => setEditando((e) => ({ ...e, valores: { ...e.valores, [campo]: v } }));

  /* ---------- formulario ---------- */
  if (editando) {
    const cargados = Object.values(editando.valores).filter((v) => v !== "" && v != null).length;
    return (
      <div className="screen">
        <button className="volver-top" onClick={() => setEditando(null)}>← Cancelar</button>
        <header className="top">
          <div className="brand">FORGE</div>
          <h1>Nueva medición</h1>
          <p className="sub">{cargados} dato{cargados === 1 ? "" : "s"} cargado{cargados === 1 ? "" : "s"} · dejá vacío lo que no midas</p>
        </header>

        <div className="card">
          <label className="flabel">Fecha</label>
          <input className="finput mono" type="date" value={editando.fecha}
            onChange={(e) => setEditando((x) => ({ ...x, fecha: e.target.value }))} />
          <label className="flabel">{ALTURA.label} ({ALTURA.unidad})</label>
          <input className="finput mono" inputMode="decimal" placeholder="174"
            value={editando.valores.altura ?? ""} onChange={(e) => set("altura", e.target.value)} />
          <p className="fhint">Sin altura no se puede calcular IMC ni FFMI. Se guarda con cada toma y se arrastra sola.</p>
        </div>

        {GRUPOS.map((g) => (
          <div key={g.id} className="card">
            <button className="med-grupo" onClick={() => setAbierto(abierto === g.id ? null : g.id)}>
              {abierto === g.id ? "▾" : "▸"} {g.titulo}
            </button>
            {abierto === g.id && (
              <>
                {g.ayuda && <p className="fhint" style={{ marginBottom: 10 }}>{g.ayuda}</p>}
                {g.campos.map((c) => (
                  <div key={c.id} className="med-campo">
                    <label className="flabel">{c.label} ({c.unidad})</label>
                    <input className="finput mono" inputMode="decimal" placeholder="—"
                      value={editando.valores[c.id] ?? ""} onChange={(e) => set(c.id, e.target.value)} />
                    {c.hint && <p className="fhint">{c.hint}</p>}
                  </div>
                ))}
              </>
            )}
          </div>
        ))}

        <div className="card">
          <label className="flabel">Nota</label>
          <textarea className="note-input" rows={2} value={editando.nota}
            placeholder="Cómo estabas ese día, qué cambió…"
            onChange={(e) => setEditando((x) => ({ ...x, nota: e.target.value }))} />
        </div>

        {error && <p className="ferror">{error}</p>}
        <button className="btn-primary" onClick={guardar} disabled={estado === "guardando" || !cargados}>
          {estado === "guardando" ? "Guardando…" : "Guardar medición"}
        </button>
      </div>
    );
  }

  /* ---------- vista ---------- */
  return (
    <div className="screen">
      <button className="volver-top" onClick={onClose}>← Volver</button>
      <header className="top">
        <div className="brand">FORGE</div>
        <h1>Medidas</h1>
        <p className="sub">{tomas.length} {tomas.length === 1 ? "medición" : "mediciones"} · cada 2-4 semanas alcanza</p>
      </header>

      {estado === "error" && <div className="card"><p className="fhint">No pudimos cargar tus medidas.</p></div>}

      {estado !== "error" && !ultima && (
        <div className="vacio-card">
          <p className="vacio-t">Todavía no cargaste ninguna</p>
          <p className="vacio-p">
            Peso, composición y circunferencias. Con una sola toma ya ves tus proporciones;
            con dos, ves hacia dónde vas.
          </p>
          <button className="btn-primary" onClick={nuevaToma}>Cargar la primera</button>
        </div>
      )}

      {ultima && ficha && (
        <>
          <button className="btn-primary" onClick={nuevaToma}>+ Nueva medición</button>

          <div className="card">
            <div className="cardtitle">Composición · {ultima.fecha}</div>
            <div className="med-grid">
              <Dato label="Peso" v={ultima.valores.peso} u="kg" d={ficha.delta.peso} />
              <Dato label="% Grasa" v={ultima.valores.grasaPct} u="%" d={ficha.delta.grasaPct} inverso />
              <Dato label="Masa magra" v={ficha.d.masaMagra} u="kg" d={ficha.delta.masaMagra} />
              <Dato label="Músculo" v={ultima.valores.masaMuscular} u="kg" d={ficha.delta.masaMuscular} />
              <Dato label="IMC" v={ficha.d.imc} d={ficha.delta.imc} />
              <Dato label="FFMI" v={ficha.d.ffmi} d={ficha.delta.ffmi} />
              <Dato label="% Agua" v={ficha.d.aguaPct} u="%" d={ficha.delta.aguaPct} />
              <Dato label="Cintura" v={ultima.valores.cintura} u="cm" d={ficha.delta.cintura} inverso />
            </div>
            {anterior && <p className="fhint" style={{ marginTop: 10 }}>Δ contra el {anterior.fecha}.</p>}
          </div>

          {ficha.a.length > 0 && (
            <div className="card">
              <div className="cardtitle">Simetría</div>
              <p className="fhint" style={{ marginBottom: 10 }}>Izquierdo contra derecho. Más de 3% deja de ser variación de medición.</p>
              {ficha.a.map((x) => (
                <div key={x.id} className={`med-asim ${x.alerta ? "alerta" : ""}`}>
                  <span className="med-asim-n">{x.label}</span>
                  <span className="mono">D {x.D} · I {x.I}</span>
                  <span className={`med-asim-p mono ${x.alerta ? "mal" : "bien"}`}>
                    {x.pct > 0 ? "+" : ""}{x.pct}%
                  </span>
                </div>
              ))}
              {ficha.a.some((x) => x.alerta) && (
                <p className="fhint" style={{ marginTop: 8 }}>
                  Una asimetría marcada se corrige con series extra del lado chico, empezando por él.
                  Si tu programa tiene ejercicios de un solo brazo, son los que no hay que saltear.
                </p>
              )}
            </div>
          )}

          <div className="card">
            <div className="cardtitle">Proporciones</div>
            <p className="fhint" style={{ marginBottom: 10 }}>Objetivos por regla clásica. El cuello es el ancla: casi no cambia.</p>
            {ficha.p.map((x) => (
              <div key={x.id} className="med-prop">
                <div className="med-prop-l">
                  <span className="med-prop-n">{x.label}</span>
                  <span className="med-prop-r">{x.regla}</span>
                </div>
                <span className="mono">{x.actual ?? "—"}</span>
                <span className="med-prop-t mono">/ {x.target ?? "—"}</span>
                <span className={`med-prop-d mono ${x.ok ? "bien" : "falta"}`}>
                  {x.delta === null ? "" : `${x.delta > 0 ? "+" : ""}${x.delta}`}
                </span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="cardtitle">Ratios</div>
            {ficha.r.map((x) => (
              <div key={x.id} className="med-ratio">
                <div>
                  <div className="med-prop-n">{x.label}</div>
                  <div className="med-prop-r">{x.nota}</div>
                </div>
                <span className="mono">{x.actual ?? "—"}</span>
                <span className="med-prop-t mono">{x.mejor === "alto" ? "≥" : "≤"} {x.ideal}</span>
                <span className={x.ok === null ? "" : x.ok ? "med-ok" : "med-falta"}>{x.ok === null ? "" : x.ok ? "✓" : "↑"}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="cardtitle">Historial</div>
            {tomas.map((t) => (
              <div key={t.id} className="med-hist">
                <div>
                  <div className="med-prop-n">{t.fecha}</div>
                  <div className="med-prop-r">
                    {t.valores.peso ? `${t.valores.peso} kg` : "sin peso"}
                    {t.valores.cintura ? ` · cintura ${t.valores.cintura}` : ""}
                    {t.nota ? ` · ${t.nota}` : ""}
                  </div>
                </div>
                <button className="med-borrar" onClick={() => borrar(t.id)} aria-label="Eliminar">×</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Dato({ label, v, u, d, inverso }) {
  const sube = d > 0;
  const bien = d === undefined || d === 0 ? null : inverso ? !sube : sube;
  return (
    <div className="med-dato">
      <div className="med-dato-l">{label}</div>
      <div className="med-dato-v mono">{v ?? "—"}{v != null && u ? <small> {u}</small> : null}</div>
      {d !== undefined && d !== 0 && (
        <div className={`med-dato-d mono ${bien ? "bien" : "mal"}`}>{sube ? "+" : ""}{d}</div>
      )}
    </div>
  );
}
