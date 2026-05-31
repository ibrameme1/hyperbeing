import Anthropic from '@anthropic-ai/sdk';
import { recordTokenUsage } from './stripeService.js';
import { logger } from './logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '../prompts/system_prompt.md'),
  'utf-8'
);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generatePromptResponse(history, userMessage, attachedImages = [], userId = null) {
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

  userContent.push({ type: 'text', text: userMessage });

  const messages = [
    ...history,
    { role: 'user', content: userContent },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages,
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
    logger.warn('prompt generator returned non-JSON', { preview: rawText?.slice(0, 200) });
    parsed = {
      mode: 'diagnostic',
      message: rawText,
      ready_to_generate: false,
    };
  }

  const updatedHistory = [
    ...messages,
    { role: 'assistant', content: rawText },
  ];

  return {
    mode: parsed.mode,
    message: parsed.message,
    readyToGenerate: parsed.ready_to_generate === true,
    updatedHistory,
  };
}
