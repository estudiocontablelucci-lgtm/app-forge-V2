/**
 * Responde lo minimo posible. Existe para una sola pregunta: ¿se llega al
 * servidor AHORA?
 *
 * `navigator.onLine` no sirve para contestarla —dice si hay interfaz de red, y
 * un wifi sin salida a internet contesta que si— y esperar a que falle una
 * sincronizacion tampoco: sin senal `fetch` no falla rapido, asi que la app se
 * quedaba varios segundos afirmando "con conexión" con el telefono en modo
 * avion.
 *
 * Va bajo `/api/` a proposito: el service worker no cachea nada de ahi, asi que
 * una respuesta a esto es siempre red de verdad y nunca un eco del cache.
 */
export const dynamic = "force-dynamic";

export function GET() {
  // 204, sin cuerpo. Con cuerpo el pedido queda abierto hasta que alguien lo
  // lea, y aca no lo lee nadie: solo importa que haya contestado.
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
