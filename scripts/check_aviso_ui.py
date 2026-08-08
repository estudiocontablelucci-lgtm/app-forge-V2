"""
El beep del descanso, en un navegador de verdad.

    python scripts/check_aviso_ui.py --base http://localhost:3008

======================== QUE PRUEBA Y POR QUE ========================

El sintoma reportado fue "el temporizador no sono en el gimnasio", y eran dos
defectos que se tapaban entre si. `verify-aviso.mjs` cubre el modulo con un
doble del grafo de audio; lo que NO se puede probar ahi es el camino que
disparaba el bug, porque vive en ForgeApp y no en `lib/aviso.js`:

    un descanso RESTAURADO nunca agendaba el beep.

`agendarBeep` solo se llamaba al CREAR el descanso. Si el sistema mata la app a
mitad de serie —pantalla apagada, telefono en el banco, o sea el caso normal—
al volver el cronometro se lee del disco y cuenta perfecto, pero el grafo de
audio arranco de cero y no tiene nada agendado. El descanso se veia bien y
vencia mudo. Ninguna suite lo miraba: `check_descanso_ui.py` verifica que el
NUMERO sobreviva, que era el bug anterior, y el numero sobrevivia.

Aca se siembra el localStorage con un descanso YA CORRIENDO (que es exactamente
lo que deja una app que se murio a mitad de serie), se carga la app y se mira si
el beep quedo agendado en el grafo de audio.

======================== COMO SE MIRA UN BEEP ========================

No se escucha: se espia el grafo. Un `AudioContext` instrumentado ANTES de que
cargue la app anota cada oscilador que se crea, con su frecuencia y su hora de
arranque. Asi se distinguen las dos cosas que suenan sin ambiguedad:

  - 30 Hz sin hora  → el tono de sosten, el que evita que la pagina se congele
  - 880 / 1175 Hz con hora futura  → los tres pulsos del aviso, AGENDADOS

Agendar necesita un gesto del usuario, asi que el click no es decorado: es la
mitad de lo que se esta probando. La app se engancha al primer gesto que venga
justamente porque al abrir no hubo ninguno.
"""
import argparse
import json
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

fallas: list[str] = []


def check(label: str, ok: bool, detalle: str = "") -> None:
    print(f"  {'ok  ' if ok else 'FALLA'}  {label}{'' if ok else f' — {detalle}'}")
    if not ok:
        fallas.append(f"{label}: {detalle}")


# Cuanto le queda al descanso restaurado. Largo a proposito: el margen tiene que
# aguantar el arranque de la app sin que venza en el medio de la prueba.
RESTAN_S = 90

ESPIA = """
window.__osc = [];
const AC = window.AudioContext || window.webkitAudioContext;
class Espia extends AC {
  createOscillator() {
    const o = super.createOscillator();
    const start = o.start.bind(o);
    o.start = (t) => {
      // La frecuencia se lee al arrancar: tanto el tono de sosten como los
      // pulsos la fijan ANTES de start(), que es lo que los hace distinguibles.
      window.__osc.push({ freq: o.frequency.value, t: t ?? null, ahora: this.currentTime });
      return start(t);
    };
    return o;
  }
}
window.AudioContext = Espia;
window.webkitAudioContext = Espia;
"""


def estado(restan_ms: int) -> dict:
    """Lo que deja en el disco una app que se murio con el descanso corriendo."""
    return {
        "programs": [{
            "id": "p1", "name": "Prueba", "weeks": 4, "hasDeload": False,
            "sessions": [{"id": "A", "name": "Sesion A"}],
            "exercises": [{
                "id": "e1", "session": "A", "order": 1, "name": "Press banca",
                "group": "Pecho", "sets": 3, "refKg": 60, "repsMin": 8, "repsMax": 12,
                "tempo": "2-0-1-0", "rest": 120, "rir": "2", "superset": None,
                "technique": None, "unit": "reps", "description": "",
            }],
            "status": "active", "createdAt": 0,
        }],
        "activeProgramId": "p1",
        "logs": {},
        "history": [],
        # El descanso se guarda como VENCIMIENTO, no como cuenta regresiva: por
        # eso alcanza con escribir `fin` y la app deriva lo que queda.
        "timer": {"id": "dtest", "total": 120, "fin": None, "__restan": restan_ms},
    }


