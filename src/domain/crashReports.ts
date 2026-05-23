// Crash-report domain layer: schema, build-time constants, and the redactor.
//
// Pure functions only. No I/O, no React, no Nostr-tools imports — the I/O
// layer (capture, persistence, sender) lives in `src/lib/crashReports.ts`
// (Phase 2) and the sender wiring lives next to `sendDm` (Phase 3).
//
// Design grounding: see
// `.wiki/output/projects/crash-reports/plan-crash-reports-2026-05-22.md`
// — Decision 4 (allowlist redaction) and Decision 5 (build-time
// maintainer constant).
//
// The maintainer npub is a syntactically-valid bech32 placeholder (encodes
// the all-zero 32-byte pubkey) so that downstream code that calls
// `nip19.decode(MAINTAINER_NPUB)` does not crash before Phase 5 swaps in
// the real value. We keep the constant as a `string` (rather than
// `string | null`) to keep the downstream type contract simple.

/**
 * Maintainer's npub. Build-time constant; rotates via PR + new build.
 *
 * Currently a placeholder that decodes to the all-zero pubkey. Round-trips
 * cleanly through `nostr-tools/nip19.decode` so consumers can call
 * `decode(MAINTAINER_NPUB)` without surprise — the result is a valid
 * `{ type: 'npub', data: '0'.repeat(64) }`. Sending an encrypted DM to
 * this key would simply be discarded by relays / lost in the void; it
 * cannot leak to a third party.
 */
// TODO(crash-reports Phase 5): replace with Ethan Tuttle's real npub.
export const MAINTAINER_NPUB: string =
  'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme';

/**
 * Maximum number of crash reports retained in the on-device queue. FIFO
 * eviction at overflow. See plan Decision 3 for sizing rationale.
 */
export const CRASH_REPORT_QUEUE_CAP = 20;

/**
 * Schema version. Increment on a breaking change to `CrashReport`.
 */
export const CRASH_REPORT_VERSION = 1 as const;

/**
 * Allowlisted shape of a crash payload — the entire surface that crosses
 * the wire to the maintainer. No free-form caller-supplied fields.
 */
export interface CrashReport {
  version: typeof CRASH_REPORT_VERSION;
  /** Wall-clock timestamp at capture (`Date.now()`). */
  ts: number;
  /** App version, injected by Vite from `package.json` at build time. */
  app_version: string;
  /** Short git SHA, injected by Vite at build time; `'unknown'` fallback. */
  commit_sha: string;
  /** `navigator.userAgent` snapshot; `'unknown'` fallback. */
  platform: string;
  /** `Error#name`, or `'Unknown'` when a non-Error was thrown. */
  error_name: string;
  /** `Error#message`, or `String(thrown)` for non-Error throws. */
  error_message: string;
  /** Stack trace AFTER `redactStack` has run. May be empty. */
  stack: string;
}

// Bech32 alphabet (data part) excludes `b`, `i`, `o`, `1`.
const BECH32_DATA_CHAR = '[02-9ac-hj-np-z]';

// Fixed-length bech32 entities: type byte prefix + 52-byte data + 6-byte
// checksum, all encoded as 5-bit groups → 64 chars after the `1` separator
// minus the 6-char checksum prefix = 58 data chars in the typical encoding
// of a 32-byte pubkey/event-id.
const FIXED_BECH32_PREFIXES = ['npub', 'nsec', 'note'] as const;
// Variable-length (TLV-encoded) bech32 entities. No fixed data length.
const TLV_BECH32_PREFIXES = ['naddr', 'nevent', 'nprofile'] as const;

const FIXED_BECH32_RES = FIXED_BECH32_PREFIXES.map(
  (p) => new RegExp(`${p}1${BECH32_DATA_CHAR}{58}`, 'gi'),
);
const TLV_BECH32_RES = TLV_BECH32_PREFIXES.map(
  (p) => new RegExp(`${p}1${BECH32_DATA_CHAR}+`, 'gi'),
);

