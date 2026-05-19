/**
 * SPEC-008 — NIP-46 (bunker) authentication.
 *
 * Connects to a remote signer via a `bunker://` URI. Spawns a dedicated NDK
 * instance pointed at the relay(s) listed in the URI; this is intentionally
 * separate from the app-wide NDK so the signer handshake doesn't interfere
 * with normal subscriptions.
 *
 * NDK 2.10.x API (verified against
 * node_modules/@nostr-dev-kit/ndk/dist/index.d.ts L6194):
 *   constructor(
 *     ndk: NDK,
 *     userOrConnectionToken?: string | false,
 *     localSigner?: NDKPrivateKeySigner | string,
 *     relayUrls?: string[],
 *     nostrConnectOptions?: NostrConnectOptions,
 *   )
 *
 * Passing the bunker URI as the second arg triggers `bunkerFlowInit`, which
 * itself parses `relay` and `secret` query params from the URI.
 */
import NDK, {
  NDKNip46Signer,
  NDKPrivateKeySigner,
  type NDKSigner,
} from '@nostr-dev-kit/ndk';

export type Nip46ErrorKind =
  | 'invalid-uri'
  | 'no-relay'
  | 'handshake-timeout'
  | 'rejected'
  | 'qr-not-supported'
  | 'unknown';

export class Nip46Error extends Error {
  public readonly kind: Nip46ErrorKind;
  constructor(kind: Nip46ErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'Nip46Error';
    this.kind = kind;
  }
}

const HANDSHAKE_TIMEOUT_MS = 60_000;
const LOCAL_NSEC_KEY = 'nip46-local-nsec';

function getOrCreateLocalSigner(): NDKPrivateKeySigner {
  try {
    const stored =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(LOCAL_NSEC_KEY)
        : null;
    if (stored) return new NDKPrivateKeySigner(stored);
  } catch {
    // localStorage unavailable (SSR, privacy mode) — fall through.
  }
  const fresh = NDKPrivateKeySigner.generate();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_NSEC_KEY, fresh.nsec);
    }
  } catch {
    // best-effort persistence
  }
  return fresh;
}

function parseBunkerUri(uri: string): { relays: string[] } {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Nip46Error('invalid-uri', 'Could not parse URI');
  }
  if (parsed.protocol !== 'bunker:') {
    throw new Nip46Error('invalid-uri', 'Scheme must be bunker://');
  }
  const relays = parsed.searchParams.getAll('relay').filter(Boolean);
  if (relays.length === 0) {
    throw new Nip46Error(
      'no-relay',
      'bunker:// URI must include at least one relay query param',
    );
  }
  return { relays };
}

export async function connectBunker(uri: string): Promise<NDKSigner> {
  const { relays } = parseBunkerUri(uri);
  const localSigner = getOrCreateLocalSigner();
  const ndk = new NDK({ explicitRelayUrls: relays });

  try {
    await ndk.connect();
  } catch (err) {
    throw new Nip46Error(
      'unknown',
      `Failed to connect to bunker relays: ${(err as Error).message}`,
    );
  }

  const signer = new NDKNip46Signer(ndk, uri, localSigner);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Nip46Error('handshake-timeout')),
      HANDSHAKE_TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([signer.blockUntilReady(), timeout]);
  } catch (err) {
    if (err instanceof Nip46Error) throw err;
    const msg = (err as Error).message?.toLowerCase() ?? '';
    if (msg.includes('reject') || msg.includes('denied')) {
      throw new Nip46Error('rejected', (err as Error).message);
    }
    throw new Nip46Error('unknown', (err as Error).message);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  return signer;
}

/**
 * Web-only QR scan path. Native app uses a Tauri camera plugin in SPEC-024.
 *
 * Minimal happy path: open the user's camera via getUserMedia, scan with
 * `BarcodeDetector`, capture the first valid `bunker://` URI, delegate to
 * connectBunker.
 *
 * TODO: refine SPEC-024 mobile camera plugin — replace getUserMedia path with
 * the Tauri plugin and fall back to BarcodeDetector when running on web.
 */
export async function connectViaQR(): Promise<NDKSigner> {
  const BD = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector as
    | (new (opts: { formats: string[] }) => {
        detect: (
          source: CanvasImageSource,
        ) => Promise<Array<{ rawValue: string }>>;
      })
    | undefined;
  if (typeof BD !== 'function') {
    throw new Nip46Error('qr-not-supported');
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    throw new Nip46Error('qr-not-supported', 'No camera available');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  const video = document.createElement('video');
  video.srcObject = stream;
  await video.play();
  const detector = new BD({ formats: ['qr_code'] });
  try {
    for (let i = 0; i < 600; i++) {
      const codes = await detector.detect(video);
      const hit = codes.find((c) => c.rawValue?.startsWith('bunker://'));
      if (hit) return await connectBunker(hit.rawValue);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Nip46Error('handshake-timeout', 'No bunker QR found');
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
