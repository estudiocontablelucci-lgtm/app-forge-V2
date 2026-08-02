"""
Abre la app en un navegador headless y reporta lo que pasa en el cliente.

    python scripts/check_ui.py                          # localhost:3000, todas las rutas
    python scripts/check_ui.py --base http://localhost:3001
    python scripts/check_ui.py --ruta /login --shot login.png

Existe porque el build y los verify:* no ven el navegador: una app que compila
y responde 200 puede quedar en blanco si algo rompe al hidratar. Esto abre la
pagina de verdad, espera a que hidrate y reporta errores de consola.

Sale con 1 si alguna ruta no hidrata o tira un error de pagina, asi que sirve
para verificar y no solo para mirar.

Requiere playwright (ya instalado en el Python del sistema):
    pip install playwright && playwright install chromium
"""
import argparse
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Texto que tiene que aparecer para dar la ruta por viva. Sin esto, una pagina
# en blanco sin errores de consola pasaria como buena.
RUTAS = {
    "/": "Entrenar",
    "/login": "FORGE",
    # Sin sesion muestra el cartel para entrar, que es lo que corresponde: lo
    # que se verifica aca es que la ruta hidrate, no el flujo del entrenador.
    # Ese vive en check_coach_ui.py, que si necesita dos sesiones.
    "/entrenador": "Entrenador",
}


def revisar(pagina, base: str, ruta: str, espera: str, shot: str | None) -> bool:
    consola: list[tuple[str, str]] = []
    errores: list[str] = []
    pagina.on("console", lambda m: consola.append((m.type, m.text)))
    pagina.on("pageerror", lambda e: errores.append(str(e)))

    url = base.rstrip("/") + ruta
    pagina.goto(url, wait_until="networkidle", timeout=30000)
    pagina.wait_for_timeout(2000)

    texto = pagina.inner_text("body").strip()
    hidrato = bool(texto)
    tiene_marca = espera in texto if espera else True

    fallos = [t for t in consola if t[0] == "error"]
    ok = hidrato and tiene_marca and not errores and not fallos

    print(f"\n{'ok ' if ok else 'FALLA'}  {url}")
    if not hidrato:
        print("       la pagina quedo vacia — no hidrato")
    elif not tiene_marca:
        print(f"       no encontre {espera!r} en la pantalla")
        print(f"       vi: {texto[:200]}")
    for e in errores:
        print(f"       error de pagina: {e[:300]}")
    for tipo, txt in fallos:
        print(f"       consola [{tipo}]: {txt[:300]}")
    if ok:
        primera = texto.splitlines()[0] if texto.splitlines() else ""
        print(f"       hidrato · {len(texto)} chars · empieza con {primera!r}")

    if shot:
        pagina.screenshot(path=shot, full_page=True)
        print(f"       captura: {shot}")

    return ok


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--ruta", help="revisar una sola ruta")
    ap.add_argument("--shot", help="guardar captura (solo con --ruta)")
    args = ap.parse_args()

    objetivos = {args.ruta: RUTAS.get(args.ruta, "")} if args.ruta else RUTAS

    with sync_playwright() as p:
        navegador = p.chromium.launch()
        # Contexto nuevo por corrida: sin service workers ni cache heredados de
        # otro proyecto que haya usado el mismo puerto.
        contexto = navegador.new_context()
        resultados = []
        for ruta, espera in objetivos.items():
            pagina = contexto.new_page()
            resultados.append(revisar(pagina, args.base, ruta, espera, args.shot))
            pagina.close()
        navegador.close()

    if all(resultados):
        print(f"\nOK  {len(resultados)} ruta(s) hidratan sin errores de consola")
        return 0
    print(f"\nFALLO  {resultados.count(False)} de {len(resultados)} ruta(s)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
