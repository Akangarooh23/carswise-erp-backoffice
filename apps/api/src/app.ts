import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { healthRouter } from './routes/health.js';
import { personalRouter } from './routes/personal.js';
import { colasRouter } from './routes/colas.js';
import { datosRouter } from './routes/datos.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { usersRouter } from './routes/users.js';
import { marketplaceRouter } from './routes/marketplace.js';
import { appointmentsRouter } from './routes/appointments.js';
import { ticketsRouter } from './routes/tickets.js';
import { workshopsRouter } from './routes/workshops.js';
import { workshopLocationsRouter } from './routes/workshop-locations.js';
import { idcarsRouter } from './routes/idcars.js';
import { billingRouter } from './routes/billing.js';
import { leadsRouter } from './routes/leads.js';
import { documentosRouter } from './routes/documentos.js';
import { pedidosRouter } from './routes/pedidos.js';
import { tramitesRouter } from './routes/tramites.js';
import { funnelRouter } from './routes/funnel.js';
import { analyticsRouter } from './routes/analytics.js';
import { contractsRouter } from './routes/contracts.js';
import { providerBillingRouter } from './routes/provider-billing.js';
import { invoiceDownloadRouter } from './routes/invoice-download.js';
import { visitsRouter } from './routes/visits.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { apuntaCambios } from './middleware/auditoria.js';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  // Se guarda el cuerpo tal y como llegó. Meta firma lo que manda, y la firma
  // se comprueba sobre los bytes exactos: una vez interpretado y vuelto a
  // escribir, el JSON ya no es el mismo texto y la firma nunca cuadraría.
  app.use(express.json({
    limit: '4mb',
    verify: (req, _res, buf) => { (req as unknown as { cuerpoCrudo?: Buffer }).cuerpoCrudo = buf; },
  }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // Todo lo que cambia datos deja rastro. Va antes de las rutas para que
  // cubra también las que se escriban mañana.
  app.use('/api', apuntaCambios());

  // Estaba escrito en routes/health.ts y no lo enganchaba nadie: cualquier
  // vigilancia apuntada ahi daba la API por caida.
  app.use('/api', healthRouter);
  app.use('/api', personalRouter);
  app.use('/api', colasRouter);
  app.use('/api', datosRouter);
  app.use('/api', authRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', usersRouter);
  app.use('/api', marketplaceRouter);
  app.use('/api', appointmentsRouter);
  app.use('/api', ticketsRouter);
  app.use('/api', workshopsRouter);
  app.use('/api', workshopLocationsRouter);
  app.use('/api', idcarsRouter);
  app.use('/api', billingRouter);
  app.use('/api', leadsRouter);
  app.use('/api', documentosRouter);
  app.use('/api', pedidosRouter);
  app.use('/api', tramitesRouter);
  app.use('/api', funnelRouter);
  app.use('/api', analyticsRouter);
  app.use('/api', contractsRouter);
  app.use('/api', providerBillingRouter);
  app.use('/api', invoiceDownloadRouter);
  app.use('/api', visitsRouter);
  // Sin sesión: quien llama es Meta. Lo protege el token de verificación y que
  // la hora tenga que venir en un botón nuestro.
  app.use('/api', whatsappRouter);

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'not_found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Un cuerpo demasiado grande no es un fallo del servidor: es que alguien
    // ha subido un fichero que no cabe, y merece que se le diga.
    if ((err as { type?: string }).type === 'entity.too.large') {
      res.status(413).json({
        ok: false,
        error: 'demasiado_grande',
        detail: 'El fichero es demasiado grande. El máximo son 3 MB.',
      });
      return;
    }
    // Un identificador con la forma equivocada en la dirección —texto donde
    // Postgres espera un UUID o un número— tampoco es un fallo del servidor:
    // es que eso no existe. Devolvía un 500 en tres pantallas.
    if ((err as { code?: string }).code === '22P02') {
      res.status(404).json({ ok: false, error: 'no_encontrado' });
      return;
    }

    console.error('[server] Unhandled error:', err.message);
    res.status(500).json({ ok: false, error: 'internal_error' });
  });

  return app;
}
