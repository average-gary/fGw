// One-shot NIP-86 smoke for Wave 10 SPEC-049.
// Reads .test-key.json (gitignored) for an allowlisted nsec, builds a NIP-98
// auth event, and POSTs `{method:'listallowedpubkeys',params:[]}` to
// https://chat.virginiafreedom.tech.
//
// Usage: node scripts/nip86-smoke.mjs [relayWss]
//
// Exit 0 on a parsed array result; non-zero with a printed reason otherwise.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { finalizeEvent } from 'nostr-tools/pure';
import { decode } from 'nostr-tools/nip19';

const RELAY = process.argv[2] ?? 'wss://chat.virginiafreedom.tech';
const HTTP_URL = RELAY.replace(/^ws(s?):\/\//, 'http$1://');

const key = JSON.parse(readFileSync('.test-key.json', 'utf-8'));
const decoded = decode(key.nsec);
if (decoded.type !== 'nsec') {
  console.error('Invalid nsec in .test-key.json');
  process.exit(2);
}
const sk = decoded.data;

const body = JSON.stringify({ method: 'listallowedpubkeys', params: [] });
const payloadHash = createHash('sha256')
  .update(new TextEncoder().encode(body))
  .digest('hex');

const authTemplate = {
  kind: 27235,
  created_at: Math.floor(Date.now() / 1000),
  content: '',
  tags: [
    ['u', HTTP_URL],
    ['method', 'POST'],
    ['payload', payloadHash],
  ],
};
const auth = finalizeEvent(authTemplate, sk);
const token = Buffer.from(JSON.stringify(auth)).toString('base64');

console.log(`POST ${HTTP_URL}`);
console.log(`Body: ${body}`);
console.log(`Authorization: Nostr <${token.length} chars>`);
console.log(`Signing pubkey: ${auth.pubkey}`);
console.log('');

const res = await fetch(HTTP_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/nostr+json+rpc',
    Authorization: `Nostr ${token}`,
  },
  body,
});

console.log(`HTTP ${res.status} ${res.statusText}`);
const text = await res.text();
if (res.status === 401) {
  console.error(
    `Unauthorized — npub ${key.npub} is not in Pyramid's admin allowlist. Ask Gary to allowlist before retrying.`,
  );
  console.error(`Response body: ${text}`);
  process.exit(3);
}
if (!res.ok) {
  console.error(`Non-2xx response. Body: ${text}`);
  process.exit(4);
}

let json;
try {
  json = JSON.parse(text);
} catch (err) {
  console.error(`Response not JSON: ${err.message}`);
  console.error(`Body: ${text}`);
  process.exit(5);
}

if (json.error) {
  console.error(`NIP-86 error field: ${json.error}`);
  process.exit(6);
}

if (!Array.isArray(json.result)) {
  console.error(`NIP-86 result is not an array: ${JSON.stringify(json.result)}`);
  process.exit(7);
}

console.log(`OK — listallowedpubkeys returned ${json.result.length} entries.`);
console.log(
  `First 3: ${JSON.stringify(json.result.slice(0, 3), null, 2)}`,
);
