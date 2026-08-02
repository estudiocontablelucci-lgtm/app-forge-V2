/**
 * Mail de invitacion a un alumno. Mismo camino que el magic link: HTTP a
 * Resend, sin nodemailer.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** URL base de la app. En Vercel viene de NEXTAUTH_URL; en dev, localhost. */
export function baseUrl() {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

export async function enviarInvitacion({ para, token, entrenador, espacio }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, motivo: "sin-resend" };

  const url = `${baseUrl()}/invitacion/${token}`;
  const quien = entrenador || "Tu entrenador";

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: para,
      subject: `${quien} te invitó a entrenar en FORGE`,
      text: `${quien} te invitó a entrenar con él en FORGE.\n\nAceptá la invitación acá:\n${url}\n\n`
        + `El link vence en 14 días. Si no esperabas esto, ignorá el mail.`,
      html: plantilla({ url, quien, espacio }),
    }),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    return { ok: false, motivo: `resend-${res.status}`, detalle: detalle.slice(0, 200) };
  }
  return { ok: true };
}

function plantilla({ url, quien, espacio }) {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#F2F2F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" style="max-width:430px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
      <tr><td>
        <h1 style="margin:0 0 8px;font-size:22px;color:#111;">FORGE</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#444;">
          <strong>${quien}</strong> te invitó a entrenar con él${espacio ? ` en <strong>${espacio}</strong>` : ""}.
          Vas a ver tu rutina, registrar tus series y él va a poder seguir tu progreso.
        </p>
        <a href="${url}"
           style="display:block;background:#2C6BED;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-size:16px;font-weight:600;">
          Aceptar invitación
        </a>
        <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#888;">
          El link vence en 14 días. Si no esperabas esta invitación, ignorá este mail.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;
}
