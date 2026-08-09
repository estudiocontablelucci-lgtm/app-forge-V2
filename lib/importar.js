/**
 * Volver a importar un programa que YA existe, sin duplicarlo ni cortar el
 * historial.
 *
 * ======================== POR QUE HACE FALTA ========================
 *
 * El import creaba SIEMPRE un programa nuevo con un id nuevo. Modificar el
 * programa —cambiar una ref, un rango de reps, el orden— y volver a importarlo
 * dejaba dos copias con el mismo nombre. Y peor: los logs se guardan como
 * `week|exId|setN`, asi que con ids nuevos **las series registradas quedan
 * colgando del programa viejo**. Un ciclo a medio entrenar se partia en dos.
 *
 * ======================== QUE SE CONSERVA Y QUE NO ========================
 *
 * La prescripcion es del archivo; la IDENTIDAD y lo registrado son de la app.
 *
 * Del ejercicio que ya existia se conservan tres cosas, y solo tres:
 *
 * - **`id`** — es de lo que cuelgan los logs. Es todo el punto.
 * - **`exerciseId`** — su lugar en el catalogo, salvo que el archivo traiga uno.
 * - **`refsByWeek`** — las refs por semana ya entrenadas. Son un HECHO de lo que
 *   paso, no una prescripcion: subir la ref a mitad de ciclo no puede cambiar
 *   las semanas que ya se hicieron.
 *
 * Todo lo demas viene del archivo, que es lo que se acaba de editar.
 *
 * ======================== COMO SE RECONOCE UN EJERCICIO ========================
 *
 * Por **sesion + nombre normalizado**, no por posicion. El orden es justamente
 * una de las cosas que se reordenan al revisar un programa (el trap bar paso de
 * cuarto a primero en este ciclo), asi que emparejar por posicion cambiaria de
 * identidad a media sesion.
 *
 * **Un nombre distinto en el mismo lugar es una SUSTITUCION y le toca id nuevo.**
 * No es un detalle de implementacion: es la misma regla que ya aplica el editor.
 * Encadenar el e1RM de dos maquinas distintas porque ocupan el mismo renglon es
 * exactamente lo que el catalogo existe para evitar.
 */
import { normalizar } from "./catalog.js";

const clave = (e) => `${e.session}|${normalizar(e.name)}`;

/**
 * El programa `existente` actualizado con lo que trae `importado`.
 *
 * `importado` es lo que devuelve el wizard: `{ name, sessions, exercises }`, con
 * las superseries ya resueltas a los ids temporales de esa misma tanda.
 *
 * Devuelve el programa fusionado y el detalle de que paso, para poder decirlo:
 * un import que actualiza en silencio no deja ver que se sustituyo un ejercicio.
 */
export function fusionarPrograma(existente, importado) {
  const previos = new Map((existente?.exercises || []).map((e) => [clave(e), e]));
  const usados = new Set();

  const exercises = (importado?.exercises || []).map((nuevo) => {
    const viejo = previos.get(clave(nuevo));
    if (!viejo) return nuevo;
    usados.add(clave(nuevo));
    return {
      ...nuevo,
      id: viejo.id,
      // El archivo manda si trae referencia; si no, se conserva la que habia.
      exerciseId: nuevo.exerciseId ?? viejo.exerciseId ?? null,
      // Las refs por semana solo se copian si existen: `undefined` no se guarda.
      ...(viejo.refsByWeek ? { refsByWeek: viejo.refsByWeek } : {}),
    };
  });

  // Las superseries llegan apuntando a los ids TEMPORALES del import. Al
  // conservar ids viejos esos punteros quedan apuntando a nadie, y una
  // superserie rota no se ve: el bloque simplemente deja de agrupar.
  const remapa = new Map();
  (importado?.exercises || []).forEach((nuevo, i) => remapa.set(nuevo.id, exercises[i].id));
  const conSuperset = exercises.map((e) => (
    e.superset ? { ...e, superset: remapa.get(e.superset) ?? null } : e
  ));

  const quitados = (existente?.exercises || []).filter((e) => !usados.has(clave(e)));

  return {
    program: {
      ...existente,
      name: importado?.name || existente?.name,
      sessions: importado?.sessions || existente?.sessions,
      exercises: conSuperset,
      updatedAt: Date.now(),
    },
    conservados: usados.size,
    nuevos: conSuperset.length - usados.size,
    quitados: quitados.map((e) => e.name),
  };
}

/**
 * El programa que este import querria actualizar, si hay alguno.
 *
 * Por nombre normalizado: el archivo es el mismo programa aunque se le haya
 * corregido un acento. Si hay varios homonimos —que los hay, por duplicados
 * viejos— gana el editado mas recientemente, que es el que la persona viene
 * usando.
 */
export function candidatoAActualizar(programs, nombre) {
  const n = normalizar(nombre);
  if (!n) return null;
  const iguales = (programs || []).filter((p) => !p.readOnly && normalizar(p.name) === n);
  if (!iguales.length) return null;
  return iguales.reduce((a, b) => (
    new Date(b.updatedAt || 0) > new Date(a.updatedAt || 0) ? b : a
  ));
}
