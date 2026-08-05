"""
Verifica que las rutas que SALUD.md menciona existan en el disco.

    python scripts/verificar-rutas-salud.py

`SALUD.md` es el indice de la carpeta de salud y cita archivos por ruta. Un
indice que apunta a un archivo movido es peor que no tener indice: manda a
buscar donde no esta y hace pensar que el estudio se perdio.

Solo LEE. No mueve ni renombra nada.
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RAIZ = Path(r"C:/Users/agust/OneDrive/Documentos/Organizacion Personal/Salud")
INDICE = RAIZ / "SALUD.md"

# Rutas entre backticks que parezcan un archivo o una carpeta del arbol.
PATRON = re.compile(r"`([^`]+\.(?:pdf|xlsx|docx|md|jpeg|jpg|png)|[A-Z][^`]*/)`")


def main() -> int:
    if not INDICE.exists():
        print(f"no esta {INDICE}")
        return 1
    texto = INDICE.read_text(encoding="utf-8")

    vistas = []
    for m in PATRON.finditer(texto):
        ruta = m.group(1).strip()
        if ruta.startswith(("http", "C:")) or " " == ruta:
            continue
        linea = texto[: m.start()].count("\n") + 1
        vistas.append((linea, ruta))

    rotas = []
    for linea, ruta in vistas:
        destino = RAIZ / ruta
        if destino.exists():
            continue
        # ¿Existe con ese nombre en otro lado del arbol? Es el caso tipico:
        # alguien creo una subcarpeta y movio el archivo sin tocar el indice.
        nombre = Path(ruta).name
        candidatos = [p for p in RAIZ.rglob(nombre) if p.is_file() or p.is_dir()]
        rotas.append((linea, ruta, candidatos))

    print(f"{len(vistas)} rutas citadas en SALUD.md · {len(rotas)} rotas\n")
    for linea, ruta, candidatos in rotas:
        print(f"  linea {linea}: {ruta}")
        for c in candidatos:
            print(f"      esta en -> {c.relative_to(RAIZ)}")
        if not candidatos:
            print("      NO APARECE en ningun lado del arbol")
    return 0


if __name__ == "__main__":
    sys.exit(main())
