/**
 * Avisar que se termino el descanso, con el telefono en el bolsillo.
 *
 * ==================== POR QUE NO ES UN setTimeout ====================
 *
 * Porque el caso real es este: se cierra la serie, se apoya el telefono en el
 * banco y se apaga la pantalla. Ahi el navegador CONGELA la pagina — los
 * `setTimeout` no corren, `navigator.vibrate` no dispara y React no re-renderiza.
 * Un aviso construido sobre temporizadores de JavaScript avisa en el
 * escritorio, con la pestaña a la vista, que es exactamente donde no hace falta.
 *
 * No hay API de notificacion programada que sirva: Notification Triggers quedo
 * en experimento y nunca salio. Lo unico que corre a tiempo real, en su propio
 * hilo y ajeno al congelamiento de la pagina, es el GRAFO DE AUDIO.
 *
 * Asi que el beep no se dispara: se AGENDA. Al arrancar el descanso se crean
 * los osciladores con `start(t)` en el tiempo absoluto del AudioContext. A
 * partir de ahi suena solo, aunque nadie vuelva a ejecutar una linea de JS.
 *
 * ==================== EL TONO QUE NO SE ESCUCHA ====================
 *
 * Falta una pieza: si la pagina se congela, el AudioContext se suspende con
 * ella y su reloj se para — el beep agendado queda esperando una hora que no
 * llega. La contramedida es que la pagina no se congele, y una pagina que ESTA
 * reproduciendo audio no se congela.
 *
 * Por eso mientras corre el descanso suena un tono de 30 Hz a volumen 0,0015.
 * Ningun parlante de telefono reproduce 30 Hz y ese volumen es inaudible de
 * todos modos, pero para el navegador la pagina esta emitiendo audio y la deja
 * viva. Es el mismo truco que usan los metronomos y los timers de gimnasio.
 *
 * ==================== Y SI IGUAL SE CONGELA ====================
 *
 * Puede pasar (bateria baja, el sistema decide otra cosa). Entonces el reloj
 * del AudioContext se paro y `beepPendiente()` lo delata: su `currentTime`
 * sigue siendo ANTERIOR a la hora agendada aunque en el reloj de pared ya haya
 * pasado. Eso distingue "ya sono" de "no llego a sonar" sin adivinar, y permite
 * tocarlo al volver en vez de tragarse el aviso.
 */

let ctx = null;
let vivo = null;          // { osc, gain } del tono de 30 Hz
let agendados = [];       // osciladores del beep
let horaDelBeep = 0;      // en tiempo del AudioContext, no de reloj de pared

function contexto() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try { ctx = new AC(); } catch { return null; }
  }
  return ctx;
}

/**
 * Deja el audio en condiciones de sonar.
 *
 * Tiene que llamarse desde un gesto del usuario: el navegador no deja que una
 * pagina empiece a emitir audio por su cuenta. En la practica el gesto sobra —
 * arrancar un descanso implica haber tocado un input de reps— pero hay que
 * hacerlo explicito porque un AudioContext creado sin gesto nace suspendido y
 * se queda asi.
 */
export async function despertarAudio() {
  const c = contexto();
  if (!c) return false;
  if (c.state === "suspended") {
    try { await c.resume(); } catch { return false; }
  }
  return c.state === "running";
}

/** El tono inaudible que mantiene viva la pagina mientras corre el descanso. */
function sostener() {
  const c = contexto();
  if (!c || c.state !== "running" || vivo) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = 30;
    gain.gain.value = 0.0015;
    osc.connect(gain).connect(c.destination);
    osc.start();
    vivo = { osc, gain };
  } catch { /* sin audio el resto del aviso sigue funcionando */ }
}

function soltar() {
  if (!vivo) return;
  try { vivo.osc.stop(); vivo.osc.disconnect(); vivo.gain.disconnect(); } catch { /* ya estaba muerto */ }
  vivo = null;
}

/** Tres pulsos: dos graves y uno agudo, para que se distinga de un mensaje. */
function pulsos(c, desde) {
  const creados = [];
  for (let i = 0; i < 3; i++) {
    const t = desde + i * 0.22;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = i === 2 ? 1175 : 880;
    // Con rampas y no a escalon: un seno que arranca de golpe hace "clic".
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.012);
    gain.gain.setValueAtTime(0.4, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.2);
    creados.push(osc);
  }
  return creados;
}

/**
 * Agenda el beep para dentro de `segundos` y prende el tono que sostiene la
 * pagina. Devuelve si quedo agendado de verdad.
 */
export function agendarBeep(segundos) {
  const c = contexto();
  if (!c || c.state !== "running") return false;
  cancelarBeep();
  const t0 = c.currentTime + Math.max(0, Number(segundos) || 0);
  try {
    agendados = pulsos(c, t0);
    horaDelBeep = t0;
    sostener();
    return true;
  } catch {
    agendados = [];
    horaDelBeep = 0;
    return false;
  }
}

