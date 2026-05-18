// Vercel serverless entry point — wraps the compiled Express app.
// Uses dynamic import() because apps/api is an ESM package.

let initPromise = null;
let appHandler = null;

async function init() {
  const [{ createApp }, { ensureSchema }] = await Promise.all([
    import('../apps/api/dist/app.js'),
    import('../apps/api/dist/db/schema.js'),
  ]);
  await ensureSchema();
  appHandler = createApp();
}

module.exports = async (req, res) => {
  if (!initPromise) initPromise = init();
  await initPromise;
  appHandler(req, res);
};
