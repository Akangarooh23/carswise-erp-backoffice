# Carswise ERP Backoffice

Proyecto separado para operar Carswise sin tocar codigo en el dia a dia.

## Incluye
- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- Roles iniciales: admin, support, operations, sales
- Endpoints base: health, auth login demo, profile

## Requisitos
- Node.js 20+

## Arranque rapido
1. Copia .env.example a .env y ajusta variables.
2. Instala dependencias:
   npm install
3. Levanta frontend y backend:
   npm run dev

Frontend: http://localhost:5174
Backend: http://localhost:4000

## Scripts
- npm run dev
- npm run dev:web
- npm run dev:api
- npm run build
- npm run start

## Proximo paso recomendado
Conectar el backend a tu base PostgreSQL real y crear modulos de tickets, citas y operaciones.
