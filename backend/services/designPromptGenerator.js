import Anthropic from '@anthropic-ai/sdk';
import { recordTokenUsage } from './stripeService.js';
import { logger, requestContext } from './logger.js';
import { tracer } from './tracer.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '../prompts/design_prompt_system.md'),
  'utf-8'
);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Nova crafts `count` image-generation prompts from the user's brief and any
// reference images. Returns an array of exactly `count` prompt strings.
// Falls back to repeating the user's brief on any failure so the design
// batch never gets stuck.
export async function craftDesignPrompts(userPrompt, attachedImages = [], count = 1, userId = null) {
  const _tid = requestContext.getStore()?.requestId;
  const _t = Date.now();
  tracer.recordStep(_tid, 'design_prompt_generator', 'started', 0);

  const fallback = Array.from({ length: count }, () => userPrompt?.trim() || 'A premium, professionally designed visual.');

  try {
    const userContent = [];
    for (const img of attachedImages) {
      if (img?.data) {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType || 'image/png',
            data: img.data.replace(/^data:[^;]+;base64,/, ''),
          },
        });
      }
    }

    userContent.push({
      type: 'text',
      text: `BRIEF:\n${userPrompt?.trim() || '(no text brief provided — rely on the reference images)'}\n\nIMAGE COUNT (N): ${count}`,
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    if (userId) recordTokenUsage(userId, response.usage?.input_tokens, response.usage?.output_tokens);

    const rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    const prompts = Array.isArray(parsed?.prompts) ? parsed.prompts.filter(p => typeof p === 'string' && p.trim()) : [];
    if (prompts.length === 0) {
      logger.warn('design prompt generator returned no usable prompts', { preview: rawText?.slice(0, 200) });
      tracer.recordStep(_tid, 'design_prompt_generator', 'completed', Date.now() - _t);
      return fallback;
    }

    // Normalize to exactly `count` prompts — repeat/truncate as needed.
    const result = Array.from({ length: count }, (_, i) => prompts[i % prompts.length]);
    tracer.recordStep(_tid, 'design_prompt_generator', 'completed', Date.now() - _t);
    return result;
  } catch (err) {
    logger.error('design prompt generator failed', { errorMessage: err.message });
    tracer.recordStep(_tid, 'design_prompt_generator', 'failed', Date.now() - _t, err.message);
    return fallback;
  }
}
