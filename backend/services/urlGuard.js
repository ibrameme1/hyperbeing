import dns from 'dns/promises';
import net from 'net';

// SSRF guard for user-supplied URLs (see GAPS #2). The backend fetches
// arbitrary URLs on the user's behalf (brief context); without this, a user
// could point it at cloud metadata endpoints, localhost admin routes, or
// anything on the private network and read the response.

// True for loopback, link-local, private-range, CGN, and unspecified addresses.
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||                       // 0.0.0.0/8 (unspecified / "this network")
      a === 10 ||                      // 10.0.0.0/8
      a === 127 ||                     // 127.0.0.0/8 loopback
      (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGN
      (a === 169 && b === 254) ||      // 169.254.0.0/16 link-local (cloud metadata)
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168)         // 192.168.0.0/16
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // Normalize IPv4-mapped IPv6 (::ffff:1.2.3.4)
    const v4 = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) return isPrivateAddress(v4[1]);
    return (
      lower === '::' || lower === '::1' ||   // unspecified / loopback
      lower.startsWith('fe80:') ||           // link-local
      lower.startsWith('fc') || lower.startsWith('fd') // fc00::/7 unique-local
    );
  }
  return true; // not a recognizable IP — refuse
}

// Validates that a user-supplied URL is safe to fetch server-side:
// http(s) only, default ports only, and the hostname must not resolve to any
// private/loopback/link-local address. Throws Error with a user-safe message.
export async function assertPublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Valid URL required');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http(s) URLs are supported');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('URLs with non-standard ports are not supported');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('That address cannot be fetched');
    return url;
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Could not resolve that URL');
  }
  if (records.length === 0 || records.some(r => isPrivateAddress(r.address))) {
    throw new Error('That address cannot be fetched');
  }
  return url;
}
