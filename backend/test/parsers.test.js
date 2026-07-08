import { describe, it, expect } from 'vitest';
import { extractPrefixedObjects } from '../services/claudeAgent.js';
import { isPrivateAddress } from '../services/urlGuard.js';

describe('extractPrefixedObjects (HEADER:/SLIDE: streaming parser)', () => {
  it('parses a header followed by slides', () => {
    const text = 'HEADER:{"total_slides":2}\nSLIDE:{"index":0}\nSLIDE:{"index":1}\n';
    const { objects, remaining } = extractPrefixedObjects(text);
    expect(objects.map(o => o.prefix)).toEqual(['HEADER:', 'SLIDE:', 'SLIDE:']);
    expect(JSON.parse(objects[1].jsonStr)).toEqual({ index: 0 });
    expect(remaining).toBe('');
  });

  it('leaves an incomplete trailing object in the buffer', () => {
    const text = 'SLIDE:{"index":0}\nSLIDE:{"index":1,"title":"unfin';
    const { objects, remaining } = extractPrefixedObjects(text);
    expect(objects).toHaveLength(1);
    expect(remaining.startsWith('SLIDE:{"index":1')).toBe(true);
  });

  it('handles braces and escaped quotes inside string values', () => {
    const text = 'SLIDE:{"title":"a {nested} \\" brace","n":1}';
    const { objects } = extractPrefixedObjects(text);
    expect(JSON.parse(objects[0].jsonStr).title).toBe('a {nested} " brace');
  });

  it('handles newlines inside string values', () => {
    const text = 'SLIDE:{"prompt":"line one\\nline two"}extra';
    const { objects } = extractPrefixedObjects(text);
    expect(objects).toHaveLength(1);
  });
});

describe('isPrivateAddress (SSRF guard)', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::',
    'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
  ])('flags %s as private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700::1111'])(
    'allows public %s', (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );

  it('refuses things that are not IPs at all', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});
