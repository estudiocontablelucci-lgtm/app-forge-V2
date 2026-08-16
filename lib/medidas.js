/**
 * Medidas corporales: campos, derivadas, proporciones y asimetrias.
 *
 * Funciones puras, sin base ni sesion. Salen de la planilla que la app vino a
 * reemplazar, y las formulas estan verificadas contra sus numeros reales — no
 * reimplementadas de memoria. Donde la planilla y el manual difieren, gana la
 * planilla, porque es la que tiene la serie historica.
 *
 * La tabla `body_measurements` guarda todo en `values_json`, asi que agregar un
 * campo aca no necesita migracion.
 */

/* ---------- que se mide ---------- */

/**
 * Cada campo con su unidad y COMO se mide. La tecnica no es decoracion: una
 * medida tomada distinto que la anterior no es un dato, es ruido con forma de
 * dato. El protocolo sale de la hoja "Protocolo medicion".
 */
export const GRUPOS = [
  {
    id: "bascula",
    titulo: "Peso y composición",
    ayuda: "Balanza o báscula de bioimpedancia. Siempre a la misma hora, en ayunas, antes de entrenar y con hidratación parecida.",
    campos: [
      { id: "peso", label: "Peso", unidad: "kg", hint: "En ayunas, post-baño, misma ropa (o sin ropa)." },
      { id: "grasaPct", label: "% Grasa corporal", unidad: "%", hint: "De la báscula de bioimpedancia." },
      { id: "masaGrasa", label: "Masa grasa", unidad: "kg", hint: "La que da la báscula. Si no la tenés, se calcula del peso y el %." },
      { id: "masaMuscular", label: "Masa muscular esquelética", unidad: "kg" },
      { id: "agua", label: "Agua corporal total", unidad: "kg", hint: "El reloj la da en kg. El % se calcula solo." },
      { id: "bmr", label: "Metabolismo basal", unidad: "kcal" },
    ],
  },
  {
    id: "tronco",
    titulo: "Tronco",
    ayuda: "Cinta firme pero sin comprimir, paralela al piso.",
    campos: [
      { id: "cuello", label: "Cuello", unidad: "cm", hint: "Debajo de la nuez, cinta horizontal." },
      { id: "pecho", label: "Pecho", unidad: "cm", hint: "A la altura de los pezones, al final de una espiración normal." },
      { id: "cintura", label: "Cintura", unidad: "cm", hint: "A la altura del ombligo, relajado, sin meter la panza." },
      { id: "cadera", label: "Cadera", unidad: "cm", hint: "En la parte más ancha de los glúteos." },
      { id: "hombrosBiacromial", label: "Hombros (biacromial)", unidad: "cm", hint: "De pie, brazos relajados. Horizontal, de acromion a acromion." },
      { id: "hombrosCircunf", label: "Hombros (circunferencia)", unidad: "cm" },
    ],
  },
  {
    id: "brazos",
    titulo: "Brazos",
    ayuda: "Derecho e izquierdo por separado: la diferencia entre lados es el dato, no un detalle.",
    campos: [
      { id: "brazoDRelajado", label: "Brazo D relajado", unidad: "cm", hint: "Punto medio entre hombro y codo, brazo colgando." },
      { id: "brazoDContraido", label: "Brazo D contraído", unidad: "cm", hint: "Mismo punto, bíceps contraído." },
      { id: "brazoIRelajado", label: "Brazo I relajado", unidad: "cm" },
      { id: "brazoIContraido", label: "Brazo I contraído", unidad: "cm" },
      { id: "antebrazoD", label: "Antebrazo D", unidad: "cm", hint: "En la parte más ancha." },
      { id: "antebrazoI", label: "Antebrazo I", unidad: "cm" },
      { id: "muneca", label: "Muñeca", unidad: "cm", hint: "En la articulación, debajo de la apófisis estiloides." },
    ],
  },
  {
    id: "piernas",
    titulo: "Piernas",
    campos: [
      { id: "musloD", label: "Muslo D", unidad: "cm", hint: "15 cm arriba del borde superior de la rótula, pierna relajada." },
      { id: "musloI", label: "Muslo I", unidad: "cm" },
      { id: "pantorrillaD", label: "Pantorrilla D", unidad: "cm", hint: "En la parte más ancha." },
      { id: "pantorrillaI", label: "Pantorrilla I", unidad: "cm" },
      { id: "tobillo", label: "Tobillo", unidad: "cm", hint: "Justo arriba de los maléolos." },
    ],
  },
];

export const CAMPOS = GRUPOS.flatMap((g) => g.campos);

/** La altura casi no cambia: se arrastra de la medicion anterior. */
export const ALTURA = { id: "altura", label: "Altura", unidad: "cm" };

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const r1 = (v) => (v === null ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);

/* ---------- derivadas ---------- */

/**
 * Lo que se calcula solo. Verificado contra la planilla:
 * peso 73.15 · grasa 12.6% · magra 63.95 · altura 174 → IMC 24.16, FFMI 21.49.
 *
 * El FFMI es el NORMALIZADO (corregido a 1.80 m). El crudo daria 21.12 y la
 * planilla dice 21.49: sin la correccion, dos personas de altura distinta con
 * la misma composicion darian numeros distintos.
 */
