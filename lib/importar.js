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
 * Por **NOMBRE**, nunca por posicion ni por sesion. El orden es justamente una
 * de las cosas que se reordenan al revisar un programa —el trap bar paso de
 * cuarto a primero— y el DIA tambien: en la revision del 09/08/2026 face pulls
 * se mudo de B a D, y pullover y apertura de C a D.
 *
 * **Mover un ejercicio de dia NO es una sustitucion.** Es la misma maquina, el
 * mismo patron y la misma longitud: el e1RM tiene que seguir encadenando. Atar
 * la identidad a la sesion habria roto la cadena de tres ejercicios en esa
 * revision, en silencio y justo donde mas se nota.
 *
 * Se empareja dentro de la MISMA sesion cuando se puede, y se acepta el cambio
 * de sesion solo si el nombre es UNICO de los dos lados. Con homonimos en
 * varias sesiones —"Camilla isquios" estuvo en A y en B— no hay forma de saber
 * cual se mudo a cual, y adivinar mezclaria el historial de dos dias distintos.
 *
 * **Un nombre distinto es una SUSTITUCION y le toca id nuevo.** No es un detalle
 * de implementacion: es la misma regla que ya aplica el editor. Encadenar el
 * e1RM de dos maquinas distintas porque ocupan el mismo renglon es exactamente
 * lo que el catalogo existe para evitar.
 */
import { normalizar } from "./catalog.js";

function agrupar(exercises) {
  const m = new Map();
  for (const e of exercises || []) {
    const n = normalizar(e.name);
    if (!m.has(n)) m.set(n, []);
    m.get(n).push(e);
  }
  return m;
}

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
  const viejos = existente?.exercises || [];
  const entran = importado?.exercises || [];
  const porNombreViejo = agrupar(viejos);
  const porNombreNuevo = agrupar(entran);

  const usados = new Set();   // ids de los viejos ya emparejados
  const mudados = [];

  function emparejar(nuevo) {
    const n = normalizar(nuevo.name);
    const libres = (porNombreViejo.get(n) || []).filter((v) => !usados.has(v.id));
    if (!libres.length) return null;
    // Mismo dia: no hay ambiguedad posible.
    const aca = libres.find((v) => v.session === nuevo.session);
    if (aca) return aca;
    // Se mudo de dia. Solo se acepta si el nombre es unico de los dos lados;
    // con homonimos repartidos en varias sesiones, cual se mudo a cual es una
    // adivinanza, y errarle mezcla el historial de dos dias distintos.
    if ((porNombreViejo.get(n) || []).length === 1 && (porNombreNuevo.get(n) || []).length === 1) {
      mudados.push({ name: nuevo.name, de: libres[0].session, a: nuevo.session });
      return libres[0];
    }
    return null;
  }

  const exercises = entran.map((nuevo) => {
    const viejo = emparejar(nuevo);
    if (!viejo) return nuevo;
    usados.add(viejo.id);
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

  const quitados = viejos.filter((e) => !usados.has(e.id));

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
    // Los que cambiaron de dia conservando su id. Se informan porque es
    // exactamente lo que uno querria poder desmentir de un vistazo.
    mudados,
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
