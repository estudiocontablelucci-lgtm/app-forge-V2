/**
 * El descanso entre series.
 *
 * ============================ LA REGLA ============================
 *
 * Un descanso se guarda como VENCIMIENTO (`fin`, en milisegundos de reloj),
 * NUNCA como una cuenta regresiva que alguien tiene que ir bajando.
 *
 * Esto no es una preferencia de estilo. La version anterior guardaba
 * `remaining` y le restaba 1 cada segundo con `setInterval`. Funciona mientras
 * la pagina esta despierta y falla en el unico momento que importa: cuando el
 * telefono se bloquea o la app pasa a segundo plano, el navegador congela ese
 * intervalo. El descanso "de 2 minutos" seguia marcando 1:47 al volver, porque
 * nadie conto los 40 segundos que la app estuvo dormida.
 *
 * Con un vencimiento absoluto no hay nada que contar: lo que queda se DERIVA
 * del reloj cada vez que se mira. La app puede dormirse, la pestaña puede
 * cambiar, el sistema puede matar el proceso — al volver, el numero es el
 * correcto porque nunca dependio de que alguien estuviera mirando.
 *
 * Corolario que sale gratis: el descanso sobrevive a cerrar la app, asi que se
 * puede persistir en el localStorage como cualquier otro dato.
 */

/** Un descanso vale mientras no pase mas de esto desde que vencio. */
const TOLERANCIA_MS = 10 * 60 * 1000;

/**
 * Arranca un descanso de `segundos`.
 *
 * `total` se guarda aparte del vencimiento porque la barra de progreso necesita
 * saber contra que compararse, y de `fin` solo no se deduce cuanto duraba.
 */
export function crearDescanso(segundos, ahora = Date.now()) {
  const seg = Math.max(0, Math.round(Number(segundos) || 0));
  if (!seg) return null;
  return {
    id: `d${ahora.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    total: seg,
    fin: ahora + seg * 1000,
  };
}

/** Segundos que quedan. Redondea hacia arriba: 0 significa vencido, no "casi". */
export function restante(d, ahora = Date.now()) {
  if (!d) return 0;
  return Math.max(0, Math.ceil((d.fin - ahora) / 1000));
}

export function vencido(d, ahora = Date.now()) {
  return Boolean(d) && d.fin <= ahora;
}

/** Cuanto de la barra esta lleno, de 0 a 1. */
export function avance(d, ahora = Date.now()) {
  if (!d || !d.total) return 0;
  const q = restante(d, ahora);
  return Math.min(1, Math.max(0, 1 - q / d.total));
}

/**
 * El descanso que se recupera del disco al abrir la app.
 *
 * Se descarta el que vencio hace rato: restaurar el descanso de anteayer y
 * cantar "A LA BARRA" al abrir es peor que no restaurar nada. La ventana es
 * generosa a proposito — uno vencido hace treinta segundos, mientras el
 * telefono se reiniciaba, todavia es informacion util.
 */
export function restaurarDescanso(d, ahora = Date.now()) {
  if (!d || typeof d.fin !== "number" || !d.total) return null;
  if (ahora - d.fin > TOLERANCIA_MS) return null;
  return d;
}

/**
 * Preferencias del atleta. Viven en el localStorage con el resto del estado.
 *
 * `sonido` y `vibracion` arrancan en si porque no piden permiso a nadie.
 * `notificacion` arranca en NO: pedir permiso de notificaciones sin que el
 * usuario lo haya pedido es la clase de cosa que se rechaza para siempre con un
 * dedo, y despues no hay como volver a preguntar.
 */
export const PREFS_DEFAULT = {
  descanso: true,        // el cronometro arranca solo al cerrar la vuelta
  sonido: true,
  vibracion: true,
  notificacion: false,
  ayudas: true,          // los ⓘ de las pantallas
  primerosPasos: true,   // la tarjeta de bienvenida, hasta que se descarta
};

export function normalizarPrefs(p) {
  const out = { ...PREFS_DEFAULT };
  if (p && typeof p === "object") {
    for (const k of Object.keys(PREFS_DEFAULT)) {
      if (typeof p[k] === "boolean") out[k] = p[k];
    }
  }
  return out;
}
