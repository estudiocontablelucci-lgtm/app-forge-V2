/**
 * Aislamiento de ids entre usuarios.
 *
 * El cliente genera los ids offline y el SEED trae ids FIJOS: el programa se
 * llama `seed-dup-c2` y sus ejercicios `a1`..`a9` en toda instalacion. Sin esto,
 * el segundo usuario que sincroniza pisa el programa del primero (el upsert
 * hace ON CONFLICT (id) DO UPDATE) y los `set_logs` de uno quedan colgando de
 * los ejercicios del otro.
 *
 * La solucion es prefijar con el user al entrar y sacar el prefijo al salir:
 * el id remoto es opaco para el cliente, que sigue viendo los suyos.
 *
 * Determinista a proposito: el mismo id local siempre da el mismo id remoto,
 * asi que reenviar la misma sesion actualiza en vez de duplicar.
 */

const SEP = "~";

/** Un id ya prefijado por alguien: viene de un programa que subio otro usuario. */
export const esRemoto = (id) => typeof id === "string" && id.includes(SEP);

/**
 * Prefija un id local con su usuario.
 *
 * Si el id YA viene prefijado no lo vuelve a tocar: es el caso de un programa
 * asignado por un entrenador, donde el id del servidor es el canonico y los dos
 * lados tienen que hablar del mismo. Sin esta guarda, el alumno generaria
 * `alumno~coach~e1` y sus series quedarian colgando de un ejercicio distinto al
 * que el entrenador prescribio.
 */
export function scope(userId, localId) {
  if (localId === null || localId === undefined) return null;
  if (esRemoto(localId)) return localId;
  return `${userId}${SEP}${localId}`;
}

/**
 * Saca el prefijo propio. Un id de OTRO usuario vuelve intacto a proposito:
 * es un programa asignado y su id remoto es el que vale para los dos.
 */
export function unscope(userId, remoteId) {
  if (remoteId === null || remoteId === undefined) return null;
  const prefijo = `${userId}${SEP}`;
  return remoteId.startsWith(prefijo) ? remoteId.slice(prefijo.length) : remoteId;
}

/** Programa completo con todos sus ids (incluido `superset`) llevados a remoto. */
export function scopeProgram(userId, program) {
  return {
    ...program,
    id: scope(userId, program.id),
    exercises: (program.exercises || []).map((e) => ({
      ...e,
      id: scope(userId, e.id),
      superset: e.superset ? scope(userId, e.superset) : null,
    })),
  };
}

/** La vuelta: lo que sale de la base vuelve a los ids que conoce el cliente. */
export function unscopeProgram(userId, program) {
  return {
    ...program,
    id: unscope(userId, program.id),
    exercises: (program.exercises || []).map((e) => ({
      ...e,
      id: unscope(userId, e.id),
      superset: e.superset ? unscope(userId, e.superset) : null,
    })),
  };
}
