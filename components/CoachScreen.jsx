"use client";

import { useEffect, useState } from "react";
import AlumnoDetalle from "./AlumnoDetalle";

/**
 * Espacio de entrenador: invitar, ver alumnos y dar de baja.
 *
 * Lee del servidor en cada carga, no de localStorage: son datos de otras
 * personas y no tiene sentido cachearlos en el telefono del entrenador.
 */
export default function CoachScreen() {
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState("cargando");
  const [email, setEmail] = useState("");
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);
  const [confirmarBaja, setConfirmarBaja] = useState(null);
  const [verAlumno, setVerAlumno] = useState(null);

  const cargar = async () => {
    try {
      const r = await fetch("/api/coach");
      if (!r.ok) throw new Error(String(r.status));
      setDatos(await r.json());
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  };

  useEffect(() => { cargar(); }, []);

  const invitar = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setEstado("enviando");
    setError(null);
    setAviso(null);
    try {
      const r = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error); setEstado("listo"); return; }
      setEmail("");
      setAviso(data.mailEnviado
        ? `Invitación enviada a ${data.email}.`
        : `Invitación creada, pero el mail no salió (${data.motivoMail}). Pasale el link a mano.`);
      await cargar();
    } catch {
      setError("Sin conexión.");
      setEstado("listo");
    }
  };

  const bajar = async (alumno) => {
    setConfirmarBaja(null);
    await fetch(`/api/coach?alumno=${encodeURIComponent(alumno.id)}`, { method: "DELETE" });
    setAviso(`${alumno.name} ya no es tu alumno. Su historial queda en su cuenta.`);
    await cargar();
  };

  const revocar = async (inv) => {
    await fetch(`/api/coach?invitacion=${encodeURIComponent(inv.id)}`, { method: "DELETE" });
    await cargar();
  };

  if (verAlumno) return <AlumnoDetalle alumno={verAlumno} onVolver={() => { setVerAlumno(null); cargar(); }} />;

  if (estado === "cargando") return <div className="empty">Cargando…</div>;
  if (estado === "error") return <div className="empty">No pudimos cargar tu espacio. Revisá la conexión.</div>;

  const { coach, alumnos = [], invitaciones = [] } = datos || {};
  const lleno = coach && coach.usados >= coach.maxAthletes;
  const enBaja = alumnos.find((a) => a.id === confirmarBaja);

  return (
    <>
      {!coach && (
        <div className="card">
          <div className="cardtitle">Todavía no tenés alumnos</div>
          <p className="fhint">
            Tu espacio de entrenador se crea solo cuando invitás a la primera persona.
            No hace falta configurar nada antes.
          </p>
        </div>
      )}

      <div className="card">
        <div className="cardtitle">Invitar alumno</div>
        <form onSubmit={invitar}>
          <input className="finput" type="email" inputMode="email" placeholder="email@ejemplo.com"
            value={email} onChange={(e) => setEmail(e.target.value)} disabled={lleno} />
          <button className="btn-primary" type="submit" disabled={estado === "enviando" || lleno || !email.trim()}>
            {estado === "enviando" ? "Enviando…" : "Enviar invitación"}
          </button>
        </form>
        {coach && (
          <p className="fhint">
            {coach.usados} de {coach.maxAthletes} lugares ocupados
            {lleno && " — dá de baja a alguno para liberar lugar."}
          </p>
        )}
        {error && <p className="ferror">{error}</p>}
        {aviso && <p className="fhint aviso">{aviso}</p>}
      </div>

      {invitaciones.length > 0 && (
        <div className="card">
          <div className="cardtitle">Invitaciones pendientes</div>
          {invitaciones.map((i) => (
            <div key={i.id} className="alumno-row">
              <div>
                <div className="alumno-name">{i.email}</div>
                <div className="alumno-sub">sin aceptar todavía</div>
              </div>
              <button className="alumno-baja" onClick={() => revocar(i)}>Cancelar</button>
            </div>
          ))}
        </div>
      )}

      {enBaja && (
        <div className="overlay" onClick={() => setConfirmarBaja(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheethead"><h3>{enBaja.name}</h3><button className="x" onClick={() => setConfirmarBaja(null)}>&times;</button></div>
            <div style={{ padding: "0 4px 4px" }}>
              <p className="fhint">
                Al darlo de baja dejás de ver sus entrenamientos y se libera un lugar.
                <strong> No se borra nada</strong>: su historial sigue siendo suyo y, si vuelve,
                se reactiva con todo lo anterior.
              </p>
              <button className="btn-peligro" onClick={() => bajar(enBaja)}>Dar de baja a {enBaja.name.split(" ")[0]}</button>
              <button className="btn-ghost" onClick={() => setConfirmarBaja(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {alumnos.length > 0 && (
        <div className="card">
          <div className="cardtitle">Alumnos</div>
          {alumnos.map((a) => (
            <div key={a.id} className="alumno-row">
              <button className="alumno-abrir" onClick={() => setVerAlumno(a)}>
                <div className="alumno-name">{a.name}</div>
                <div className="alumno-sub">{a.email}</div>
              </button>
              <button className="alumno-mas" onClick={() => setConfirmarBaja(a.id)} aria-label={`Opciones de ${a.name}`}>⋯</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
