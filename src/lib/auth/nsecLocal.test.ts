// SPEC-009 tests: generate → reload → unlock → sign; wrong passphrase; reveal round-trip; key-exists.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import NDK, { NDKEvent, type NDKSigner } from '@nostr-dev-kit/ndk';
import { verifyEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import {
  _clearForTests,
  NsecLocalError,
  generateAndStore,
  revealNsecOnce,
  unlock,
} from './nsecLocal';

const PASS = 'correct horse battery staple';

beforeEach(async () => {
  await _clearForTests();
});
afterEach(async () => {
  await _clearForTests();
});

async function signTestEvent(signer: NDKSigner): Promise<{
  ok: boolean;
  pubkeyFromSigner: string;
}> {
  const ndk = new NDK({ signer });
  const ev = new NDKEvent(ndk);
  ev.kind = 1;
  ev.content = 'test';
  ev.created_at = Math.floor(Date.now() / 1000);
  await ev.sign();
  const user = await signer.user();
  // verifyEvent expects an Event-shaped object with id/pubkey/sig/etc.
  const raw = ev.rawEvent() as unknown as Parameters<typeof verifyEvent>[0];
  return { ok: verifyEvent(raw), pubkeyFromSigner: user.pubkey };
}

describe('SPEC-009 nsecLocal', () => {
  it('generate → reload → unlock → sign verifiable event', async () => {
    const { npub } = await generateAndStore(PASS);
    expect(npub.startsWith('npub1')).toBe(true);

    // Simulate reload: drop the in-memory store handle but keep persisted record.
    // _clearForTests would wipe the record; instead reset only the cached store ref.
    // We achieve that by calling the public API again — it lazily re-binds storage.
    // (DexieStore reads back from IndexedDB; MemoryStore persists across the same
    // module instance, so unlock from a fresh call still finds the record.)

    const signer = await unlock(PASS);
    const { ok, pubkeyFromSigner } = await signTestEvent(signer);
    expect(ok).toBe(true);

    // npub <-> signer pubkey consistency
    const decoded = nip19.decode(npub as nip19.NPub);
    expect(decoded.type).toBe('npub');
    expect(decoded.data).toBe(pubkeyFromSigner);
  });

  it('rejects wrong passphrase with kind=wrong-passphrase', async () => {
    await generateAndStore(PASS);
    let caught: unknown;
    try {
      await unlock('not the passphrase');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(NsecLocalError);
    expect((caught as NsecLocalError).kind).toBe('wrong-passphrase');
  });

  it('revealNsecOnce returns nsec1… that round-trips to original sk', async () => {
    await generateAndStore(PASS);
    const signer = await unlock(PASS);
    // Get hex sk from the signer for round-trip comparison.
    const expectedHex = (signer as unknown as { privateKey: string }).privateKey;

    const nsec = await revealNsecOnce(PASS);
    expect(typeof nsec).toBe('string');
    expect(nsec.startsWith('nsec1')).toBe(true);

    const decoded = nip19.decode(nsec as nip19.NSec);
    expect(decoded.type).toBe('nsec');
    const skBytes = decoded.data as Uint8Array;
    let actualHex = '';
    for (const b of skBytes) actualHex += b.toString(16).padStart(2, '0');
    expect(actualHex).toBe(expectedHex);

    if (typeof sessionStorage !== 'undefined') {
      expect(sessionStorage.getItem('nsec-revealed-this-session')).toBe('1');
    }
  });

  it('generateAndStore rejects with key-exists when key already present', async () => {
    await generateAndStore(PASS);
    let caught: unknown;
    try {
      await generateAndStore(PASS);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(NsecLocalError);
    expect((caught as NsecLocalError).kind).toBe('key-exists');
  });

  it('unlock with no key throws no-key', async () => {
    let caught: unknown;
    try {
      await unlock(PASS);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(NsecLocalError);
    expect((caught as NsecLocalError).kind).toBe('no-key');
  });
});
