import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database.js';
import authRoutes from './routes/auth.js';
import presentationRoutes from './routes/presentations.js';
import promptChatRoutes from './routes/promptChat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/presentations', presentationRoutes);
app.use('/api/prompt-chat', promptChatRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

initDatabase();
app.listen(PORT, () => {
  console.log(`🚀 HyperBeing API running on http://localhost:${PORT}`);
});
