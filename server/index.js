import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { db } from './db.js';
import { authMiddleware } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { appRoutes } from './routes/app.js';
import { adminRoutes } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(authMiddleware(db));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'LeaveDesk', time: new Date().toISOString() });
});
app.use('/api/auth', authRoutes(db));
app.use('/api/admin', adminRoutes(db));
app.use('/api', appRoutes(db));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        '<div style="font-family:system-ui;padding:40px;line-height:1.6">' +
          '<h1>LeaveDesk API is running</h1>' +
          '<p>The web client has not been built yet. Run <code>npm run dev</code> and open ' +
          '<a href="http://localhost:5173">http://localhost:5173</a>, or run <code>npm run build</code>.</p>' +
          '</div>',
      );
  });
}

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body is not valid JSON.' });
  }
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

// `node --watch` restarts can race the previous process releasing the port,
// so retry briefly instead of exiting and leaving the API offline.
function listen(attempt = 1) {
  const server = app.listen(PORT, () => {
    console.log(`LeaveDesk API listening on http://localhost:${PORT}`);
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && attempt < 20) {
      setTimeout(() => listen(attempt + 1), 300);
      return;
    }
    throw error;
  });
}

listen();
