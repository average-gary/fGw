// SPEC-009: Auth — local nsec with encryption.
// Web: AES-GCM(secret) with PBKDF2-derived key, persisted in IndexedDB via Dexie.
// Native (Tauri): tauri-plugin-stronghold (stubbed; see SPEC-024 hardening).
import Dexie, { type Table } from 'dexie';
import { NDKPrivateKeySigner, type NDKSigner } from '@nostr-dev-kit/ndk';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { isTauri } from '@tauri-apps/api/core';

const PBKDF2_ITERS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const RECORD_VERSION = 1;
const RECORD_ID = 'primary';
const REVEAL_FLAG = 'nsec-revealed-this-session';

export type NsecLocalErrorKind =
  | 'no-key'
  | 'key-exists'
  | 'wrong-passphrase'
  | 'storage-error';

export class NsecLocalError extends Error {
  public override readonly name = 'NsecLocalError';
  public readonly kind: NsecLocalErrorKind;
  public override readonly cause?: unknown;
  constructor(kind: NsecLocalErrorKind, message?: string, cause?: unknown) {
    super(message ?? kind);
    this.kind = kind;
    if (cause !== undefined) this.cause = cause;
  }
}

interface StoredKeyRecord {
  id: string;
  version: number;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
}

interface KeyStore {
  get(): Promise<StoredKeyRecord | undefined>;
  put(rec: StoredKeyRecord): Promise<void>;
  clear(): Promise<void>;
}

// --- Web/Dexie store -------------------------------------------------------
class CompostAuthDB extends Dexie {
  keys!: Table<StoredKeyRecord, string>;
  constructor() {
    super('compost-auth');
    this.version(1).stores({ keys: 'id' });
  }
}

class DexieStore implements KeyStore {
  private db = new CompostAuthDB();
  async get() {
    return this.db.keys.get(RECORD_ID);
  }
  async put(rec: StoredKeyRecord) {
    await this.db.keys.put(rec);
  }
  async clear() {
    await this.db.keys.clear();
  }
}

// --- In-memory fallback (non-browser test envs without IndexedDB) ----------
class MemoryStore implements KeyStore {
  private rec: StoredKeyRecord | undefined;
  async get() {
    return this.rec;
  }
  async put(rec: StoredKeyRecord) {
    this.rec = rec;
  }
  async clear() {
    this.rec = undefined;
  }
}

let _store: KeyStore | null = null;
function store(): KeyStore {
  if (_store) return _store;
  const hasIDB =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { indexedDB?: unknown }).indexedDB !== 'undefined';
  _store = hasIDB ? new DexieStore() : new MemoryStore();
  return _store;
}

// --- Crypto helpers --------------------------------------------------------
// `as BufferSource` casts here paper over a TS 5.7+ lib.dom.d.ts quirk where
// Uint8Array<ArrayBufferLike> isn't assignable to Uint8Array<ArrayBuffer>.
async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptSk(
  sk: Uint8Array,
  passphrase: string,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array; salt: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    sk as BufferSource,
  );
  return { ciphertext: new Uint8Array(ct), iv, salt };
}

async function decryptSk(
  rec: StoredKeyRecord,
  passphrase: string,
): Promise<Uint8Array> {
  const key = await deriveAesKey(passphrase, rec.salt);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: rec.iv as BufferSource },
      key,
      rec.ciphertext as BufferSource,
    );
    return new Uint8Array(pt);
  } catch {
    throw new NsecLocalError('wrong-passphrase');
  }
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

// --- Native (Tauri / Stronghold) -------------------------------------------
// TODO: SPEC-024 hardening — wire @tauri-apps/plugin-stronghold:
//   const sh = await Stronghold.load(`${appDataDir}/compost.stronghold`, passphrase);
//   const client = await sh.loadClient('compost').catch(() => sh.createClient('compost'));
//   await client.getStore().insert('nsec', Array.from(sk));
// Web path is the must-have; native intentionally stubbed below.
function nativeUnavailable(): never {
  throw new NsecLocalError(
    'storage-error',
    'Native stronghold path not implemented (SPEC-024).',
  );
}

// --- Public API ------------------------------------------------------------
export async function generateAndStore(
  passphrase: string,
): Promise<{ npub: string }> {
  if (isTauri()) nativeUnavailable();
  try {
    const existing = await store().get();
    if (existing) throw new NsecLocalError('key-exists');
    const sk = generateSecretKey();
    const { ciphertext, iv, salt } = await encryptSk(sk, passphrase);
    await store().put({
      id: RECORD_ID,
      version: RECORD_VERSION,
      ciphertext,
      iv,
      salt,
    });
    const npub = nip19.npubEncode(getPublicKey(sk));
    return { npub };
  } catch (err) {
    if (err instanceof NsecLocalError) throw err;
    throw new NsecLocalError('storage-error', 'Failed to store key', err);
  }
}

export async function unlock(passphrase: string): Promise<NDKSigner> {
  if (isTauri()) nativeUnavailable();
  const rec = await loadRecordOrThrow();
  const sk = await decryptSk(rec, passphrase);
  return new NDKPrivateKeySigner(toHex(sk));
}

export async function revealNsecOnce(passphrase: string): Promise<string> {
  if (isTauri()) nativeUnavailable();
  const rec = await loadRecordOrThrow();
  const sk = await decryptSk(rec, passphrase);
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(REVEAL_FLAG, '1');
    }
  } catch {
    /* sessionStorage may be unavailable; ignore */
  }
  return nip19.nsecEncode(sk);
}

async function loadRecordOrThrow(): Promise<StoredKeyRecord> {
  let rec: StoredKeyRecord | undefined;
  try {
    rec = await store().get();
  } catch (err) {
    throw new NsecLocalError('storage-error', 'Failed to read key', err);
  }
  if (!rec) throw new NsecLocalError('no-key');
  return rec;
}

// --- Test-only helpers -----------------------------------------------------
export async function _clearForTests(): Promise<void> {
  try {
    if (_store) await _store.clear();
  } catch {
    /* ignore */
  }
  _store = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(REVEAL_FLAG);
    }
  } catch {
    /* ignore */
  }
}
