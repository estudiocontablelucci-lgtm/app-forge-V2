/**
 * Catalogo de ejercicios.
 *
 * El nombre deja de ser texto libre dentro del programa y pasa a ser una
 * referencia. Con eso desaparecen dos problemas de raiz: escribir el mismo
 * ejercicio de dos formas distintas, y no poder distinguir "corregi el nombre"
 * de "cambie de ejercicio" — que son operaciones diferentes y hoy son la misma.
 *
 * El nombre canonico vive aca. `program.exercises[]` conserva una copia
 * denormalizada solo como respaldo para programas viejos que todavia no tienen
 * `exerciseId`; el nombre que se muestra se resuelve siempre contra el catalogo.
 */

/** Para comparar y deduplicar: sin tildes, sin puntuacion, sin dobles espacios. */
export const normalizar = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Catalogo base: ejercicios que vienen con la app, de solo lectura.
 *
 * Son los del programa real (Ciclo 2), que es lo unico que podemos afirmar que
 * alguien usa de verdad. Un catalogo generico de 300 ejercicios inventados
 * seria mas vistoso y menos util: la lista se llena sola con lo que cada
 * entrenador cargue.
 *
 * `base: true` = no se puede editar ni borrar desde la UI.
 */
export const CATALOGO_BASE = [
  ["Sentadilla pendular", "Cuádriceps"], ["Prensa 45°", "Cuádriceps"],
  ["Prensa horizontal", "Cuádriceps"], ["Sillón de cuádriceps", "Cuádriceps"],
  ["Hack Squat", "Cuádriceps"], ["Camilla isquios", "Isquios"],
  ["Hip Thrust", "Isquios"], ["Peso Muerto Trap Bar", "Isquios"],
  ["Press Plano (barra)", "Pecho"], ["Press Plano (pesado)", "Pecho"],
  ["Press inclinado (DB)", "Pecho"], ["Apertura máquina", "Pecho"],
  ["Remo T (soporte pect.)", "Espalda"], ["Remo T (prono)", "Espalda"],
  ["Dominadas", "Espalda"], ["Face pulls", "Espalda"], ["Shrugs DB", "Espalda"],
  ["Vuelos laterales (DB)", "Hombros"], ["Vuelos posteriores", "Hombros"],
  ["Press máquina hombros", "Hombros"],
  ["Ext. tríceps overhead (DB)", "Tríceps"], ["Ext. tríceps (polea)", "Tríceps"],
  ["Press francés", "Tríceps"],
  ["Curl sentado (DB)", "Bíceps"], ["Curl DB", "Bíceps"], ["Curl bíceps (polea)", "Bíceps"],
  ["Gemelo sentado", "Gemelos"], ["Gemelo prensa 45", "Gemelos"],
  ["Extensión lumbar", "Core"], ["Caminata granjero", "Core", "pasos"],
].map(([name, group, unit]) => ({
  id: `base-${normalizar(name).replace(/ /g, "-")}`,
  name,
  group,
  unit: unit || "reps",
  base: true,
}));

/**
 * Deriva el catalogo de los programas existentes.
 *
 * Corre una sola vez, al migrar. Deduplica por nombre normalizado, asi que dos
 * programas que escribieron "Prensa 45" y "Prensa 45°" terminan en la misma
 * entrada — que es justamente el problema que el catalogo viene a resolver.
 *
 * Devuelve { catalog, programs } con los programas ya apuntando al catalogo.
 */
export function migrarACatalogo(programs, catalogoPrevio) {
  const porNombre = new Map();
  for (const e of CATALOGO_BASE) porNombre.set(normalizar(e.name), e);
  // El catalogo que ya existia se conserva: sin esto, correr la migracion dos
  // veces perderia los ejercicios propios, porque los programas ya migrados no
  // vuelven a declararlos.
  for (const e of catalogoPrevio || []) if (!e.base) porNombre.set(normalizar(e.name), e);

  const propios = (catalogoPrevio || []).filter((e) => !e.base);
  const programasMigrados = (programs || []).map((p) => ({
    ...p,
    exercises: (p.exercises || []).map((ex) => {
      if (ex.exerciseId) return ex;               // ya migrado
      const clave = normalizar(ex.name);
      let entrada = porNombre.get(clave);
      if (!entrada) {
        entrada = {
          id: `ex-${clave.replace(/ /g, "-")}`,
          name: ex.name,
          group: ex.group || null,
          unit: ex.unit || "reps",
          base: false,
        };
        porNombre.set(clave, entrada);
        propios.push(entrada);
      }
      return { ...ex, exerciseId: entrada.id };
    }),
  }));

  return { catalog: [...CATALOGO_BASE, ...propios], programs: programasMigrados };
}

