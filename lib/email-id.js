/**
 * Forma canonica de un email, para COMPARAR dos direcciones.
 *
 * Existe por un caso real: se invito a `olgalightblue@gmail.com` y la persona
 * se registro como `olga.lightblue@gmail.com`. Para Gmail los puntos del nombre
 * de usuario no significan nada — es la misma casilla, y por eso el mail llego
 * igual. Pero la app comparaba las direcciones como texto, asi que la invitacion
 * nunca aparecio del lado de ella: no vio un error, no vio nada.
 *
 * La canonicalizacion es DELIBERADAMENTE conservadora y por dominio. Sacar los
 * puntos en un dominio cualquiera es incorrecto: en la mayoria de los servidores
 * `a.b@dominio` y `ab@dominio` son dos personas distintas, y unificarlas seria
 * darle a una el acceso de la otra. Solo se aplica donde el proveedor documenta
 * que no distingue.
 *
 * No se persiste: es para comparar. La direccion se guarda como la escribieron,
 * que es la que la persona reconoce cuando la ve en pantalla.
 */

/** Dominios que ignoran los puntos del nombre de usuario. */
const SIN_PUNTOS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Dominios donde `+algo` es una etiqueta y no parte de la direccion.
 * Se listan de a uno a proposito: hay servidores donde el `+` es un caracter
 * valido del nombre de usuario.
 */
const CON_ETIQUETA = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "proton.me", "protonmail.com", "fastmail.com", "icloud.com",
]);

/** Normalizacion minima que vale para cualquier direccion. */
export function normalizarEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/**
 * Clave de comparacion. Dos direcciones con la misma clave son la misma casilla.
 *
 * Para todo lo que no sea un dominio conocido devuelve la direccion normalizada
 * tal cual: ante la duda, dos direcciones distintas son dos personas distintas.
 */
export function canonicalizarEmail(email) {
  const limpio = normalizarEmail(email);
  const corte = limpio.lastIndexOf("@");
  if (corte <= 0) return limpio;

  let usuario = limpio.slice(0, corte);
  const dominio = limpio.slice(corte + 1);

  if (CON_ETIQUETA.has(dominio)) {
    const mas = usuario.indexOf("+");
    if (mas > 0) usuario = usuario.slice(0, mas);
  }
  if (SIN_PUNTOS.has(dominio)) {
    usuario = usuario.replace(/\./g, "");
  }

  return `${usuario}@${dominio}`;
}

/** true si las dos direcciones son la misma casilla. */
export function mismoEmail(a, b) {
  const ca = canonicalizarEmail(a);
  return Boolean(ca) && ca === canonicalizarEmail(b);
}
