"use client";

import { useState } from "react";

/**
 * Una ayuda que se queda.
 *
 * No es un tour de bienvenida. Un tour explica todo el primer dia, cuando
 * todavia no hay ninguna pregunta, y no esta el dia que la pregunta aparece —
 * que en esta app es a mitad de una serie, mirando un punto de color que nadie
 * explico nunca. Estas viven en la pantalla donde nace la duda y no se van.
 *
 * Cerradas ocupan una linea. Quien ya sabe lo que es un e1RM las apaga enteras
 * desde el Perfil (`prefs.ayudas`) y no las ve mas.
 */
export default function Ayuda({ titulo, children, mostrar = true, abiertaPorDefecto = false }) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  if (!mostrar) return null;
  return (
    <>
      <button
        type="button"
        className={`ayuda-i ${abierta ? "on" : ""}`}
        aria-expanded={abierta}
        onClick={(e) => { e.stopPropagation(); setAbierta((a) => !a); }}
      >
        <span className="ayuda-glifo" aria-hidden="true">?</span>
        {titulo}
      </button>
      {abierta && <div className="ayuda-txt">{children}</div>}
    </>
  );
}
