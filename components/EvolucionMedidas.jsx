"use client";

import { useMemo, useState } from "react";
import { derivadas } from "@/lib/medidas";

/**
 * La evolucion de lo que se mide con cinta y balanza.
 *
 * El peso vivia en el Perfil como UN numero sin fecha —se corregia y no quedaba
 * rastro del anterior— mientras `body_measurements` guardaba una toma por fecha
 * desde el primer dia. O sea: el historial existia y no habia donde verlo. Esto
 * es esa vista, en Progreso, que es donde uno va a preguntarse si algo cambio.
 *
 * UNA metrica por vez, con selector. No es minimalismo: peso (kg), grasa (%) y
 * cintura (cm) no comparten escala, y meterlas en el mismo grafico obliga a dos
 * ejes — la trampa mas comun de un grafico y la que hace que dos series se
 * crucen donde el dato no se cruza.
 */

/**
 * Lo que se puede seguir en el tiempo.
 *
 * `bueno` dice para donde es mejorar, y **el PESO no lo tiene a proposito**:
 * bajar no es bueno ni malo sin saber que se estaba buscando. Pintarlo de rojo
 * seria que la app opine sobre el objetivo de alguien — en una recomposicion
 * ese mismo -2 kg es exactamente el plan. Sin `bueno`, el numero va en gris y
 * lo interpreta quien lo mide.
 */
const METRICAS = [
  { id: "peso", label: "Peso", unidad: "kg", de: (v) => v.peso },
  { id: "grasaPct", label: "% Grasa", unidad: "%", de: (v) => v.grasaPct, bueno: "abajo" },
  { id: "masaMagra", label: "Masa magra", unidad: "kg", de: (v) => derivadas(v).masaMagra, bueno: "arriba" },
  { id: "cintura", label: "Cintura", unidad: "cm", de: (v) => v.cintura, bueno: "abajo" },
  { id: "ffmi", label: "FFMI", unidad: "", de: (v) => derivadas(v).ffmi, bueno: "arriba" },
];

const num = (x) => (x === null || x === undefined || x === "" || Number.isNaN(Number(x)) ? null : Number(x));
const r1 = (x) => Math.round(x * 10) / 10;

export default function EvolucionMedidas({ tomas = [] }) {
  const [metrica, setMetrica] = useState("peso");

  // Las tomas llegan de la mas nueva a la mas vieja; un grafico de tiempo se
  // lee al reves.
  const serie = useMemo(() => {
    const def = METRICAS.find((m) => m.id === metrica);
    return [...tomas]
      .map((t) => ({ fecha: t.fecha, v: num(def.de(t.valores || {})) }))
      .filter((p) => p.v !== null)
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  }, [tomas, metrica]);

  const def = METRICAS.find((m) => m.id === metrica);
  // Solo se ofrecen las que tienen al menos un valor cargado: un selector con
  // opciones que dan un grafico vacio es una promesa que la app no cumple.
  const disponibles = METRICAS.filter((m) =>
    tomas.some((t) => num(m.de(t.valores || {})) !== null));

  if (!tomas.length) {
    return (
      <p className="fhint">
        Todavía no cargaste ninguna medición. La primera no dice nada; la segunda ya dice si algo se movió.
      </p>
    );
  }

  return (
    <>
      <div className="weekchips grupo-chips" style={{ marginBottom: 12 }}>
        {disponibles.map((m) => (
          <button key={m.id} className={`chip ${metrica === m.id ? "on" : ""}`} onClick={() => setMetrica(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      {serie.length < 2
        ? <p className="fhint">Una sola medición de {def.label.toLowerCase()}. Con la próxima aparece la evolución.</p>
        : <Linea serie={serie} def={def} />}
    </>
  );
}

/**
 * El grafico. Una linea, sin grilla y con dos etiquetas: la primera medicion y
 * la ultima. Un numero sobre cada punto convierte un grafico en una tabla mal
 * dibujada — lo que se lee de un vistazo es la forma.
 */
function Linea({ serie, def }) {
  const W = 320, H = 96, PX = 6, PY = 12;
  const vs = serie.map((p) => p.v);
  const min = Math.min(...vs), max = Math.max(...vs);
  // Rango con aire: sin esto una variacion de 400 g dibuja una montaña rusa que
  // sugiere un cambio que no existe.
  const span = Math.max(max - min, Math.abs(max) * 0.04 || 1);
  const medio = (max + min) / 2;
  const lo = medio - span * 0.75, hi = medio + span * 0.75;

  const x = (i) => PX + (i * (W - PX * 2)) / Math.max(serie.length - 1, 1);
  const y = (v) => PY + (H - PY * 2) * (1 - (v - lo) / (hi - lo));

  const puntos = serie.map((p, i) => `${x(i)},${y(p.v)}`).join(" ");
  const area = `${PX},${H - PY} ${puntos} ${x(serie.length - 1)},${H - PY}`;

  const primero = serie[0], ultimo = serie[serie.length - 1];
  const delta = r1(ultimo.v - primero.v);
  // Verde no es "subio": es "fue para donde queria ir". En grasa y cintura eso
  // es para abajo, y en el peso no es nada — sin `bueno` el numero va en gris.
  const mejor = def.bueno === "abajo" ? delta < 0 : delta > 0;
  const clase = !def.bueno || delta === 0 ? "" : mejor ? "up" : "dn";

  return (
    <div className="evo">
      <svg className="evo-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`${def.label}: de ${primero.v} a ${ultimo.v} ${def.unidad} entre ${primero.fecha} y ${ultimo.fecha}`}>
        <polygon points={area} fill="rgba(44,107,237,.10)" />
        <polyline points={puntos} fill="none" stroke="#2C6BED" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {serie.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.v)} r={i === serie.length - 1 ? 4 : 2.5}
            fill={i === serie.length - 1 ? "#2C6BED" : "#FFF"} stroke="#2C6BED" strokeWidth="1.5"
            vectorEffect="non-scaling-stroke">
            <title>{`${p.fecha} · ${p.v} ${def.unidad}`}</title>
          </circle>
        ))}
      </svg>
      <div className="evo-pie">
        <span className="evo-ext mono">{primero.v}{def.unidad}<i>{fechaCorta(primero.fecha)}</i></span>
        <span className={`evo-delta mono ${clase}`}>
          {delta > 0 ? "+" : ""}{delta}{def.unidad} en {serie.length} mediciones
        </span>
        <span className="evo-ext der mono">{ultimo.v}{def.unidad}<i>{fechaCorta(ultimo.fecha)}</i></span>
      </div>
    </div>
  );
}

function fechaCorta(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