export function cancelarBeep() {
  for (const osc of agendados) {
    try { osc.stop(); osc.disconnect(); } catch { /* ya sono o ya murio */ }
  }
  agendados = [];
  horaDelBeep = 0;
  soltar();
}

/**
 * El beep agendado todavia no sono.
 *
 * Comparar contra el reloj del AudioContext y no contra `Date.now()` es todo el
 * punto: si la pagina se congelo, ese reloj se congelo con ella. Que siga
 * marcando menos que la hora agendada es la prueba de que el beep no llego a
 * salir, y es lo unico que distingue "sono y no lo escuchaste" de "no sono".
 */
export function beepPendiente() {
  return Boolean(ctx && horaDelBeep && ctx.currentTime < horaDelBeep);
}

/**
 * Hay un beep AGENDADO (haya sonado ya o no).
 *
 * Existe porque `beepPendiente()` responde false a dos preguntas distintas —
 * "ya sono" y "nunca se agendo"— y confundirlas dejaba el descanso en silencio.
 * Ver el comentario de `sonarAhora`.
 */
export function beepArmado() {
  return Boolean(ctx && horaDelBeep);
}

/** Suena ya. Para el caso en que el agendado no llego a salir. */
export function beepYa() {
  const c = contexto();
  if (!c) return false;
  if (c.state === "suspended") { try { c.resume(); } catch { /* sigue igual */ } }
  try { pulsos(c, c.currentTime + 0.02); return true; } catch { return false; }
}

/**
 * Se termino el descanso: que suene lo que corresponda.
 *
 * Hay TRES estados posibles y la version anterior solo distinguia dos, que es
 * exactamente el bug de "el descanso vencio y no sono nada":
 *
 * - **Agendado y ya sono** — no se toca. Repetirlo seria un doble aviso dos
 *   decimas despues, peor que uno solo.
 * - **Agendado y todavia pendiente** — la pagina se congelo y el reloj del grafo
 *   se paro con ella. Se cancela y se toca en el momento.
 * - **NUNCA SE AGENDO** — el que faltaba. Pasa cada vez que el descanso llega
 *   restaurado (la app se murio a mitad de serie y volvio: el cronometro se lee
 *   del disco, pero agendar necesita un gesto que al abrir no hubo) y cada vez
 *   que el navegador bloqueo el audio. `beepPendiente()` da false en este caso
 *   igual que en el primero, asi que el vencimiento se daba por avisado y el
 *   descanso terminaba en silencio — sin beep, y sin ninguna senal de que el
 *   aviso no estaba armado.
 *
 * Con la notificacion apagada por defecto, el sonido es el unico canal que
 * viene prendido. Ante la duda suena: un aviso de mas se ignora, uno de menos
 * deja a alguien parado al lado de la maquina mirando el telefono.
 */
export function sonarAhora({ sonido = true, vibracion = true } = {}) {
  if (sonido) {
    if (!beepArmado() || beepPendiente()) { cancelarBeep(); beepYa(); }
    else soltar();   // el agendado ya sono; queda apagar el tono de sosten
  } else {
    cancelarBeep();
  }
  if (vibracion) {
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* sin motor de vibracion */ }
  }
}

/* ============================ NOTIFICACION ============================ */

export function estadoNotificacion() {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "no-soportado";
  return Notification.permission;   // "default" | "granted" | "denied"
}

/** Se pide desde un gesto: al prender la preferencia, no al abrir la app. */
export async function pedirPermisoNotificacion() {
  if (typeof Notification === "undefined") return "no-soportado";
  if (Notification.permission !== "default") return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return "denied"; }
}

/**
 * La notificacion del sistema.
 *
 * Va por el service worker y no por `new Notification(...)`: una notificacion
 * creada por la pagina muere con la pagina, y la del service worker sobrevive y
 * puede traer al frente la app instalada al tocarla.
 *
 * `tag` fija hace que una reemplace a la anterior. Sin eso, tres descansos
 * seguidos dejan tres avisos apilados en la barra y hay que barrerlos a mano.
 */
export async function notificarFinDescanso() {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  const opciones = {
    body: "A la barra.",
    tag: "forge-descanso",
    renotify: true,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification("Descanso terminado", opciones); return true; }
    new Notification("Descanso terminado", opciones);
    return true;
  } catch { return false; }
}

/** Se cerro el descanso (vencio y se acepto, o se salto). Que no quede nada. */
export async function limpiarAviso() {
  cancelarBeep();
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const abiertas = await reg?.getNotifications?.({ tag: "forge-descanso" });
    for (const n of abiertas || []) n.close();
  } catch { /* no habia ninguna */ }
}
