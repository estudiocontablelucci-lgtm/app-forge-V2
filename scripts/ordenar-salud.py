"""
Ordena la carpeta de Salud y deja el indice apuntando a donde estan las cosas.

    python scripts/ordenar-salud.py --dry
    python scripts/ordenar-salud.py

Que hace, y por que:

1. `Antiguos/` desaparece dentro de `Laboratorio/`. Los seis analisis de sangre
   son la misma serie —el indice los lista en una sola tabla— y estaban
   partidos por un criterio de "viejo" que no significa nada: 2017 es viejo hoy
   y 2026 lo va a ser en dos anos.

2. El Excel consolidado se va con ellos: es exclusivamente de sangre.

3. Los estudios de columna pasan a llevar la FECHA adelante. Vienen estudios
   nuevos, y `resonancia_lumbosacra.pdf` a secas no se distingue del que se
   haga el mes que viene.

4. El programa de tecnicas obsoleto se va a `_archivo/`. Se llama casi igual que
   el vigente y tiene el nombre mas largo, asi que parece el mas especifico.

5. `SALUD.md` queda con las rutas corregidas. Ocho de sus catorce referencias
   apuntaban a donde el archivo ya no estaba: tres analisis movidos a
   `Laboratorio/`, un `../` de mas en dos rutas, dos nombres con errores y un
   `Resultado Columna.pdf` que dejo de existir cuando se separo en dos.

NO borra nada: mueve y renombra. Idempotente.
"""
import argparse
import io
import shutil
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RAIZ = Path(r"C:/Users/agust/OneDrive/Documentos/Organizacion Personal/Salud")

MOVIMIENTOS = [
    # (origen, destino) — relativos a RAIZ
    ("Analisis medicos/Antiguos/Analisis de sangre 2011.pdf",
     "Analisis medicos/Laboratorio/2011-07-28 Analisis de sangre.pdf"),
    ("Analisis medicos/Antiguos/Analisis de sangre Hosp Austral 2014.pdf",
     "Analisis medicos/Laboratorio/2014-09-23 Analisis de sangre - Hosp Austral.pdf"),
    ("Analisis medicos/Antiguos/Analisis de sangre Swiss Medical 2017.pdf",
     "Analisis medicos/Laboratorio/2017-04-08 Analisis de sangre - Swiss Medical.pdf"),
    ("Analisis medicos/Laboratorio/Analisis de sangre Favaloro 2023.pdf",
     "Analisis medicos/Laboratorio/2023-06-08 Analisis de sangre - Favaloro.pdf"),
    ("Analisis medicos/Laboratorio/Analisis Sangre Favaloro 2024.pdf",
     "Analisis medicos/Laboratorio/2024-09-10 Analisis de sangre - Favaloro.pdf"),
    ("Analisis medicos/Laboratorio/Analisis de sangre 06.2026.pdf",
     "Analisis medicos/Laboratorio/2026-06-09 Analisis de sangre - Lab Maipu.pdf"),
    ("Analisis medicos/Analisis_Sangre_Tendencia_2011-2026.xlsx",
     "Analisis medicos/Laboratorio/Analisis_Sangre_Tendencia_2011-2026.xlsx"),

    ("Analisis medicos/Resultados columna/rx_columna_lumbar.pdf",
     "Analisis medicos/Resultados columna/2024-05-30 Rx columna lumbar.pdf"),
    ("Analisis medicos/Resultados columna/resonancia_lumbosacra.pdf",
     "Analisis medicos/Resultados columna/2024-05-30 RM lumbosacra.pdf"),
    ("Analisis medicos/Resultados columna/resonancia_lumbosacra (escaneo en papel).pdf",
     "Analisis medicos/Resultados columna/2024-05-30 RM lumbosacra (escaneo en papel).pdf"),

    ("Sistema cronobiologico/Claude/programa_tecnicas_ciclo2 sin belt quat.md",
     "Sistema cronobiologico/Claude/_archivo/programa_tecnicas_ciclo2 sin belt quat.md"),
]

