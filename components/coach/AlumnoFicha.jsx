"use client";

import { useCallback, useEffect, useState } from "react";
import AsignarPrograma from "./AsignarPrograma";
import EditorPrograma from "./EditorPrograma";

/**
 * Ficha de seguimiento: como le esta yendo al alumno.
 *
 * Deliberadamente NO es una lista de kilos por ejercicio. Calibrar la carga de
 * a un ejercicio por vez era el modelo de "una plantilla compartida entre
 * varios"; el modelo es un programa por alumno, que se duplica y se adapta. Lo
 * que el entrenador necesita mirar seguido es otra cosa: si entrena, si progresa
 * y si la carga esta bien puesta.
 */
export default function AlumnoFicha({ alumno, onVolver, onBaja }) {
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState("cargando");
  const [editando, setEditando] = useState(null); // id del programa que se edita

  const cargar = useCallback(async () => {
    setEstado("cargando");
    try {
      const r = await fetch(`/api/coach/alumno?alumno=${encodeURIComponent(alumno.id)}`);
      if (!r.ok) throw new Error(String(r.status));
      setDatos(await r.json());
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  }, [alumno.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const nombre = alumno.name || alumno.email;
  const pila = (nombre || "?").trim().charAt(0).toUpperCase();

  // Editar tapa la ficha entera: son dos tareas distintas y verlas a la vez, en
  // una columna de celular, no deja hacer bien ninguna de las dos.
  if (editando) {
    return (
      <EditorPrograma
        programaId={editando}
        alumno={alumno}
        onCerrar={() => setEditando(null)}
        onGuardado={cargar}
      />
    );
  }

  return (
    <>
      <button className="cbtn chico solo-mobile" onClick={onVolver}>← Alumnos</button>

      <div className="ccard">
        <div className="ficha-head">
          <span className="ficha-ini">{pila}</span>
          <div style={{ minWidth: 0 }}>
            <div className="ficha-nombre">{nombre}</div>
            <div className="ficha-mail">{alumno.email}</div>
          </div>
          <div className="ficha-acc">
            <button className="cbtn chico" onClick={cargar} disabled={estado === "cargando"}>
              {estado === "cargando" ? "…" : "Actualizar"}
            </button>
            <button className="cbtn chico peligro" onClick={() => onBaja(alumno)}>Dar de baja</button>
          </div>
        </div>
      </div>

      {estado === "error" && (
        <div className="ccard"><p className="chint">No pudimos cargar los datos de {nombre}. Revisá la conexión.</p></div>
      )}

      {estado !== "error" && datos && (
        <>
          <Resumen programa={datos.programa} ficha={datos.ficha} onEditar={() => setEditando(datos.programa.id)} />
          {datos.ficha && (
            <>
              <AlertasRir alertas={datos.ficha.alertasRir} />
              <Notas notas={datos.ficha.notas} nombre={nombre} />
              <Tonelaje tonelaje={datos.ficha.tonelaje} programa={datos.programa} />
              <TablaE1rm filas={datos.ficha.e1rm} programa={datos.programa} />
            </>
          )}
          <AsignarPrograma alumno={alumno} onAsignado={cargar} onEditar={setEditando} />
        </>
      )}
    </>
  );
}

/* ---------- resumen ---------- */

function Resumen({ programa, ficha, onEditar }) {
  if (!programa) {
    return (
      <div className="ccard">
        <div className="ccard-head"><h2>Programa</h2></div>
        <p className="chint">
          Todavía no le asignaste ninguno. Hasta que entrene con un programa tuyo no
          hay nada que medir.
        </p>
      </div>
    );
  }

  const { adherencia: ad, ultimo, semanaEnCurso } = ficha;
  const tono = ad.pct === null ? "" : ad.pct >= 100 ? "bien" : ad.pct >= 50 ? "" : "flojo";

  return (
    <div className="ccard">
      <div className="ccard-head">
        <h2>{programa.name}</h2>
        <span className="ccard-sub">
          {programa.exercises} ejercicios · {programa.weeks} semanas
          {onEditar && <button className="cbtn chico" style={{ marginLeft: 10 }} onClick={onEditar}>Editar</button>}
        </span>
      </div>
      <div className="mgrid">
        <div className="mtile">
          <div className="mlabel">Semana en curso</div>
          <div className="mval">
            {semanaEnCurso === null ? "—" : semanaEnCurso === "DL" ? "Deload" : semanaEnCurso}
            {semanaEnCurso !== null && semanaEnCurso !== "DL" && <small> de {programa.weeks}</small>}
          </div>
          <div className="mnota">{semanaEnCurso === null ? "sin entrenar todavía" : `${programa.sessions.length} sesiones por semana`}</div>
        </div>

        <div className="mtile">
          <div className="mlabel">Adherencia · 7 días</div>
          <div className={`mval ${tono}`}>{ad.hechas}<small> de {ad.programadas}</small></div>
          <div className="mnota">{ad.pct === null ? "sin programa" : `${ad.pct}% de lo programado`}</div>
        </div>

        <div className="mtile">
          <div className="mlabel">Último entrenamiento</div>
          <div className="mval" style={{ fontSize: 18 }}>{ultimo ? haceCuanto(ultimo.date) : "—"}</div>
          <div className="mnota">
            {ultimo
              ? `${etiquetaSemana(ultimo.week)} · ${ultimo.sessionName || ultimo.session}${ultimo.duration ? ` · ${ultimo.duration} min` : ""}`
              : "nunca registró una sesión"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- alertas de RIR ---------- */

/**
 * El aviso que justifica que exista esta pantalla: el alumno reporta cuantas
 * reps le sobraban y eso dice si la carga esta bien puesta. Mas de un punto de
 * desvio sostenido no es ruido, es una prescripcion que hay que corregir.
 */
function AlertasRir({ alertas }) {
  if (!alertas?.length) return null;
  return (
    <div className="ccard">
      <div className="ccard-head">
        <h2>Carga a revisar</h2>
        <span className="ccard-sub">RIR reportado vs objetivo</span>
      </div>
      {alertas.map((a) => (
        <div key={a.id} className={`alerta ${a.sentido === "pesado" ? "pesado" : ""}`}>
          <span className="alerta-ico">{a.sentido === "liviano" ? "↑" : "↓"}</span>
          <div className="alerta-txt">
            <b>{a.name}</b> — {a.sentido === "liviano" ? "le está quedando liviano" : "le está quedando pesado"}.
            <div className="alerta-det">
              RIR objetivo {a.objetivo} · reportó <span className="mono">{a.promedio}</span> en promedio
              ({a.series} {a.series === 1 ? "serie" : "series"}, {etiquetaSemana(a.semana)}) ·
              desvío <span className="mono">{a.desvio > 0 ? "+" : ""}{a.desvio}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- notas ---------- */

function Notas({ notas, nombre }) {
  const primero = (nombre || "").split(" ")[0];
  return (
    <div className="ccard">
      <div className="ccard-head">
        <h2>Notas de {primero}</h2>
        <span className="ccard-sub">al cerrar cada sesión</span>
      </div>
      {notas?.length
        ? notas.map((n) => (
          <div key={n.id} className="nota">
            <div className="nota-meta">
              {fmtFecha(n.date)} · {etiquetaSemana(n.week)} · {n.sessionName || n.session}
            </div>
            <div className="nota-txt">{n.note}</div>
          </div>
        ))
        : <p className="chint">Todavía no dejó ninguna. Las escribe al terminar de entrenar.</p>}
    </div>
  );
}

/* ---------- tonelaje ---------- */

function Tonelaje({ tonelaje, programa }) {
  if (!tonelaje?.length) return null;
  const hecho = Object.fromEntries(tonelaje.map((t) => [t.week, t.kg]));
  // Las mismas columnas que la tabla de e1RM: el grafico se lee contra el
  // programa completo, no contra lo que se entreno.
  const semanas = semanasDelPrograma(programa);
  const max = Math.max(...tonelaje.map((t) => t.kg), 1);

  return (
    <div className="ccard">
      <div className="ccard-head">
        <h2>Tonelaje por semana</h2>
        <span className="ccard-sub">kg totales movidos</span>
      </div>
      <div className="tbars">
        {semanas.map((w) => {
          const kg = hecho[w] || 0;
          return (
            <div key={w} className={`tbar ${w === "DL" ? "dl" : ""} ${kg ? "" : "sin"}`}>
              <span className="tbar-val mono">{kg ? miles(kg) : "·"}</span>
              <div className="tbar-fill" style={{ height: `${kg ? Math.max(4, (kg / max) * 100) : 4}%` }} />
              <span className="tbar-cap">{w === "DL" ? "DL" : `S${w}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- e1RM ---------- */

function TablaE1rm({ filas, programa }) {
  if (!filas?.length) {
    return (
      <div className="ccard">
        <div className="ccard-head"><h2>e1RM por ejercicio</h2></div>
        <p className="chint">Cuando registre series con kilos y repeticiones, aparece acá.</p>
      </div>
    );
  }

  const cols = semanasDelPrograma(programa);

  return (
    <div className="ccard">
      <div className="ccard-head">
        <h2>e1RM por ejercicio</h2>
        <span className="ccard-sub">Brzycki · kg estimados</span>
      </div>
      <div className="ctabla-wrap">
        <table className="ctabla">
          <thead>
            <tr>
              <th>Ejercicio</th>
              {cols.map((w) => <th key={w}>{w === "DL" ? "DL" : `S${w}`}</th>)}
              <th>Δ</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td>
                  {f.name}
                  {f.retirado && <span className="retirado">fuera del plan</span>}
                </td>
                {cols.map((w) => (
                  <td key={w} className={`mono ${f.porSemana[w] ? "" : "vacio"}`}>
                    {f.porSemana[w] || "·"}
                  </td>
                ))}
                <td className={`mono delta ${f.delta > 0 ? "sube" : f.delta < 0 ? "baja" : ""}`}>
                  {f.delta === null ? "·" : `${f.delta > 0 ? "+" : ""}${f.delta}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- formato ---------- */

/**
 * Las semanas del programa, no las entrenadas. Es lo que hace que una semana
 * en blanco se lea como una semana que falta y no como una que no existe.
 */
function semanasDelPrograma(programa) {
  const cols = Array.from({ length: programa?.weeks || 4 }, (_, i) => String(i + 1));
  if (programa?.hasDeload) cols.push("DL");
  return cols;
}

function etiquetaSemana(w) {
  return String(w) === "DL" ? "Deload" : `Sem ${w}`;
}

function miles(n) {
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n);
}

function fmtFecha(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

/**
 * "hoy" / "ayer" / "hace 3 días". El entrenador no necesita la fecha exacta,
 * necesita saber si el alumno esta entrenando o desaparecio.
 */
function haceCuanto(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const dias = Math.floor((Date.now() - t) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  return fmtFecha(iso);
}
