import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
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
import { funnelRouter } from './routes/funnel.js';
import { analyticsRouter } from './routes/analytics.js';
import { contractsRouter } from './routes/contracts.js';
import { providerBillingRouter } from './routes/provider-billing.js';
import { invoiceDownloadRouter } from './routes/invoice-download.js';
import { visitsRouter } from './routes/visits.js';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

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
  app.use('/api', funnelRouter);
  app.use('/api', analyticsRouter);
  app.use('/api', contractsRouter);
  app.use('/api', providerBillingRouter);
  app.use('/api', invoiceDownloadRouter);
  app.use('/api', visitsRouter);

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'not_found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[server] Unhandled error:', err.message);
    res.status(500).json({ ok: false, error: 'internal_error' });
  });

  return app;
}
