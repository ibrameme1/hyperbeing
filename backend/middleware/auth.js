import jwt from 'jsonwebtoken';
import { getDb } from '../database.js';
import { requestContext } from '../services/logger.js';
import { tracer } from '../services/tracer.js';

export { authenticateToken as authMiddleware };
export function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'You must be signed in to do that.' });

  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);
    const user = getDb()
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .get(userId);

    if (!user) return res.status(401).json({ error: 'Account not found. It may have been deleted.' });
    req.user = user;
    req.userId = userId;
    // Propagate userId into the active request context so all downstream
    // logger calls automatically include it without manual threading.
    const ctx = requestContext.getStore();
    if (ctx) ctx.userId = userId;
    tracer.patchUserId(ctx?.requestId, userId);
    next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}
