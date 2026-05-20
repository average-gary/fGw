// SPEC-009 + SPEC-034: Auth — local nsec with encryption.
// Web: AES-GCM(secret) with PBKDF2-derived key, persisted in IndexedDB via Dexie.
// Native (Tauri): @tauri-apps/plugin-stronghold provides OS-keychain-backed
//   at-rest storage on top of the same AES-GCM ciphertext (defense in depth).
//
// Stronghold API used (see node_modules/@tauri-apps/plugin-stronghold/dist-js/index.d.ts):
//   Stronghold.load(path: string, password: string): Promise<Stronghold>            (line ~181)
//   stronghold.loadClient(name: ClientPath): Promise<Client>                        (line ~186)
//   stronghold.createClient(name: ClientPath): Promise<Client>                      (line ~187)
//   stronghold.save(): Promise<void>                                                (line ~192)
//   client.getStore(): Store                                                        (line ~126)
//   store.get(key: StoreKey): Promise<Uint8Array | null>                            (line ~132)
//   store.insert(key: StoreKey, value: number[], lifetime?: Duration): Promise<void>(line ~133)
// Path joining via `join` from '@tauri-apps/api/path' (line ~540) since
// `appDataDir()` does not guarantee a trailing separator across platforms.
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
// The Stronghold passphrase doubles as the user's app passphrase. The bytes we
// store inside Stronghold are still the AES-GCM ciphertext+iv+salt JSON, so
// Stronghold provides at-rest defense in depth, not the primary crypto.
const STRONGHOLD_FILE = 'compost.stronghold';
const STRONGHOLD_CLIENT = 'compost';
const STRONGHOLD_KEY = 'nsec';

interface SerializableKeyRecord {
  id: string;
  version: number;
  ciphertext: number[];
  iv: number[];
  salt: number[];
}

function recordToSerializable(rec: StoredKeyRecord): SerializableKeyRecord {
  return {
    id: rec.id,
    version: rec.version,
    ciphertext: Array.from(rec.ciphertext),
    iv: Array.from(rec.iv),
    salt: Array.from(rec.salt),
  };
}

function recordFromSerializable(s: SerializableKeyRecord): StoredKeyRecord {
  return {
    id: s.id,
    version: s.version,
    ciphertext: new Uint8Array(s.ciphertext),
    iv: new Uint8Array(s.iv),
    salt: new Uint8Array(s.salt),
  };
}

async function getStrongholdStore(passphrase: string) {
  // Dynamic imports keep the web bundle from eagerly evaluating Tauri-only
  // glue at module load. The web path never reaches this branch because
  // `isTauri()` returns false there.
  const { Stronghold } = await import('@tauri-apps/plugin-stronghold');
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const dir = await appDataDir();
  const snapshotPath = await join(dir, STRONGHOLD_FILE);
  const stronghold = await Stronghold.load(snapshotPath, passphrase);
  let client;
  try {
    client = await stronghold.loadClient(STRONGHOLD_CLIENT);
  } catch {
    client = await stronghold.createClient(STRONGHOLD_CLIENT);
  }
  return { stronghold, store: client.getStore() };
}

async function saveToStronghold(
  passphrase: string,
  rec: StoredKeyRecord,
): Promise<void> {
  const { stronghold, store } = await getStrongholdStore(passphrase);
  const payload = new TextEncoder().encode(
    JSON.stringify(recordToSerializable(rec)),
  );
  await store.insert(STRONGHOLD_KEY, Array.from(payload));
  await stronghold.save();
}

async function loadFromStronghold(
  passphrase: string,
): Promise<StoredKeyRecord | null> {
  const { store } = await getStrongholdStore(passphrase);
  const bytes = await store.get(STRONGHOLD_KEY);
  if (!bytes || bytes.length === 0) return null;
  const json = new TextDecoder().decode(bytes);
  return recordFromSerializable(JSON.parse(json) as SerializableKeyRecord);
}

// Whether the IndexedDB API is reachable in this environment. Tauri webviews
// expose it, so we use it as a fallback when Stronghold itself errors.
function indexedDBAvailable(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { indexedDB?: unknown }).indexedDB !== 'undefined'
  );
}

// --- Public API ------------------------------------------------------------
export async function generateAndStore(
  passphrase: string,
): Promise<{ npub: string }> {
  try {
    const existing = await readExistingRecord(passphrase);
    if (existing) throw new NsecLocalError('key-exists');
    const sk = generateSecretKey();
    const { ciphertext, iv, salt } = await encryptSk(sk, passphrase);
    const rec: StoredKeyRecord = {
      id: RECORD_ID,
      version: RECORD_VERSION,
      ciphertext,
      iv,
      salt,
    };
    await writeRecord(passphrase, rec);
    const npub = nip19.npubEncode(getPublicKey(sk));
    return { npub };
  } catch (err) {
    if (err instanceof NsecLocalError) throw err;
    throw new NsecLocalError('storage-error', 'Failed to store key', err);
  }
}

export async function unlock(passphrase: string): Promise<NDKSigner> {
  const rec = await loadRecordOrThrow(passphrase);
  const sk = await decryptSk(rec, passphrase);
  return new NDKPrivateKeySigner(toHex(sk));
}

export async function revealNsecOnce(passphrase: string): Promise<string> {
  const rec = await loadRecordOrThrow(passphrase);
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

// On native, prefer Stronghold; if it errors and IndexedDB is reachable, fall
// back so users aren't locked out by a transient plugin issue. On web we go
// straight to the Dexie/IndexedDB store.
async function readExistingRecord(
  passphrase: string,
): Promise<StoredKeyRecord | undefined> {
  if (isTauri()) {
    try {
      const rec = await loadFromStronghold(passphrase);
      return rec ?? undefined;
    } catch (err) {
      if (!indexedDBAvailable()) throw err;
      // fall through to IndexedDB
    }
  }
  return store().get();
}

async function writeRecord(
  passphrase: string,
  rec: StoredKeyRecord,
): Promise<void> {
  if (isTauri()) {
    try {
      await saveToStronghold(passphrase, rec);
      return;
    } catch (err) {
      if (!indexedDBAvailable()) throw err;
      // fall through to IndexedDB
    }
  }
  await store().put(rec);
}

async function loadRecordOrThrow(
  passphrase: string,
): Promise<StoredKeyRecord> {
  let rec: StoredKeyRecord | undefined;
  try {
    rec = await readExistingRecord(passphrase);
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
