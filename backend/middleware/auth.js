import jwt from 'jsonwebtoken';
import { getDb } from '../database.js';

export function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);
    const user = getDb()
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .get(userId);

    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
