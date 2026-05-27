import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database.js';
import authRoutes from './routes/auth.js';
import presentationRoutes from './routes/presentations.js';
import promptChatRoutes from './routes/promptChat.js';
import billingRoutes from './routes/billing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
// Raw body for Stripe webhook signature verification
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
  secret: process.env.JWT_SECRET || 'dev-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 5 * 60 * 1000 },
}));
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRoutes);
app.use('/api/presentations', presentationRoutes);
app.use('/api/prompt-chat', promptChatRoutes);
app.use('/api/billing', billingRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

initDatabase();
app.listen(PORT, () => {
  console.log(`🚀 HyperBeing API running on http://localhost:${PORT}`);
});
