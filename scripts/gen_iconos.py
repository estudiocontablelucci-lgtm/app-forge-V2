"""
Genera los iconos PNG del manifest a partir de public/favicon.svg.

    python scripts/gen_iconos.py

Se rasteriza con el navegador que ya usamos para verificar, en vez de sumar una
dependencia de imagenes al proyecto. Los iconos quedan versionados en public/:
esto se corre solo cuando cambia el SVG.

Los tamanios salen de lo que pide cada plataforma:
  192 y 512  -> manifest (Android / escritorio)
  180        -> apple-touch-icon (iOS ignora el manifest para esto)
  512 maskable -> Android recorta el icono a la forma del sistema; sin el
                  margen del 20% la app queda con el rayo cortado.
"""
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RAIZ = Path(__file__).resolve().parent.parent
_svg = (RAIZ / "public" / "favicon.svg").read_text(encoding="utf-8")
# El SVG trae width/height fijos (48x46) que le ganan al contenedor: sin
# sacarlos, el rayo se dibuja en 48px en un lienzo de 512 y queda una mancha
# chica arriba a la izquierda.
SVG = re.sub(r'\s(width|height)="[^"]*"', "", _svg, count=2)
SVG = SVG.replace("<svg", '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"', 1)
FONDO = "#0D1117"          # el fondo oscuro del ecosistema: el rayo es claro
SALIDA = RAIZ / "public"

# (archivo, lado, margen) — el margen es la zona segura del icono maskable.
ICONOS = [
    ("icon-192.png", 192, 0.12),
    ("icon-512.png", 512, 0.12),
    ("icon-maskable-512.png", 512, 0.22),
    ("apple-touch-icon.png", 180, 0.12),
]


def html(lado: int, margen: float) -> str:
    pad = round(lado * margen)
    return f"""<!doctype html><html><body style="margin:0">
<div style="width:{lado}px;height:{lado}px;background:{FONDO};display:flex;
            align-items:center;justify-content:center;box-sizing:border-box;padding:{pad}px">
  <div style="width:100%;height:100%;display:flex">{SVG}</div>
</div></body></html>"""


def main() -> int:
    with sync_playwright() as p:
        nav = p.chromium.launch()
        for nombre, lado, margen in ICONOS:
            pg = nav.new_page(viewport={"width": lado, "height": lado})
            pg.set_content(html(lado, margen))
            pg.wait_for_timeout(120)
            pg.screenshot(path=str(SALIDA / nombre), omit_background=False)
            pg.close()
            print(f"  {nombre}  {lado}x{lado}  margen {int(margen * 100)}%")
        nav.close()
    print(f"\n{len(ICONOS)} iconos en public/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
