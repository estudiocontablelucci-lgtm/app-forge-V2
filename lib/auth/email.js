/**
 * Envio del magic link via Resend.
 *
 * NextAuth trae un `sendVerificationRequest` que asume nodemailer y SMTP.
 * Resend es HTTP, asi que se reemplaza por un fetch a su API — una dependencia
 * menos y funciona igual en serverless.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendMagicLink({ identifier, url, provider }) {
  const host = new URL(url).host;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: provider.from,
      to: identifier,
      subject: "Tu acceso a FORGE",
      text: `Entra a FORGE con este link (vence en 15 minutos):\n\n${url}\n\nSi no lo pediste, ignora este mail.`,
      html: htmlTemplate({ url, host }),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // El error tiene que cortar el login: si no, NextAuth muestra "revisa tu
    // correo" para un mail que nunca salio.
    throw new Error(`Resend fallo (${res.status}): ${detail.slice(0, 200)}`);
  }
}

function htmlTemplate({ url, host }) {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#F2F2F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" style="max-width:430px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
      <tr><td>
        <h1 style="margin:0 0 8px;font-size:22px;color:#111;">FORGE</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#444;">
          Toca el boton para entrar. El link vence en 15 minutos y sirve una sola vez.
        </p>
        <a href="${url}"
           style="display:block;background:#2C6BED;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-size:16px;font-weight:600;">
          Entrar a FORGE
        </a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#888;">
          Si no pediste este acceso a ${host}, ignora este mail.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;
}
