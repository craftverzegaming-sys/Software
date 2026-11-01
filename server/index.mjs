import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPaymentNotification } from './payment-provider.mjs';

const app = express();
const port = Number(process.env.PORT || 8787);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(rootDir, '.data'));
const uploadsDir = path.join(dataDir, 'uploads');
const storePath = path.join(dataDir, 'store.json');
const isProduction = process.env.NODE_ENV === 'production';
const allowedQrTypes = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
]);

if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
  throw new Error('Set ADMIN_PASSWORD to a unique value of at least 12 characters.');
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('Set SESSION_SECRET to a random value of at least 32 characters.');
}

await mkdir(uploadsDir, { recursive: true, mode: 0o700 });

function demoTransactions() {
  const now = Date.now();
  return [
    {
      id: crypto.randomUUID(), amount: 2450, customerName: 'Asha S.', description: 'Custom order',
      status: 'verified', providerReference: 'DEMO-7K2P4D', customerReference: 'DEMO-7K2P4D',
      createdAt: new Date(now - 1000 * 60 * 38).toISOString(), isMock: true,
    },
    {
      id: crypto.randomUUID(), amount: 1299, customerName: 'Kabir M.', description: 'Digital artwork',
      status: 'verified', providerReference: 'DEMO-3F8N1Q', customerReference: 'DEMO-3F8N1Q',
      createdAt: new Date(now - 1000 * 60 * 60 * 3).toISOString(), isMock: true,
    },
    {
      id: crypto.randomUUID(), amount: 750, customerName: 'Customer', description: 'Craft order',
      status: 'pending', providerReference: null, customerReference: null,
      createdAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(), isMock: true,
    },
    {
      id: crypto.randomUUID(), amount: 120, customerName: 'Customer', description: 'Sample payment',
      status: 'failed', providerReference: 'DEMO-9B5J2L', customerReference: 'DEMO-9B5J2L',
      createdAt: new Date(now - 1000 * 60 * 60 * 22).toISOString(), isMock: true,
    },
  ];
}

