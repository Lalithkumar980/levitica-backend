require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5001;

/** Allow typical home/LAN dev URLs (new Wi‑Fi = new IP; no need to edit this each time). */
function isPrivateLanOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:') return false;
    const h = u.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return true;
    const parts = h.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  } catch {
    return false;
  }
}

const fixedOrigins = [
  'http://localhost:3000',
  'http://localhost:8081',
  'https://levitica-mangement.netlify.app',
  'https://levitica-data-management.vercel.app',
];

// Configure CORS for production hosts + same Wi‑Fi / LAN (192.168.x.x, 10.x.x.x, etc.)
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || fixedOrigins.includes(origin) || isPrivateLanOrigin(origin)) {
      return cb(null, true);
    }
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Root — quick check that the HTTP server is up (independent of MongoDB)
app.get('/', (req, res) => {
  res.type('text/plain').send('API is running');
});

// Serve uploaded profile photos
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check – confirms backend is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

const { verifyToken } = require('./middleware/auth');
const { requireFinanceOrAdmin } = require('./middleware/roles');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const candidateRoutes = require('./routes/candidates');
const leadsRoutes = require('./routes/leads');
const contactsRoutes = require('./routes/contacts');
const companiesRoutes = require('./routes/companies');
const dealsRoutes = require('./routes/deals');
const activitiesRoutes = require('./routes/activities');
const tasksRoutes = require('./routes/tasks');
const documentsRoutes = require('./routes/documents');
const importRoutes = require('./routes/import');
const reportsRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const teamRoutes = require('./routes/team');
const invoicesRoutes = require('./routes/invoices');
const expensesRoutes = require('./routes/expenses');
const paymentsRoutes = require('./routes/payments');
const financeReportsRoutes = require('./routes/financeReports');
const hrRoutes = require('./routes/hr');
const trainingFeesRoutes = require('./routes/trainingFees');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/training-fees', trainingFeesRoutes);

// Protected API routes — verifyToken applied at app level
app.use('/api/v1/leads', verifyToken, leadsRoutes);
app.use('/api/v1/contacts', verifyToken, contactsRoutes);
app.use('/api/v1/companies', verifyToken, companiesRoutes);
app.use('/api/v1/deals', verifyToken, dealsRoutes);
app.use('/api/v1/activities', verifyToken, activitiesRoutes);
app.use('/api/v1/tasks', verifyToken, tasksRoutes);
app.use('/api/v1/documents', verifyToken, documentsRoutes);
app.use('/api/v1/import', verifyToken, importRoutes);
app.use('/api/v1/reports', verifyToken, reportsRoutes);
app.use('/api/v1/admin', verifyToken, adminRoutes);
app.use('/api/v1/team', verifyToken, teamRoutes);
app.use('/api/v1/finance/invoices', verifyToken, requireFinanceOrAdmin, invoicesRoutes);
app.use('/api/v1/finance/expenses', verifyToken, requireFinanceOrAdmin, expensesRoutes);
app.use('/api/v1/finance/payments', verifyToken, requireFinanceOrAdmin, paymentsRoutes);
app.use('/api/v1/finance/reports', verifyToken, requireFinanceOrAdmin, financeReportsRoutes);

// 404 — no route matched
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Error handler — standard 500 response
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err instanceof Error ? err.message : err);
  process.exit(1);
});
