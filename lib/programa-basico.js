/**
 * Programa de arranque, para quien no tiene ninguno y no quiere armarlo de cero.
 *
 * Se carga A PEDIDO, nunca solo. Antes toda instalacion nueva venia con el
 * mesociclo de otra persona ya armado, con sus kilos y sus notas: era imposible
 * distinguir lo propio de lo ajeno y el primer trabajo del usuario nuevo era
 * borrar cosas que no entendia.
 *
 * Es deliberadamente generico y corto. No hay referencias de kilos, no hay
 * notas de lesiones y no hay nada que suponga un gimnasio en particular: la
 * primera semana es para calibrar, y eso solo lo puede hacer quien entrena.
 */

export const SESIONES_BASICO = [
  { id: "A", name: "Torso" },
  { id: "B", name: "Pierna" },
  { id: "C", name: "Full body" },
];

const e = (o) => ({
  tempo: "2-0-1-0", rir: "2-3", superset: null, unit: "reps", refKg: null, description: "", ...o,
});

export const EJERCICIOS_BASICO = [
  e({ session: "A", order: 1, name: "Press Plano (barra)", group: "Pecho", sets: 3, repsMin: 8, repsMax: 10, rest: 150 }),
  e({ session: "A", order: 2, name: "Remo T (soporte pect.)", group: "Espalda", sets: 3, repsMin: 8, repsMax: 10, rest: 150 }),
  e({ session: "A", order: 3, name: "Press máquina hombros", group: "Hombros", sets: 3, repsMin: 10, repsMax: 12, rest: 90 }),
  e({ session: "A", order: 4, name: "Curl sentado (DB)", group: "Bíceps", sets: 2, repsMin: 10, repsMax: 12, rest: 60 }),
  e({ session: "A", order: 5, name: "Ext. tríceps (polea)", group: "Tríceps", sets: 2, repsMin: 10, repsMax: 12, rest: 60 }),

  e({ session: "B", order: 1, name: "Prensa 45°", group: "Cuádriceps", sets: 3, repsMin: 8, repsMax: 10, rest: 150 }),
  e({ session: "B", order: 2, name: "Camilla isquios", group: "Isquios", sets: 3, repsMin: 10, repsMax: 12, rest: 90 }),
  e({ session: "B", order: 3, name: "Sillón de cuádriceps", group: "Cuádriceps", sets: 3, repsMin: 10, repsMax: 12, rest: 90 }),
  e({ session: "B", order: 4, name: "Hip Thrust", group: "Isquios", sets: 3, repsMin: 10, repsMax: 12, rest: 90 }),
  e({ session: "B", order: 5, name: "Gemelo sentado", group: "Gemelos", sets: 3, repsMin: 12, repsMax: 15, rest: 60 }),

  e({ session: "C", order: 1, name: "Prensa horizontal", group: "Cuádriceps", sets: 3, repsMin: 8, repsMax: 10, rest: 150 }),
  e({ session: "C", order: 2, name: "Press inclinado (DB)", group: "Pecho", sets: 3, repsMin: 10, repsMax: 12, rest: 120 }),
  e({ session: "C", order: 3, name: "Dominadas", group: "Espalda", sets: 3, refKg: "BW", repsMin: 5, repsMax: 8, rest: 150 }),
  e({ session: "C", order: 4, name: "Vuelos laterales (DB)", group: "Hombros", sets: 3, repsMin: 12, repsMax: 15, rest: 60 }),
  e({ session: "C", order: 5, name: "Extensión lumbar", group: "Core", sets: 2, repsMin: 12, repsMax: 15, rest: 60 }),
];

/** Instancia nueva, con ids propios: dos usuarios que lo cargan no se pisan. */
export function crearProgramaBasico(uid) {
  return {
    id: uid(),
    name: "Fullbody 3x · básico",
    weeks: 4,
    hasDeload: true,
    sessions: SESIONES_BASICO.map((s) => ({ ...s })),
    exercises: EJERCICIOS_BASICO.map((x) => ({ ...x, id: uid() })),
    status: "active",
    createdAt: Date.now(),
  };
}
