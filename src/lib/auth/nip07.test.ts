import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectNip07, loginWithNip07, Nip07Error } from './nip07';

type NostrShim = {
  getPublicKey: () => Promise<string>;
  signEvent: (e: unknown) => Promise<unknown>;
};

function setNostr(shim: NostrShim | undefined) {
  const w = globalThis as unknown as { nostr?: NostrShim };
  if (shim === undefined) delete w.nostr;
  else w.nostr = shim;
}

afterEach(() => {
  setNostr(undefined);
  vi.restoreAllMocks();
});

describe('detectNip07', () => {
  it('returns true when window.nostr is set', () => {
    setNostr({
      getPublicKey: async () => 'a'.repeat(64),
      signEvent: async (e) => e,
    });
    expect(detectNip07()).toBe(true);
  });

  it('returns false when window.nostr is missing', () => {
    setNostr(undefined);
    expect(detectNip07()).toBe(false);
  });
});

describe('loginWithNip07', () => {
  it('throws Nip07Error{no-extension} when window.nostr is missing', async () => {
    setNostr(undefined);
    await expect(loginWithNip07()).rejects.toMatchObject({
      kind: 'no-extension',
    });
    await expect(loginWithNip07()).rejects.toBeInstanceOf(Nip07Error);
  });

  it('rejects with a typed Nip07Error when getPublicKey throws', async () => {
    setNostr({
      getPublicKey: async () => {
        throw new Error('User denied permission');
      },
      signEvent: async (e) => e,
    });
    const err = await loginWithNip07().catch((e) => e);
    expect(err).toBeInstanceOf(Nip07Error);
    expect(['permission-denied', 'unknown']).toContain(
      (err as Nip07Error).kind,
    );
  });

  it('classifies non-permission errors as unknown', async () => {
    setNostr({
      getPublicKey: async () => {
        throw new Error('boom: network unreachable');
      },
      signEvent: async (e) => e,
    });
    const err = (await loginWithNip07().catch((e) => e)) as Nip07Error;
    expect(err).toBeInstanceOf(Nip07Error);
    expect(err.kind).toBe('unknown');
  });
});