# Correcciones al indice. (viejo, nuevo). Se aplican una sola vez.
INDICE = [
    ("`Analisis medicos/Antiguos/Analisis de sangre 2011.pdf`",
     "`Analisis medicos/Laboratorio/2011-07-28 Analisis de sangre.pdf`"),
    ("`Analisis medicos/Antiguos/Analisis de sangre Hosp Austral 2014.pdf`",
     "`Analisis medicos/Laboratorio/2014-09-23 Analisis de sangre - Hosp Austral.pdf`"),
    ("`Analisis medicos/Antiguos/Analisis de sangre Swiss Medical 2017.pdf`",
     "`Analisis medicos/Laboratorio/2017-04-08 Analisis de sangre - Swiss Medical.pdf`"),
    ("`Analisis medicos/Analisis de sangre Favaloro 2023.pdf`",
     "`Analisis medicos/Laboratorio/2023-06-08 Analisis de sangre - Favaloro.pdf`"),
    ("`Analisis medicos/Analisis Sangre Favaloro 2024.pdf`",
     "`Analisis medicos/Laboratorio/2024-09-10 Analisis de sangre - Favaloro.pdf`"),
    ("`Analisis medicos/Analisis de sangre 06.2026.pdf`",
     "`Analisis medicos/Laboratorio/2026-06-09 Analisis de sangre - Lab Maipu.pdf`"),
    ("`Analisis medicos/Analisis_Sangre_Tendencia_2011-2026.xlsx`",
     "`Analisis medicos/Laboratorio/Analisis_Sangre_Tendencia_2011-2026.xlsx`"),

    # El duplicado del eco 2023 no esta en el disco.
    ("`Analisis medicos/Ergometria/Ergometria Favaloro 2023.pdf` (eco) + `Ergometria 2 Favaloro 2023.pdf` (duplicado)",
     "`Analisis medicos/Ergometria/Ergometria Favaloro 2023.pdf` (eco)"),
    # "Favoloro" y sin la carpeta.
    ("`Ergometria 2 Favoloro 2024.pdf` (trazados ECG completos, 13 págs)",
     "`Analisis medicos/Ergometria/Ergometria 2 Favaloro 2024.pdf` (trazados ECG completos, 13 págs)"),

    # `Resultado Columna.pdf` dejo de existir: son dos estudios distintos.
    ("- **Archivo:** `Analisis medicos/Resultados columna/Resultado Columna.pdf`",
     "- **Archivos:** `Analisis medicos/Resultados columna/2024-05-30 Rx columna lumbar.pdf` y "
     "`Analisis medicos/Resultados columna/2024-05-30 RM lumbosacra.pdf`"),

    # SALUD.md vive DENTRO de Salud/: el `../` sale de la carpeta.
    ("`../Sistema cronobiologico/Claude/CONTEXTO_SESION.md`",
     "`Sistema cronobiologico/Claude/CONTEXTO_SESION.md`"),
    ("`../Sistema cronobiologico/Claude/rutina_gym.md`",
     "`Sistema cronobiologico/Claude/rutina_gym.md`"),

    # Bardach informa, Imposti solicita. La correccion ya estaba hecha en
    # rutina_gym.md el 04/08 y aca habia quedado la version vieja, con typo.
    ("- **Médico informante:** Dr. Gastón Bardach (MP 113.913) / Dr. Impositi Félix",
     "- **Médico informante:** Dr. Gastón Bardach (MP 113.913). **Solicitante:** Dr. Imposti Félix"),
]

# El otro documento que cita los archivos de columna por nombre.
RUTINA = [
    ("- `rx_columna_lumbar.pdf` — Rx de columna lumbar frente y perfil (30/05/2024).",
     "- `2024-05-30 Rx columna lumbar.pdf` — Rx de columna lumbar frente y perfil."),
    ("- `resonancia_lumbosacra.pdf` — RM lumbosacra 1.5T, 3 páginas con imágenes y firma. **Original digital.**",
     "- `2024-05-30 RM lumbosacra.pdf` — RM lumbosacra 1.5T, 3 páginas con imágenes y firma. **Original digital.**"),
    ("- `resonancia_lumbosacra (escaneo en papel).pdf` — foto del mismo informe, redundante y de peor calidad.",
     "- `2024-05-30 RM lumbosacra (escaneo en papel).pdf` — foto del mismo informe, redundante y de peor calidad."),
]


def texto(path: Path, cambios, dry: bool) -> int:
    if not path.exists():
        print(f"  NO ESTA  {path.name}")
        return 0
    original = io.open(path, encoding="utf-8").read()
    s = original
    hechos = 0
    for viejo, nuevo in cambios:
        if viejo in s:
            s = s.replace(viejo, nuevo)
            hechos += 1
        elif nuevo not in s:
            print(f"  ?  no encontre en {path.name}: {viejo[:60]}")
    if hechos and not dry:
        io.open(path, "w", encoding="utf-8", newline="").write(s)
    print(f"  {path.name}: {hechos} correccion(es)")
    return hechos


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    print("archivos\n")
    movidos = 0
    for origen, destino in MOVIMIENTOS:
        o, d = RAIZ / origen, RAIZ / destino
        if d.exists():
            print(f"  =  ya esta  {destino}")
            continue
        if not o.exists():
            print(f"  ?  no esta  {origen}")
            continue
        print(f"  →  {origen}\n     {destino}")
        movidos += 1
        if not args.dry:
            d.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(o), str(d))

    print("\nindice y referencias\n")
    texto(RAIZ / "SALUD.md", INDICE, args.dry)
    texto(RAIZ / "Sistema cronobiologico/Claude/rutina_gym.md", RUTINA, args.dry)

    # Las carpetas que quedaron vacias se sacan; si tienen algo, se avisa.
    vacia = RAIZ / "Analisis medicos/Antiguos"
    if vacia.exists():
        resto = list(vacia.iterdir())
        if resto:
            print(f"\n  OJO: 'Antiguos' no quedo vacia — {[p.name for p in resto]}")
        else:
            print("\n  'Antiguos' quedo vacia y se saca")
            if not args.dry:
                vacia.rmdir()

    if args.dry:
        print(f"\n--dry: no se toco nada ({movidos} movimiento/s pendiente/s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
