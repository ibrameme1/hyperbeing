import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { generatePromptResponse } from '../services/promptGenerator.js';

const router = Router();

// POST /api/prompt-chat/:sessionId
router.post('/:sessionId', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const { message, images = [] } = req.body;

  if (!message?.trim() && images.length === 0) {
    return res.status(400).json({ error: 'Please type a message or attach an image to continue.' });
  }

  const db = getDb();

  // Load or create session
  let session = db.prepare(
    'SELECT * FROM prompt_sessions WHERE id = ? AND user_id = ?'
  ).get(sessionId, req.user.id);

  if (!session) {
    db.prepare(
      'INSERT INTO prompt_sessions (id, user_id, history) VALUES (?, ?, ?)'
    ).run(sessionId, req.user.id, '[]');
    session = { id: sessionId, user_id: req.user.id, history: '[]' };
  }

  let history = [];
  try { history = JSON.parse(session.history); } catch {}

  try {
    const result = await generatePromptResponse(history, message || '', images);

    db.prepare(
      'UPDATE prompt_sessions SET history = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(JSON.stringify(result.updatedHistory), sessionId);

    res.json({
      mode: result.mode,
      message: result.message,
      readyToGenerate: result.readyToGenerate,
    });
  } catch (err) {
    console.error('Prompt chat error:', err);
    res.status(500).json({ error: 'Nova couldn\'t generate a response right now. Please try again.' });
  }
});

// DELETE /api/prompt-chat/:sessionId — reset session
router.delete('/:sessionId', authenticateToken, (req, res) => {
  getDb()
    .prepare('DELETE FROM prompt_sessions WHERE id = ? AND user_id = ?')
    .run(req.params.sessionId, req.user.id);
  res.json({ message: 'Session cleared' });
});

export default router;
