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

// Forcing a tool call guarantees the SDK gives us back already-parsed JSON,
// even when prompts contain quotes, newlines, or other characters that are
// awkward to embed in a hand-rolled JSON response.
const PROMPTS_TOOL = {
  name: 'submit_design_prompts',
  description: 'Submit the crafted image-generation prompts for the user\'s design brief.',
  input_schema: {
    type: 'object',
    properties: {
      prompts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exactly N image-generation prompts, one per requested image, each a complete self-contained prompt.',
      },
    },
    required: ['prompts'],
  },
};

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
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      tools: [PROMPTS_TOOL],
      tool_choice: { type: 'tool', name: 'submit_design_prompts' },
      messages: [{ role: 'user', content: userContent }],
    });

    if (userId) recordTokenUsage(userId, response.usage?.input_tokens, response.usage?.output_tokens);

    const toolUse = response.content.find(b => b.type === 'tool_use' && b.name === 'submit_design_prompts');
    const prompts = Array.isArray(toolUse?.input?.prompts)
      ? toolUse.input.prompts.filter(p => typeof p === 'string' && p.trim())
      : [];

    if (prompts.length === 0) {
      logger.warn('design prompt generator returned no usable prompts', { stopReason: response.stop_reason });
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
