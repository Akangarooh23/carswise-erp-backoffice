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

## Conectar WhatsApp

Las horas que se le proponen a un cliente se le pueden mandar por WhatsApp, con
las horas como botones: pulsa una y la visita queda confirmada sola. Mientras no
este configurado, el mensaje sale en pantalla para copiarlo a mano, y eso no es
un apano temporal: fuera de la ventana de 24 horas de WhatsApp hace falta igual.

Hacen falta cuatro variables en el ERP. Ninguna pantalla ni ninguna ruta cambian.

| Variable | Que es |
|---|---|
| `WHATSAPP_TOKEN` | El token permanente de la app de Meta |
| `WHATSAPP_PHONE_ID` | El identificador del numero desde el que se escribe |
| `WHATSAPP_VERIFY_TOKEN` | Una palabra que eliges tu, para dar de alta el webhook |
| `WHATSAPP_APP_SECRET` | El secreto de la app. Con el se comprueba que lo que llega al webhook lo manda Meta y no cualquiera |

En la app de Meta, el webhook apunta a `https://<esta-api>/api/whatsapp/webhook`
con ese mismo token de verificacion.

Meta no admite mas de tres botones por mensaje. Con mas de tres horas se manda el
texto numerado y la respuesta se aplica a mano desde la Agenda: recortarle horas
que el vendedor si ofrece seria peor.

Sin `WHATSAPP_APP_SECRET` el webhook acepta lo que le llegue sin comprobar la
firma. Es lo que habia antes de existir la variable, pero con el numero conectado
conviene ponerla: sin ella, quien sepa el identificador de una cita y una de sus
horas propuestas puede darla por elegida.
