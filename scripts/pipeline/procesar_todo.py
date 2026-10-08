"""
Corre el pipeline completo, en orden, y se detiene en el primer paso que falle.

Uso:  python scripts/pipeline/procesar_todo.py
      python scripts/pipeline/procesar_todo.py --desde 2     (reutiliza las bases ya preparadas)
"""
import subprocess
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
PASOS = ["01_preparar_bases.py", "02_agregar_indicadores.py", "03_agregar_docentes.py",
         "04_agregar_graduados.py", "05_agregar_estudiantes.py", "06_verificar.py"]
desde = int(sys.argv[sys.argv.index("--desde") + 1]) if "--desde" in sys.argv else 1

for paso in PASOS[desde - 1:]:
    print(f"\n{'=' * 70}\n{paso}\n{'=' * 70}", flush=True)
    t = time.time()
    r = subprocess.run([sys.executable, str(AQUI / paso)], cwd=AQUI)
    if r.returncode:
        sys.exit(f"\nFalló {paso} (código {r.returncode}). Los pasos siguientes no se ejecutaron.")
    print(f"({time.time() - t:.0f} s)")
print("\nListo: docs/data actualizado y verificado.")