def pulsos(osc: list[dict]) -> list[dict]:
    return [o for o in osc if o["freq"] in (880, 1175)]


def sosten(osc: list[dict]) -> list[dict]:
    return [o for o in osc if o["freq"] == 30]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3008")
    args = ap.parse_args()
    base = args.base.rstrip("/")

    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(viewport={"width": 390, "height": 900})
        pg = ctx.new_page()

        errores: list[str] = []
        pg.on("pageerror", lambda e: errores.append(str(e)))

        pg.add_init_script(ESPIA)
        # `fin` se calcula en el navegador y no en Python: la hora de la maquina
        # que corre el test y la del navegador no tienen por que coincidir, y un
        # descanso "vencido hace rato" se descarta al restaurar.
        pg.add_init_script(
            "try { if (!localStorage.getItem('forge-v2')) {"
            "  const s = %s;"
            "  s.timer.fin = Date.now() + s.timer.__restan; delete s.timer.__restan;"
            "  localStorage.setItem('forge-v2', JSON.stringify(s)); } } catch (e) {}"
            % json.dumps(estado(RESTAN_S * 1000))
        )

        pg.goto(base, wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(2500)

        print("\nel descanso restaurado")
        barra = pg.locator(".timerbar")
        check("la app lo levanta del disco y lo muestra", barra.count() > 0,
              "no hay barra de descanso: no se restauro y el resto no prueba nada")
        if barra.count() == 0:
            nav.close()
            return 1

        antes = pg.evaluate("window.__osc")
        # Informativo, no un check: si el navegador deja el audio corriendo sin
        # gesto, esto ya trae los osciladores y no significa que algo este mal.
        print(f"       (antes del gesto habia {len(antes)} oscilador(es))")

        print("\nel beep queda AGENDADO al primer gesto")
        # Un click de Playwright es un gesto de confianza, que es lo que el
        # navegador exige para dejar sonar audio. Se toca la tabbar por indice.
        pg.locator(".tabbar button").nth(1).click()
        pg.wait_for_timeout(1200)

        osc = pg.evaluate("window.__osc")
        ps = pulsos(osc)
        check("suenan los 3 pulsos del aviso, no uno ni ninguno", len(ps) == 3,
              f"se crearon {len(ps)} pulsos: el descanso restaurado vence en silencio")

        if ps:
            futuros = [o for o in ps if o["t"] is not None and o["t"] > o["ahora"]]
            check("estan AGENDADOS a futuro, no disparados ya", len(futuros) == len(ps),
                  f"{len(ps) - len(futuros)} pulso(s) sin hora futura — eso es un setTimeout disfrazado")
            if futuros:
                falta = min(o["t"] - o["ahora"] for o in futuros)
                # Margen ancho a proposito: entre sembrar y clickear pasan
                # segundos reales, y lo que importa es que apunte al vencimiento
                # y no a "dentro de un rato".
                ok = RESTAN_S - 25 <= falta <= RESTAN_S + 5
                check("apuntan al vencimiento del descanso", ok,
                      f"el primero cae en {falta:.1f}s y quedaban ~{RESTAN_S}s")

        check("el tono de sosten quedo sonando", len(sosten(osc)) >= 1,
              "sin el, la pagina se congela con la pantalla apagada y el beep agendado nunca sale")

        check("sin errores de JavaScript", not errores, "; ".join(errores[:3]))

        nav.close()

    if fallas:
        print(f"\nFALLO — {len(fallas)}:")
        for f in fallas:
            print(f"  - {f}")
        return 1
    print("\ntodo OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