// Raw 64-char hex (pubkeys, event IDs).
const HEX64_RE = /\b[0-9a-f]{64}\b/gi;

// Absolute paths. Keep the regex tight enough to not eat trailing
// `:line:col` suffixes that follow a stack-frame path. We match the root
// segment (`/Users/<name>`, `/home/<name>`, `C:\Users\<name>`) plus any
// additional path segments where each segment forbids whitespace, the
// segment-separator, the closing paren, and the colon — the colon
// exclusion is what preserves `:42:13` after the path is replaced.
const MACOS_PATH_RE = /\/Users\/[^/\s:)]+(?:\/[^/\s:)]+)*/g;
const LINUX_PATH_RE = /\/home\/[^/\s:)]+(?:\/[^/\s:)]+)*/g;
const WINDOWS_PATH_RE = /[A-Z]:\\Users\\[^\\\s:)]+(?:\\[^\\\s:)]+)*/gi;

// Query strings (`?...` to next whitespace or `)`). Replaced with empty
// string rather than `<redacted>` because they appear inside URLs in stack
// frames, e.g. `at fetch (https://example.com/api?token=secret:42:1)`,
// and the URL is more readable with the query simply gone.
const QUERY_RE = /\?[^\s)]*/g;

const REDACT_TOKEN = '<redacted>';

/**
 * Strip PII-shaped substrings from a stack trace. Best-effort: covers the
 * predictable classes (bech32 entities, raw 64-hex, absolute filesystem
 * paths) plus URL query strings. Function names, line numbers, and
 * relative paths are preserved — they're useful for triage and the app
 * source is open on GitHub.
 *
 * The `:line:col` tail of a stack frame survives path redaction because
 * the path regexes deliberately exclude `:`.
 */
export function redactStack(stack: string): string {
  let out = stack;
  for (const re of FIXED_BECH32_RES) {
    out = out.replace(re, REDACT_TOKEN);
  }
  for (const re of TLV_BECH32_RES) {
    out = out.replace(re, REDACT_TOKEN);
  }
  out = out.replace(HEX64_RE, REDACT_TOKEN);
  out = out.replace(MACOS_PATH_RE, REDACT_TOKEN);
  out = out.replace(LINUX_PATH_RE, REDACT_TOKEN);
  out = out.replace(WINDOWS_PATH_RE, REDACT_TOKEN);
  out = out.replace(QUERY_RE, '');
  return out;
}

function readEnv(key: 'VITE_APP_VERSION' | 'VITE_COMMIT_SHA'): string {
  // `import.meta.env` is always present under Vite; the guard handles
  // exotic SSR-ish test runners that might stub it out.
  const env =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env
      : undefined;
  const v = env?.[key];
  return typeof v === 'string' && v.length > 0 ? v : 'unknown';
}

function readUserAgent(): string {
  if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') {
    return navigator.userAgent;
  }
  return 'unknown';
}

/**
 * Build a redacted, allowlisted `CrashReport` from any thrown value.
 *
 * - For `Error` instances: pulls `name`, `message`, and `stack` (with the
 *   stack passed through `redactStack`).
 * - For non-Error throws: `error_name = 'Unknown'`,
 *   `error_message = String(err ?? 'unknown')`, `stack = ''`.
 *
 * Pure: reads `import.meta.env`, `navigator.userAgent`, and `Date.now()`,
 * but performs no I/O.
 */
export function buildReport(err: unknown): CrashReport {
  let error_name: string;
  let error_message: string;
  let stack: string;

  if (err instanceof Error) {
    error_name = err.name;
    error_message = err.message;
    stack = redactStack(err.stack ?? '');
  } else {
    error_name = 'Unknown';
    error_message = String(err ?? 'unknown');
    stack = '';
  }

  return {
    version: CRASH_REPORT_VERSION,
    ts: Date.now(),
    app_version: readEnv('VITE_APP_VERSION'),
    commit_sha: readEnv('VITE_COMMIT_SHA'),
    platform: readUserAgent(),
    error_name,
    error_message,
    stack,
  };
}