export function derivadas(v = {}) {
  const peso = num(v.peso);
  const grasaPct = num(v.grasaPct);
  const alturaCm = num(v.altura);
  const h = alturaCm ? alturaCm / 100 : null;
  const cintura = num(v.cintura);
  const cadera = num(v.cadera);
  const agua = num(v.agua);

  // La bascula DA la masa grasa; solo se calcula cuando no se registro. Con el
  // valor medido, la masa magra da 63.95 y con el calculado 63.93 — la planilla
  // dice 63.95, o sea que usa el de la bascula. La diferencia es chica pero es
  // la que decide si la serie historica sigue siendo comparable.
  const masaGrasa = num(v.masaGrasa) !== null
    ? num(v.masaGrasa)
    : (peso !== null && grasaPct !== null ? (peso * grasaPct) / 100 : null);
  const masaMagra = peso !== null && masaGrasa !== null ? peso - masaGrasa : null;
  const imc = peso !== null && h ? peso / (h * h) : null;
  const ffmi = masaMagra !== null && h ? masaMagra / (h * h) + 6.1 * (1.8 - h) : null;

  return {
    masaGrasa: r1(masaGrasa),
    masaMagra: r1(masaMagra),
    imc: r2(imc),
    ffmi: r2(ffmi),
    cinturaAltura: cintura !== null && alturaCm ? r2(cintura / alturaCm) : null,
    cinturaCadera: cintura !== null && cadera !== null ? r2(cintura / cadera) : null,
    aguaPct: agua !== null && peso ? r1((agua / peso) * 100) : null,
  };
}

/* ---------- ratios con referencia ---------- */

/**
 * Los ratios que la planilla marca como clave, con su valor ideal y de que lado
 * esta bien. `mejor: "alto"` = cuanto mas, mejor.
 */
export const RATIOS = [
  { id: "pechoCintura", label: "Pecho / Cintura", ideal: 1.3, mejor: "alto", nota: "V-taper visual" },
  { id: "hombrosCintura", label: "Hombros / Cintura", ideal: 1.618, mejor: "alto", nota: "Golden ratio" },
  { id: "cinturaAltura", label: "Cintura / Altura", ideal: 0.5, mejor: "bajo", nota: "Riesgo cardiometabólico" },
  { id: "cinturaCadera", label: "Cintura / Cadera", ideal: 0.9, mejor: "bajo", nota: "Distribución de grasa" },
  { id: "brazoCuello", label: "Brazo / Cuello", ideal: 1, mejor: "alto", nota: "Proporción clásica" },
  { id: "pantorrillaBrazo", label: "Pantorrilla / Brazo", ideal: 1, mejor: "alto", nota: "Simetría visual" },
];

export function ratios(v = {}) {
  const d = derivadas(v);
  const pecho = num(v.pecho), cintura = num(v.cintura);
  const hombros = num(v.hombrosCircunf), cuello = num(v.cuello);
  const brazo = num(v.brazoDContraido), pantorrilla = num(v.pantorrillaD);

  const val = {
    pechoCintura: pecho !== null && cintura ? r2(pecho / cintura) : null,
    hombrosCintura: hombros !== null && cintura ? r2(hombros / cintura) : null,
    cinturaAltura: d.cinturaAltura,
    cinturaCadera: d.cinturaCadera,
    brazoCuello: brazo !== null && cuello ? r2(brazo / cuello) : null,
    pantorrillaBrazo: pantorrilla !== null && brazo ? r2(pantorrilla / brazo) : null,
  };

  return RATIOS.map((r) => {
    const actual = val[r.id];
    const ok = actual === null ? null : r.mejor === "alto" ? actual >= r.ideal : actual <= r.ideal;
    return { ...r, actual, ok };
  });
}

/* ---------- proporciones ---------- */

/**
 * Objetivos por regla de proporcion. El cuello es el ancla porque casi no
 * responde al entrenamiento ni a la grasa: sirve de referencia estable.
 * Antebrazo y muslo salen de las reglas de McCallum, que se expresan contra el
 * pecho.
 */
export const REGLAS = [
  { id: "pecho", label: "Pecho", regla: "Cintura + 25 cm", target: (v) => (num(v.cintura) !== null ? num(v.cintura) + 25 : null) },
  { id: "brazoDContraido", label: "Brazo D contraído", regla: "= Cuello", target: (v) => num(v.cuello) },
  { id: "brazoIContraido", label: "Brazo I contraído", regla: "= Cuello", target: (v) => num(v.cuello) },
  { id: "antebrazoD", label: "Antebrazo D", regla: "Pecho × 0.29 (McCallum)", target: (v) => (num(v.pecho) !== null ? num(v.pecho) * 0.29 : null) },
  { id: "antebrazoI", label: "Antebrazo I", regla: "Pecho × 0.29 (McCallum)", target: (v) => (num(v.pecho) !== null ? num(v.pecho) * 0.29 : null) },
  { id: "musloD", label: "Muslo D", regla: "Pecho × 0.53 (McCallum)", target: (v) => (num(v.pecho) !== null ? num(v.pecho) * 0.53 : null) },
  { id: "musloI", label: "Muslo I", regla: "Pecho × 0.53 (McCallum)", target: (v) => (num(v.pecho) !== null ? num(v.pecho) * 0.53 : null) },
  { id: "pantorrillaD", label: "Pantorrilla D", regla: "= Cuello", target: (v) => num(v.cuello) },
  { id: "pantorrillaI", label: "Pantorrilla I", regla: "= Cuello", target: (v) => num(v.cuello) },
];

