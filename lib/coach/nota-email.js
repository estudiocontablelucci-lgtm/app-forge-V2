/**
 * Aviso al entrenador de que un alumno dejo una nota.
 *
 * La nota se escribe al cerrar la sesion, viaja con ella y se muestra en la
 * ficha. Lo que faltaba era que ALGUIEN AVISARA: sin esto el entrenador se
 * entera cuando entra a la ficha por otro motivo, que puede ser nunca — y la
 * nota tipica es "me molesto el hombro", que pierde todo su valor tres semanas
 * despues.
 *
 * Mismo camino que la invitacion: HTTP a Resend, sin nodemailer.
 *
 * Se manda SOLO cuando hay nota. Un mail por cada sesion terminada seria ruido
 * y el ruido se filtra: en dos semanas el entrenador manda la carpeta a spam y
 * el aviso que importa se pierde con el resto.
 *
 * El mail NO transcribe la nota, y eso es a proposito. La nota tipica dice
 * "me molesto el hombro": bajo la Ley 25.326 eso es dato sensible de un tercero,
 * y copiarlo al mail lo saca del unico lugar donde el acceso esta controlado
 * —la ficha, detras del vinculo activo— para dejarlo en una casilla, en el
 * proveedor de correo y en cualquier reenvio. El aviso dice QUE hay una nota y
 * de quien; leerla es entrar.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function baseUrl() {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

/**
 * @param {object} p
 * @param {string} p.para        mail del entrenador
 * @param {string} p.alumno      como llamarlo (nombre o mail)
 * @param {string} p.nota        lo que escribio
 * @param {string} [p.sesion]    nombre de la sesion ("Fullbody A")
 * @param {string|number} [p.semana]
 */
export async function avisarNota({ para, alumno, nota, sesion, semana }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, motivo: "sin-resend" };
  if (!para || !String(nota || "").trim()) return { ok: false, motivo: "sin-nota" };

  const donde = [semana != null ? (semana === "DL" ? "Deload" : `Semana ${semana}`) : null, sesion]
    .filter(Boolean).join(" · ");
  const url = `${baseUrl()}/entrenador`;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: para,
      // El asunto lleva el nombre y no "tenés una notificación": es lo unico
      // que se lee cuando el mail llega al telefono.
      subject: `${alumno} dejó una nota${donde ? ` — ${donde}` : ""}`,
      text: `${alumno} terminó de entrenar${donde ? ` (${donde})` : ""} y dejó una nota.\n\n`
        + `Leela en su ficha: ${url}\n\n`
        + `La nota no viaja en este mail: puede tener molestias o lesiones, y eso se lee `
        + `donde el acceso está controlado.`,
      html: plantilla({ alumno, donde, url }),
    }),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    return { ok: false, motivo: `resend-${res.status}`, detalle: detalle.slice(0, 200) };
  }
  return { ok: true };
}

function escapar(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function plantilla({ alumno, donde, url }) {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#F2F2F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#FFF;border-radius:16px;padding:28px 24px;">
      <div style="font:700 12px/1 sans-serif;letter-spacing:.18em;color:#2C6BED;">F O R G E</div>
      <h1 style="font-size:19px;margin:14px 0 4px;color:#1C1C1E;">${escapar(alumno)} dejó una nota</h1>
      ${donde ? `<p style="margin:0 0 18px;font-size:13px;color:#8E8E93;">${escapar(donde)}</p>` : ""}
      <a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#2C6BED;color:#FFF;text-decoration:none;font-weight:600;font-size:15px;">Leerla en su ficha</a>
      <p style="margin:20px 0 0;font-size:12px;color:#AEAEB2;line-height:1.5;">
        La nota no viaja en este mail: puede hablar de molestias o lesiones, y eso se lee
        donde el acceso está controlado. Te llega solo cuando un alumno escribe algo al
        terminar de entrenar.
      </p>
    </div>
  </body>
</html>`;
}
