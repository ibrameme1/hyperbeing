import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getCreditsInfo } from '../services/stripeService.js';

const router = Router();

// ─── GET /api/user/credits ─────────────────────────────────────────────────
router.get('/credits', authenticateToken, (req, res) => {
  res.json(getCreditsInfo(req.user.id));
});

export default router;
