# FORGE — Gym Training Tracker

App de tracking de entrenamiento para gimnasio. Reemplaza el sistema de Google Sheets con una interfaz mobile-first optimizada para usar en el gym.

## Live

**https://estudiocontablelucci-lgtm.github.io/app-forge-V2/**

> El deploy sale de `main` via GitHub Actions. Una rama feature commiteada **no** esta
> en produccion hasta que se mergea y se pushea a `main`.

## Stack

- React 19 + Vite 8 (SPA, JSX sin TypeScript)
- CSS embebido como template string — sin build de estilos aparte
- localStorage (`forge-v2`) con migracion automatica v1 -> v2
- `xlsx` (SheetJS) para import/export client-side
- GitHub Pages (CI/CD via GitHub Actions)
- Fase 4 en curso: Turso / libSQL + NextAuth (schema ya aplicado, ver `db/`)

## Features actuales

- **Programas multiples**: crear vacio, desde plantilla predefinida, duplicar, eliminar
- **Programa**: 33 ejercicios (Ciclo 2 DUP, 3 sesiones), editable, semanas y deload configurables
- **Import Excel**: wizard de 3 pasos (subir, mapear columnas, vista previa) con plantilla descargable
- **Superserie blocks**: 2-4 ejercicios agrupados en la misma pantalla
- **Health check**: sueno/estres/energia pre-sesion (1-5)
- **Entrenamiento activo**: inputs KG/REPS/RIR, referencia de la semana anterior, notas por ejercicio
- **Timer de descanso**: arranca solo al cerrar la vuelta; en superserie espera a que la serie
  este completa en todos los ejercicios del bloque
- **Semaforo de autorregulacion**: verde (subir) / amarillo (mantener) / rojo (revisar)
- **Historial**: sesiones completadas expandibles con semaforo por ejercicio
- **Export a Excel**: hoja `Sesiones` (una fila por sesion) + hoja `Series` (una fila por set,
  con kg/reps/RIR/e1RM) — el grano que sirve para tabla dinamica
- **Progreso**: e1RM Brzycki por ejercicio, tonelaje semanal con deltas
- **Deload**: series-1 automatico
- **Re-entry flow**: revisar/editar una sesion ya registrada o empezarla de cero

## Roadmap

1. ~~MVP: programa, entrenamiento, timer, superseries, e1RM~~ Done
2. ~~Health check, historial, semaforo, superset blocks~~ Done
3. ~~Programas multiples, descripciones por ejercicio, import Excel, export del historial~~ Done
4. **En curso** — Persistencia real (Turso) + auth (NextAuth) + multi-device
5. Roles coach/atleta + dashboard del entrenador
6. PWA offline (service worker + sync engine)

El producto apunta a entrenadores con muchos alumnos: el entrenador carga el programa,
define las referencias **por alumno** y analiza las metricas; el alumno registra el
entrenamiento. Un atleta independiente es simplemente un usuario sin entrenador — el
modelo no se bifurca. Ver `CONTEXT.md` para las decisiones y `forge-arquitectura.md`
para el diseno tecnico.

## Dev

```bash
npm install
npm run dev        # http://localhost:5173 (toma el siguiente puerto libre si esta ocupado)
npx vite --host    # acceso desde el celular en la misma red

npm run lint
npm run build
```

### Base de datos (Fase 4)

```bash
npm run migrate                    # aplica db/*.sql sobre db/local.db
DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run migrate   # contra Turso
```

Las migraciones son numeradas (`db/v01_init.sql`) y el runner es idempotente: saltea
lo ya aplicado. Una migracion aplicada **no se edita** — se agrega la siguiente.

### Utilidades

```bash
npm run gen:programa    # genera data/*.xlsx del programa SEED para importar por el wizard
npm run verify          # corre todas las verificaciones
```

- `verify:excel` — round-trip del import (13 campos + superseries) y del export del historial
- `verify:schema` — invariantes del schema sobre una base descartable: resolucion de refs
  por alumno y por semana, cascadas, constraints

Los scripts de verificacion extraen los helpers **reales** de `src/ForgeApp.jsx` en vez de
copiarlos, asi que no pueden divergir del codigo que corre en produccion.

## Documentacion

| Archivo | Que contiene |
|---|---|
| `CLAUDE.md` | Convenciones, estructura, zonas protegidas, datos del atleta |
| `CONTEXT.md` | Estado actual, features, decisiones tomadas con su porque |
| `forge-arquitectura.md` | Diseno tecnico completo: schema target, modelo coach/atleta, wireframes |
| `db/v01_init.sql` | Schema vigente (supersede la seccion 3.2 de forge-arquitectura.md) |
