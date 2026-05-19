import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks so vi.mock factory can reference them.
const mocks = vi.hoisted(() => {
  return {
    blockUntilReady: vi.fn().mockResolvedValue({ pubkey: 'remote-pub' }),
    ndkConnect: vi.fn().mockResolvedValue(undefined),
    nip46Ctor: vi.fn(),
    pkSignerCtor: vi.fn(),
    pkSignerGenerate: vi.fn(),
  };
});

vi.mock('@nostr-dev-kit/ndk', () => {
  class NDK {
    public explicitRelayUrls: string[];
    constructor(opts: { explicitRelayUrls?: string[] } = {}) {
      this.explicitRelayUrls = opts.explicitRelayUrls ?? [];
    }
    connect = mocks.ndkConnect;
  }

  class NDKPrivateKeySigner {
    public nsec = 'nsec1mocklocalsigner';
    constructor(input?: string) {
      mocks.pkSignerCtor(input);
    }
    static generate() {
      mocks.pkSignerGenerate();
      return new NDKPrivateKeySigner();
    }
  }

  class NDKNip46Signer {
    public blockUntilReady = mocks.blockUntilReady;
    constructor(ndk: unknown, uri: string, local: unknown) {
      mocks.nip46Ctor(ndk, uri, local);
    }
  }

  return {
    default: NDK,
    NDKNip46Signer,
    NDKPrivateKeySigner,
  };
});

// happy-dom in this project doesn't ship a working localStorage; install a
// minimal shim so the module's persistence path is exercisable.
function installLocalStorageShim() {
  const store = new Map<string, string>();
  const shim = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    configurable: true,
    writable: true,
  });
  return shim;
}

// Import AFTER the mock is registered.
import { Nip46Error, connectBunker, connectViaQR } from './nip46';

const VALID_URI =
  'bunker://abcdef0123456789?relay=wss://relay.example.com&secret=hunter2';

describe('connectBunker', () => {
  beforeEach(() => {
    installLocalStorageShim();
    mocks.blockUntilReady.mockReset().mockResolvedValue({ pubkey: 'p' });
    mocks.ndkConnect.mockReset().mockResolvedValue(undefined);
    mocks.nip46Ctor.mockReset();
    mocks.pkSignerCtor.mockReset();
    mocks.pkSignerGenerate.mockReset();
  });

  it('rejects on a non-URI string with kind invalid-uri', async () => {
    await expect(connectBunker('not-a-uri')).rejects.toMatchObject({
      kind: 'invalid-uri',
    });
  });

  it('rejects on a bunker URI with no relay with kind no-relay', async () => {
    await expect(connectBunker('bunker://abc')).rejects.toMatchObject({
      kind: 'no-relay',
    });
  });

  it('rejects when scheme is not bunker://', async () => {
    await expect(
      connectBunker('https://example.com/?relay=wss://x'),
    ).rejects.toMatchObject({ kind: 'invalid-uri' });
  });

  it('returns the signer when blockUntilReady resolves', async () => {
    const signer = await connectBunker(VALID_URI);
    expect(signer).toBeDefined();
    expect(mocks.nip46Ctor).toHaveBeenCalledTimes(1);
    expect(mocks.blockUntilReady).toHaveBeenCalledTimes(1);
    expect(mocks.ndkConnect).toHaveBeenCalledTimes(1);
  });

  it('persists and reuses local nsec across calls', async () => {
    await connectBunker(VALID_URI);
    expect(mocks.pkSignerGenerate).toHaveBeenCalledTimes(1);
    await connectBunker(VALID_URI);
    // Second call should hydrate from localStorage rather than generating.
    expect(mocks.pkSignerGenerate).toHaveBeenCalledTimes(1);
    expect(mocks.pkSignerCtor).toHaveBeenLastCalledWith('nsec1mocklocalsigner');
  });

  it('maps blockUntilReady rejection containing "rejected" to kind=rejected', async () => {
    mocks.blockUntilReady.mockRejectedValue(
      new Error('user rejected the request'),
    );
    const err = await connectBunker(VALID_URI).catch((e) => e);
    expect(err).toBeInstanceOf(Nip46Error);
    expect((err as Nip46Error).kind).toBe('rejected');
  });
});

describe('connectViaQR', () => {
  let originalBD: unknown;
  beforeEach(() => {
    originalBD = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
    delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
  });
  afterEach(() => {
    if (originalBD === undefined) {
      delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
    } else {
      (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector =
        originalBD;
    }
  });

  it('rejects with qr-not-supported when BarcodeDetector is undefined', async () => {
    await expect(connectViaQR()).rejects.toMatchObject({
      kind: 'qr-not-supported',
    });
  });
});
