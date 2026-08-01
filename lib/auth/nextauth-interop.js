/**
 * next-auth v4 es CommonJS y bajo Next 15 llega con doble envoltura: el modulo
 * ESM trae `default`, y ese `default` trae otro `default` que es la funcion de
 * verdad. Importarlo derecho da "X is not a function", tanto para el handler
 * como para cada provider.
 *
 * Se desenvuelve una sola vez aca en vez de repetir el truco en cada archivo:
 * cuando next-auth v5 (Auth.js) arregle el interop, se borra este archivo y se
 * cambian los imports.
 */
import * as nextMod from "next-auth/next";
import * as googleMod from "next-auth/providers/google";
import * as emailMod from "next-auth/providers/email";

/** Baja por los `default` anidados hasta encontrar la funcion. */
export function unwrap(m) {
  if (typeof m === "function") return m;
  if (m && typeof m === "object" && "default" in m) return unwrap(m.default);
  return null;
}

const NextAuth = unwrap(nextMod);
const GoogleProvider = unwrap(googleMod);
const EmailProvider = unwrap(emailMod);

for (const [nombre, fn] of [["NextAuth", NextAuth], ["GoogleProvider", GoogleProvider], ["EmailProvider", EmailProvider]]) {
  if (!fn) throw new Error(`No se pudo resolver ${nombre} desde next-auth`);
}

const getServerSession =
  nextMod.getServerSession ||
  nextMod.default?.getServerSession ||
  nextMod.default?.default?.getServerSession;

export { NextAuth, GoogleProvider, EmailProvider, getServerSession };
