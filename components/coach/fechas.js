/**
 * Como se escriben las fechas en la seccion de entrenador.
 *
 * Vivian dentro de `AlumnoFicha`, y cuando la LISTA de alumnos tambien tuvo que
 * decir cuando entreno cada uno la opcion era copiarlas: dos "hace 3 días" que
 * se separan al primer cambio.
 */

export function fmtFecha(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

/**
 * "hoy" / "ayer" / "hace 3 días". El entrenador no necesita la fecha exacta,
 * necesita saber si el alumno esta entrenando o desaparecio.
 */
export function haceCuanto(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const dias = Math.floor((Date.now() - t) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  return fmtFecha(iso);
}