async function readStore() {
  try {
    return JSON.parse(await readFile(storePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const store = {
      settings: {
        merchantName: 'CRAFTVERZE PAY',
        upiId: process.env.UPI_ID || '',
        qrImageUrl: null,
      },
      transactions: demoTransactions(),
    };
    await writeStore(store);
    return store;
  }
}

async function writeStore(store) {
  const tempPath = `${storePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  await rename(tempPath, storePath);
  await chmod(storePath, 0o600);
}

const store = await readStore();

function signSession(expiry) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(expiry).digest('base64url');
}

function isAdmin(req) {
  const sessionCookie = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('cvpay_admin='));
  if (!sessionCookie) return false;

  const [expiry, signature] = decodeURIComponent(sessionCookie.slice('cvpay_admin='.length)).split('.');
  if (!expiry || !signature || Number(expiry) < Date.now()) return false;
  const expected = signSession(expiry);
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Admin sign-in required.' });
  next();
}

function validUpiId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(value);
}

function createPaymentUri({ amount, description, paymentId }) {
  const params = new URLSearchParams({
    pa: store.settings.upiId,
    pn: store.settings.merchantName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: description || `Payment to ${store.settings.merchantName}`,
    tr: paymentId,
  });
  return `upi://pay?${params.toString()}`;
}

app.use(express.json({
  limit: '16kb',
  verify: (req, _res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
}));
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use('/uploads', express.static(uploadsDir, { maxAge: '1d', immutable: true }));

app.get('/api/public/config', (_req, res) => {
  res.json({
    merchantName: store.settings.merchantName,
    upiId: store.settings.upiId,
    qrImageUrl: store.settings.qrImageUrl,
  });
});

const loginAttempts = new Map();
app.post('/api/admin/login', (req, res) => {
  const now = Date.now();
  const clientIp = req.ip;
  const attempt = loginAttempts.get(clientIp);
  if (attempt && attempt.until > now && attempt.count >= 8) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }

  const supplied = Buffer.from(typeof req.body?.password === 'string' ? req.body.password : '');
  const expected = Buffer.from(process.env.ADMIN_PASSWORD);
  const matches = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  if (!matches) {
    loginAttempts.set(clientIp, attempt && attempt.until > now
      ? { count: attempt.count + 1, until: attempt.until }
      : { count: 1, until: now + 15 * 60 * 1000 });
    return res.status(401).json({ error: 'That password did not match.' });
  }

  loginAttempts.delete(clientIp);
  const expiry = String(now + 12 * 60 * 60 * 1000);
  const cookie = `cvpay_admin=${encodeURIComponent(`${expiry}.${signSession(expiry)}`)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${isProduction ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', cookie);
  res.json({ authenticated: true });
});

app.post('/api/admin/logout', (_req, res) => {
  res.setHeader('Set-Cookie', `cvpay_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${isProduction ? '; Secure' : ''}`);
  res.json({ authenticated: false });
});

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const transactions = [...store.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({
    settings: store.settings,
    transactions,
    verifiedCount: transactions.filter((transaction) => transaction.status === 'verified').length,
    verifiedTotal: transactions
      .filter((transaction) => transaction.status === 'verified')
      .reduce((total, transaction) => total + transaction.amount, 0),
  });
});

app.put('/api/admin/config', requireAdmin, async (req, res, next) => {
  try {
    const { merchantName, upiId } = req.body || {};
    if (typeof merchantName !== 'string' || merchantName.trim().length < 2 || merchantName.trim().length > 60) {
      return res.status(400).json({ error: 'Enter a merchant name between 2 and 60 characters.' });
    }
    if (upiId !== '' && !validUpiId(upiId)) {
      return res.status(400).json({ error: 'Enter a valid UPI ID, such as name@bank.' });
    }
    store.settings.merchantName = merchantName.trim();
    store.settings.upiId = upiId.trim();
    await writeStore(store);
    res.json({ settings: store.settings });
  } catch (error) {
    next(error);
  }
});

const uploadQr = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsDir),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${allowedQrTypes.get(file.mimetype) || '.img'}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedQrTypes.has(file.mimetype)) return callback(new Error('Upload a PNG, JPEG or WebP QR image.'));
    callback(null, true);
  },
});

app.post('/api/admin/qr', requireAdmin, uploadQr.single('qr'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a QR image to upload.' });
    const oldFilename = path.basename(store.settings.qrImageUrl || '');
    store.settings.qrImageUrl = `/uploads/${req.file.filename}`;
    await writeStore(store);
    if (oldFilename && oldFilename !== req.file.filename) {
      await unlink(path.join(uploadsDir, oldFilename)).catch(() => {});
    }
    res.json({ settings: store.settings });
  } catch (error) {
    next(error);
  }
});

app.post('/api/payments', async (req, res, next) => {
  try {
    const { amount: rawAmount, description: rawDescription } = req.body || {};
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000 || Math.round(amount * 100) !== amount * 100) {
      return res.status(400).json({ error: 'Enter an amount between ₹0.01 and ₹1,00,00,000 with up to two decimals.' });
    }
    if (!validUpiId(store.settings.upiId)) {
      return res.status(409).json({ error: 'The merchant UPI ID has not been configured yet.' });
    }
    const description = typeof rawDescription === 'string' ? rawDescription.trim().slice(0, 80) : '';
    const paymentId = crypto.randomUUID();
    const transaction = {
      id: paymentId,
      amount,
      customerName: 'Customer',
      description,
      status: 'pending',
      providerReference: null,
      customerReference: null,
      createdAt: new Date().toISOString(),
      isMock: false,
    };
    store.transactions.push(transaction);
    await writeStore(store);
    res.status(201).json({ paymentId, status: 'pending', paymentUri: createPaymentUri({ amount, description, paymentId }) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/payments/:paymentId', (req, res) => {
  const transaction = store.transactions.find((item) => item.id === req.params.paymentId && !item.isMock);
  if (!transaction) return res.status(404).json({ error: 'Payment attempt not found.' });
  res.json({ paymentId: transaction.id, status: transaction.status, updatedAt: transaction.updatedAt || transaction.createdAt });
});

app.post('/api/webhooks/payment', async (req, res, next) => {
  try {
    const event = await verifyPaymentNotification(req);
    if (!event?.verified || typeof event.paymentId !== 'string' || !['verified', 'failed'].includes(event.status)) {
      return res.status(503).json({ error: 'No payment provider is configured to verify notifications.' });
    }
    const transaction = store.transactions.find((item) => item.id === event.paymentId && !item.isMock);
    if (!transaction) return res.status(404).json({ error: 'Payment attempt not found.' });
    if (transaction.status !== 'pending') return res.json({ received: true });

    transaction.status = event.status;
    transaction.providerReference = typeof event.providerReference === 'string'
      ? event.providerReference.slice(0, 120)
      : null;
    transaction.updatedAt = new Date().toISOString();
    await writeStore(store);
    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

const distDir = path.join(rootDir, 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res, next) => {
  res.sendFile(path.join(distDir, 'index.html'), (error) => {
    if (error) next();
  });
});

app.use((error, _req, res, _next) => {
  const message = error instanceof multer.MulterError
    ? error.code === 'LIMIT_FILE_SIZE' ? 'QR images must be 5 MB or smaller.' : 'The QR image could not be uploaded.'
    : error.message || 'The request could not be completed.';
  const status = error instanceof multer.MulterError
    || (typeof error.message === 'string' && error.message.startsWith('Upload a PNG')) ? 400 : 500;
  res.status(status).json({ error: message });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`CRAFTVERZE PAY server listening on port ${port}`);
});