/** Ejercicio del catalogo por id. */
export const buscarEnCatalogo = (catalog, id) => (catalog || []).find((c) => c.id === id) || null;

/**
 * Resuelve los datos que vienen del catalogo sobre los ejercicios de un
 * programa. El resto del codigo sigue leyendo `ex.name` sin enterarse.
 */
export function resolverEjercicios(exercises, catalog) {
  return (exercises || []).map((ex) => {
    const cat = ex.exerciseId ? buscarEnCatalogo(catalog, ex.exerciseId) : null;
    if (!cat) return ex;                          // programa viejo: su copia manda
    return { ...ex, name: cat.name, group: cat.group ?? ex.group, unit: cat.unit || ex.unit };
  });
}

/**
 * Incorpora al catalogo los ejercicios de programas que llegaron del servidor.
 *
 * No alcanza con reusar `migrarACatalogo`: esa saltea los ejercicios que ya
 * tienen `exerciseId`, y los que vienen del sync SIEMPRE lo tienen — se lo puso
 * el dispositivo que los creo. Sin esta funcion, un programa sincronizado se ve
 * bien (cae al nombre denormalizado) pero sus ejercicios no aparecen en el
 * selector y no se pueden reutilizar en otra sesion.
 *
 * Respeta el id que ya traen, para que los dos dispositivos hablen del mismo
 * ejercicio y no de dos copias con el mismo nombre.
 */
export function absorberDeProgramas(catalog, programs) {
  const existentes = new Set((catalog || []).map((c) => c.id));
  const porNombre = new Map((catalog || []).map((c) => [normalizar(c.name), c]));
  const nuevos = [];

  for (const p of programs || []) {
    for (const ex of p.exercises || []) {
      if (!ex.exerciseId || existentes.has(ex.exerciseId)) continue;
      // Mismo nombre con otro id: ya esta representado, no se duplica.
      if (porNombre.has(normalizar(ex.name))) continue;

      const entrada = {
        id: ex.exerciseId,
        name: ex.name,
        group: ex.group || null,
        unit: ex.unit || "reps",
        base: false,
      };
      existentes.add(entrada.id);
      porNombre.set(normalizar(entrada.name), entrada);
      nuevos.push(entrada);
    }
  }

  return nuevos.length ? [...(catalog || []), ...nuevos] : (catalog || []);
}

/**
 * Si un ejercicio del programa ya tiene series registradas.
 *
 * Mira las dos fuentes a proposito: `logs` es lo del dispositivo actual y
 * `history` es lo que viajo por el sync. Si se entreno en el celular y se edita
 * el programa desde la computadora, el historial sincronizado es la unica
 * evidencia local de que esas series existen — y de eso depende que cambiar el
 * ejercicio se trate como sustitucion y no como una correccion de nombre.
 */
export function tieneSeriesRegistradas(exerciseId, logs, history) {
  const enLogs = Object.keys(logs || {}).some((k) => k.split("|")[1] === exerciseId);
  if (enLogs) return true;
  return (history || []).some((h) =>
    (h.exercises || []).some((e) => e.id === exerciseId && (e.sets || []).length > 0));
}

/** Alta en el catalogo propio, reusando la entrada si el nombre ya existe. */
export function agregarAlCatalogo(catalog, { name, group, unit }) {
  const clave = normalizar(name);
  if (!clave) return { catalog, entrada: null };
  const existente = (catalog || []).find((c) => normalizar(c.name) === clave);
  if (existente) return { catalog, entrada: existente };

  const entrada = {
    id: `ex-${clave.replace(/ /g, "-")}-${Math.random().toString(36).slice(2, 6)}`,
    name: String(name).trim(),
    group: group || null,
    unit: unit || "reps",
    base: false,
  };
  return { catalog: [...(catalog || []), entrada], entrada };
}
