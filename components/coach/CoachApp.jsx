"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AlumnoFicha from "./AlumnoFicha";
import "./coach.css";

/**
 * Seccion de entrenador: lugar propio, fuera del modal de Perfil.
 *
 * Vive en su propia ruta y no como una quinta pestana de la app del atleta por
 * dos razones. La primera es de forma: la app del atleta esta clavada a 430px
 * porque se usa con una mano en el gimnasio, y planificar necesita ancho. La
 * segunda es que la mayoria de los usuarios entrena solo, y no les corresponde
 * una pestana de alumnos que nunca van a abrir.
 *
 * Lee del servidor en cada carga: son datos de otras personas y no tiene
 * sentido cachearlos. El offline-first es del atleta, que entrena sin senal.
 */
export default function CoachApp() {
  const { data: session, status } = useSession();
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState("cargando");
  const [seleccionado, setSeleccionado] = useState(null);
  const [email, setEmail] = useState("");
  const [invitando, setInvitando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);
  const [confirmarBaja, setConfirmarBaja] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/coach");
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setDatos(d);
      // La seleccion se refresca contra la lista nueva: si al alumno abierto lo
      // dieron de baja, la ficha se cierra en vez de quedar mostrando datos que
      // el entrenador ya no tiene derecho a ver.
      setSeleccionado((actual) => (actual ? d.alumnos?.find((a) => a.id === actual.id) || null : null));
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  }, []);

  useEffect(() => { if (status !== "loading") cargar(); }, [cargar, status]);

  const invitar = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setInvitando(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error); return; }
      setEmail("");
      setAviso(d.mailEnviado
        ? `Invitación enviada a ${d.email}.`
        : `Invitación creada, pero el mail no salió (${d.motivoMail}). Pasale el link a mano.`);
      await cargar();
    } catch {
      setError("Sin conexión.");
    } finally {
      setInvitando(false);
    }
  };

  const bajar = async (alumno) => {
    setConfirmarBaja(null);
    await fetch(`/api/coach?alumno=${encodeURIComponent(alumno.id)}`, { method: "DELETE" });
    if (seleccionado?.id === alumno.id) setSeleccionado(null);
    setAviso(`${alumno.name || alumno.email} ya no es tu alumno. Su historial queda en su cuenta.`);
    await cargar();
  };

  const revocar = async (inv) => {
    await fetch(`/api/coach?invitacion=${encodeURIComponent(inv.id)}`, { method: "DELETE" });
    await cargar();
  };

  if (status === "unauthenticated") {
    return (
      <div className="coach">
        <Barra />
        <div className="coach-layout"><div className="ccard cvacio">
          Entrá con tu cuenta para ver tu espacio de entrenador.
          <div style={{ marginTop: 14 }}><a className="cbtn pri" href="/login">Entrar</a></div>
        </div></div>
      </div>
    );
  }

  if (estado === "cargando" || status === "loading") {
    return <div className="coach"><Barra /><div className="coach-layout"><div className="ccard cvacio">Cargando…</div></div></div>;
  }
  if (estado === "error") {
    return <div className="coach"><Barra /><div className="coach-layout"><div className="ccard cvacio">No pudimos cargar tu espacio. Revisá la conexión.</div></div></div>;
  }

  const { coach, alumnos = [], invitaciones = [] } = datos || {};
  const lleno = coach && coach.usados >= coach.maxAthletes;

  return (
    <div className="coach">
      <Barra nombre={session?.user?.name} />

      <div className={`coach-layout ${seleccionado ? "viendo" : ""}`}>
        <aside className="coach-side">
          <div className="ccard">
            <div className="ccard-head">
              <h2>Alumnos</h2>
              {coach && <span className="ccard-sub">{coach.usados} de {coach.maxAthletes}</span>}
            </div>

            {alumnos.length === 0 && (
              <p className="chint">
                Todavía no tenés alumnos. Tu espacio se crea solo, al invitar a la primera persona.
              </p>
            )}

            <div className="alista">
              {alumnos.map((a) => (
                <button key={a.id} className={`aitem ${seleccionado?.id === a.id ? "on" : ""}`}
                  onClick={() => setSeleccionado(a)}>
                  <span className="aini">{(a.name || a.email || "?").trim().charAt(0).toUpperCase()}</span>
                  <span className="ainfo">
                    <span className="aname">{a.name || a.email}</span>
                    <span className="asub">{a.email}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {invitaciones.length > 0 && (
            <div className="ccard">
              <div className="ccard-head"><h2>Invitaciones</h2><span className="ccard-sub">sin aceptar</span></div>
              {invitaciones.map((i) => (
                <div key={i.id} className="prow">
                  <div className="pinfo">
                    <div className="pname">{i.email}</div>
                    <div className="psub">pendiente</div>
                  </div>
                  <div className="pacc">
                    <button className="cbtn chico" onClick={() => revocar(i)}>Cancelar</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="ccard">
            <div className="ccard-head"><h2>Invitar</h2></div>
            <form className="cform" onSubmit={invitar}>
              <input className="cinput" type="email" inputMode="email" placeholder="email@ejemplo.com"
                value={email} onChange={(e) => setEmail(e.target.value)} disabled={lleno} />
              <button className="cbtn pri" type="submit" disabled={invitando || lleno || !email.trim()}>
                {invitando ? "Enviando…" : "Invitar"}
              </button>
            </form>
            {lleno && <p className="chint" style={{ marginTop: 8 }}>Llegaste al máximo. Dá de baja a alguno para liberar lugar.</p>}
            {error && <p className="cerror">{error}</p>}
            {aviso && <p className="caviso">{aviso}</p>}
          </div>
        </aside>

        <main className="coach-main">
          {seleccionado
            ? <AlumnoFicha alumno={seleccionado} onVolver={() => setSeleccionado(null)} onBaja={setConfirmarBaja} />
            : (
              <div className="ccard cvacio">
                {alumnos.length
                  ? "Elegí un alumno para ver cómo le está yendo."
                  : "Invitá a tu primer alumno y su seguimiento aparece acá."}
              </div>
            )}
        </main>
      </div>

      {confirmarBaja && (
        <div className="coverlay" onClick={() => setConfirmarBaja(null)}>
          <div className="cmodal" onClick={(e) => e.stopPropagation()}>
            <h3>Dar de baja a {confirmarBaja.name || confirmarBaja.email}</h3>
            <p className="chint">
              Dejás de ver sus entrenamientos y se libera un lugar.
              <strong> No se borra nada</strong>: su historial sigue siendo suyo y, si vuelve,
              se reactiva con todo lo anterior.
            </p>
            <div className="cmodal-acc">
              <button className="cbtn" onClick={() => setConfirmarBaja(null)}>Cancelar</button>
              <button className="cbtn peligro" onClick={() => bajar(confirmarBaja)}>Dar de baja</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Barra({ nombre }) {
  return (
    <header className="coach-top">
      <span className="coach-brand">FORGE</span>
      <span className="sep">/</span>
      <h1>Entrenador</h1>
      <span className="coach-spacer" />
      {nombre && <span className="ccard-sub coach-quien">{nombre}</span>}
      <a className="coach-volver" href="/">← Mi entrenamiento</a>
    </header>
  );
}
