# FORGE — Gym Training Tracker

App de tracking de entrenamiento para gimnasio. Reemplaza el sistema de Google Sheets con una interfaz mobile-first optimizada para usar en el gym.

## Live

**https://estudiocontablelucci-lgtm.github.io/app-forge-V2/**

## Stack

- React + Vite
- localStorage (futuro: Turso + NextAuth)
- GitHub Pages (CI/CD via GitHub Actions)

## Features actuales (MVP v2)

- **Programa**: 33 ejercicios (Ciclo 2 DUP 3 dias), editable
- **Superserie blocks**: 2-4 ejercicios agrupados en la misma pantalla
- **Health check**: sueno/estres/energia pre-sesion (1-5)
- **Entrenamiento activo**: inputs KG/REPS/RIR, timer de descanso, referencia semana anterior
- **Semaforo de autorregulacion**: verde (+2.5kg) / amarillo (mantener) / rojo (revisar)
- **Historial**: sesiones completadas expandibles con semaforo por ejercicio
- **Progreso**: e1RM Brzycki por ejercicio, tonelaje semanal con deltas
- **Deload**: series-1 automatico

## Roadmap

1. ~~MVP: programa, entrenamiento, timer, superseries, e1RM~~ Done
2. ~~Health check, historial, semaforo, superset blocks~~ Done
3. Persistencia real (Turso) + auth (NextAuth) + multi-device
4. Roles (trainer/athlete/autonomous) + dashboard trainer
5. Import XLSX + PWA offline

## Dev

```bash
npm install
npm run dev        # http://localhost:5173
npx vite --host    # acceso desde celular en la misma red
```
