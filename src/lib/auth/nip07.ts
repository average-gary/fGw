// SPEC-007: NIP-07 detection + login.
// NDK 2.18.1 exposes NDKNip07Signer with blockUntilReady(): Promise<NDKUser>.
import { NDKNip07Signer, type NDKSigner } from '@nostr-dev-kit/ndk';

export type Nip07ErrorKind =
  | { kind: 'no-extension' }
  | { kind: 'permission-denied' }
  | { kind: 'unknown'; cause: unknown };

export class Nip07Error extends Error {
  public readonly kind: Nip07ErrorKind['kind'];
  public override readonly cause?: unknown;

  constructor(detail: Nip07ErrorKind) {
    super(
      detail.kind === 'no-extension'
        ? 'No NIP-07 browser extension detected (window.nostr is undefined).'
        : detail.kind === 'permission-denied'
          ? 'NIP-07 extension denied permission.'
          : 'Unknown NIP-07 error.',
    );
    this.name = 'Nip07Error';
    this.kind = detail.kind;
    if (detail.kind === 'unknown') this.cause = detail.cause;
  }
}

export function detectNip07(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { nostr?: unknown }).nostr === 'object' &&
    (window as unknown as { nostr?: unknown }).nostr !== null
  );
}

function isPermissionDenied(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message.toLowerCase()
      : typeof err === 'string'
        ? err.toLowerCase()
        : '';
  return (
    msg.includes('denied') ||
    msg.includes('rejected') ||
    msg.includes('refused') ||
    msg.includes('not allowed') ||
    msg.includes('permission')
  );
}

export async function loginWithNip07(): Promise<NDKSigner> {
  if (!detectNip07()) throw new Nip07Error({ kind: 'no-extension' });
  const signer = new NDKNip07Signer();
  try {
    await signer.blockUntilReady();
    return signer;
  } catch (err) {
    if (isPermissionDenied(err))
      throw new Nip07Error({ kind: 'permission-denied' });
    throw new Nip07Error({ kind: 'unknown', cause: err });
  }
}
