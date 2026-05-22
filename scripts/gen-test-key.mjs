// One-shot test-key generator for Wave 10 SPEC-049 NIP-86 smoke.
// Writes .test-key.json (gitignored) with both nsec and npub.
//
// Usage: node scripts/gen-test-key.mjs
//
// The generated npub must be allowlisted on Pyramid root
// (chat.virginiafreedom.tech) before SPEC-049 manual smoke runs.
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nsecEncode, npubEncode } from 'nostr-tools/nip19';
import { writeFileSync } from 'node:fs';

const sk = generateSecretKey();
const pkHex = getPublicKey(sk);
const skHex = Array.from(sk)
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');
const nsec = nsecEncode(sk);
const npub = npubEncode(pkHex);

const out = {
  purpose:
    'Test signer for Wave 10 SPEC-049 NIP-86 smoke against chat.virginiafreedom.tech',
  generated: new Date().toISOString(),
  npub,
  nsec,
  pubkey_hex: pkHex,
  secret_hex: skHex,
  note:
    'Allowlist the npub on Pyramid root before Wave 10 manual smoke. ' +
    '.test-key.json is .gitignored — never commit.',
};

writeFileSync('.test-key.json', JSON.stringify(out, null, 2) + '\n');
console.log('npub:       ' + npub);
console.log('pubkey hex: ' + pkHex);
console.log('saved to:   .test-key.json (nsec inside; do not commit)');