export function proporciones(v = {}) {
  return REGLAS.map((r) => {
    const actual = num(v[r.id]);
    const target = r.target(v);
    const delta = actual !== null && target !== null ? r1(actual - target) : null;
    return { id: r.id, label: r.label, regla: r.regla, actual, target: r1(target), delta, ok: delta !== null && delta >= 0 };
  }).filter((x) => x.actual !== null || x.target !== null);
}

/* ---------- asimetrias ---------- */

/** Mas de esto entre lados deja de ser variacion de medicion. */
export const UMBRAL_ASIMETRIA = 3;

/**
 * Diferencia entre lados, en % del lado derecho.
 *
 * Es LA metrica que conecta la planilla con el programa: el protocolo ASIM-IZQ
 * existe por una asimetria de brazo del -4.8%, que sale justo de esta cuenta
 * (35.5 contra 37.3). Medirla sin que la app la muestre es tener el problema
 * anotado y no verlo.
 */
export const PARES = [
  { id: "brazo", label: "Brazo contraído", d: "brazoDContraido", i: "brazoIContraido" },
  { id: "antebrazo", label: "Antebrazo", d: "antebrazoD", i: "antebrazoI" },
  { id: "muslo", label: "Muslo", d: "musloD", i: "musloI" },
  { id: "pantorrilla", label: "Pantorrilla", d: "pantorrillaD", i: "pantorrillaI" },
];

export function asimetrias(v = {}) {
  return PARES.map((p) => {
    const D = num(v[p.d]), I = num(v[p.i]);
    if (D === null || I === null || !D) return { ...p, D, I, pct: null, alerta: false };
    const pct = r1(((I - D) / D) * 100);
    return { ...p, D, I, pct, alerta: Math.abs(pct) >= UMBRAL_ASIMETRIA, lado: pct < 0 ? "izquierdo" : "derecho" };
  }).filter((x) => x.pct !== null);
}

/* ---------- comparacion entre tomas ---------- */

/** Que cambio contra la medicion anterior. Solo de lo que hay en las dos. */
export function contra(actual = {}, anterior = null) {
  if (!anterior) return {};
  const out = {};
  const da = derivadas(actual), db = derivadas(anterior);
  for (const k of [...CAMPOS.map((c) => c.id), "altura"]) {
    const a = num(actual[k]), b = num(anterior[k]);
    if (a !== null && b !== null) out[k] = r1(a - b);
  }
  for (const k of Object.keys(da)) {
    if (da[k] !== null && db[k] !== null) out[k] = r2(da[k] - db[k]);
  }
  return out;
}

/** Toma completa lista para mostrar. */
export function ficha(valores = {}, anterior = null) {
  return {
    valores,
    derivadas: derivadas(valores),
    ratios: ratios(valores),
    proporciones: proporciones(valores),
    asimetrias: asimetrias(valores),
    delta: contra(valores, anterior),
  };
}

/**
 * El peso corporal VIGENTE a una fecha.
 *
 * La toma mas reciente que no sea posterior a esa fecha. Si no hay ninguna
 * anterior —la persona se midio por primera vez despues de entrenar— se usa la
 * primera que exista: es una aproximacion, pero mucho mejor que dejar sin
 * e1RM a las dominadas de las primeras semanas.
 *
 * Existe porque el peso entra en el calculo de los ejercicios a peso corporal
 * (`cargaEfectiva`), y ahi el de HOY seria una respuesta incorrecta: reescribe
 * hacia atras cada serie ya registrada cada vez que la balanza cambia.
 *
 * @param {Array<{fecha: string, valores: object}>} tomas en cualquier orden
 * @param {number|string|Date} cuando fecha de la serie
 * @returns {number|null}
 */
export function pesoVigente(tomas = [], cuando = Date.now()) {
  const dia = aDia(cuando);
  if (!dia) return null;
  const conPeso = tomas
    .map((t) => ({ dia: String(t.fecha || "").slice(0, 10), peso: num(t.valores?.peso) }))
    .filter((t) => t.dia && t.peso !== null)
    .sort((a, b) => a.dia.localeCompare(b.dia));
  if (!conPeso.length) return null;

  let vigente = null;
  for (const t of conPeso) {
    if (t.dia <= dia) vigente = t.peso;
    else break;
  }
  return vigente ?? conPeso[0].peso;
}

/** Una fecha —ms, ISO o Date— como "YYYY-MM-DD" en hora local. */
function aDia(cuando) {
  if (typeof cuando === "string") return cuando.slice(0, 10) || null;
  const d = cuando instanceof Date ? cuando : new Date(cuando);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
