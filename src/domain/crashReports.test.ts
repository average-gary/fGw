import { describe, expect, it } from 'vitest';

import {
  CRASH_REPORT_QUEUE_CAP,
  CRASH_REPORT_VERSION,
  MAINTAINER_NPUB,
  buildReport,
  redactStack,
} from './crashReports';

describe('crashReports — module constants', () => {
  it('exposes a fixed schema version of 1', () => {
    expect(CRASH_REPORT_VERSION).toBe(1);
  });

  it('caps the on-device queue at 20', () => {
    expect(CRASH_REPORT_QUEUE_CAP).toBe(20);
  });

  it('exposes a syntactically-valid bech32 npub for MAINTAINER_NPUB', () => {
    // We don't import nostr-tools here (domain layer stays pure), but a
    // shape check catches obvious typos. Phase 5 swaps in the real value.
    expect(MAINTAINER_NPUB).toMatch(/^npub1[02-9ac-hj-np-z]{58}$/);
  });
});

describe('crashReports — redactStack', () => {
  it('strips npub bech32 entities', () => {
    const stack = 'at sendDm (npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme)';
    const out = redactStack(stack);
    expect(out).not.toMatch(/npub1/);
    expect(out).toContain('<redacted>');
    expect(out).toContain('sendDm');
  });

  it('strips nsec bech32 entities', () => {
    const stack = 'at signEvent (nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3xq8wt)';
    const out = redactStack(stack);
    expect(out).not.toMatch(/nsec1/);
    expect(out).toContain('<redacted>');
  });

  it('strips note bech32 entities', () => {
    const stack = 'at fetchEvent (note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqcrcdsj)';
    const out = redactStack(stack);
    expect(out).not.toMatch(/note1/);
    expect(out).toContain('<redacted>');
  });

  it('strips naddr (TLV) bech32 entities', () => {
    const stack = 'at resolveAddr (naddr1qqyrqct5wvhxxmmd9uq3uamnwvaz7tmwdaehgu3wd33xgetkda3kxue59ukk2tcpzpmhxue69uhkummnw3ezuamfdejszqsrhwden5te0wfjkccte9ehx7um5wghxyctwvshszqsrhwden5te0wfjkccte9ehx7um5wghxyctwvshsq3wamnwvaz7tmjv4kxz7fwdehhxarj9e3xzmnyfah4j2hk)';
    const out = redactStack(stack);
    expect(out).not.toMatch(/naddr1/);
    expect(out).toContain('<redacted>');
  });

  it('strips nevent (TLV) bech32 entities', () => {
    const stack = 'at decodeEvent (nevent1qqs8u3xpd2k0evw9zvg2vrkqts4f0qkfhq5e9aqrn8gphhk7m4d3jqcprdmhxue69uhhqun9d3shjtnwdaehgu3wvfnsj7nazn)';
    const out = redactStack(stack);
    expect(out).not.toMatch(/nevent1/);
    expect(out).toContain('<redacted>');
  });

  it('strips nprofile (TLV) bech32 entities', () => {
    const stack = 'at decodeProfile (nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpz3mhxue69uhhyetvv9ujuerpd46hxtnfduhsygqglgu0)';
    const out = redactStack(stack);
    expect(out).not.toMatch(/nprofile1/);
    expect(out).toContain('<redacted>');
  });

  it('strips raw 64-char hex pubkeys / event IDs', () => {
    const hex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const stack = `at lookup (${hex})`;
    const out = redactStack(stack);
    expect(out).not.toContain(hex);
    expect(out).toContain('<redacted>');
    expect(out).toContain('lookup');
  });

  it('strips macOS absolute paths but preserves :line:col suffix', () => {
    const stack = 'at Pile.render (/Users/gary/repos/fGw/src/components/Pile.tsx:42:13)';
    const out = redactStack(stack);
    expect(out).not.toContain('/Users/gary');
    expect(out).toContain('<redacted>');
    expect(out).toContain(':42:13');
    expect(out).toContain('Pile.render');
  });

  it('strips Linux absolute paths but preserves :line:col suffix', () => {
    const stack = 'at Listings.render (/home/alice/projects/fGw/src/lib/listings.ts:142:7)';
    const out = redactStack(stack);
    expect(out).not.toContain('/home/alice');
    expect(out).toContain('<redacted>');
    expect(out).toContain(':142:7');
    expect(out).toContain('Listings.render');
  });

  it('strips Windows absolute paths but preserves :line:col suffix', () => {
    const stack = 'at App.render (C:\\Users\\bob\\fGw\\src\\App.tsx:10:1)';
    const out = redactStack(stack);
    expect(out).not.toMatch(/C:\\Users\\bob/);
    expect(out).toContain('<redacted>');
    expect(out).toContain(':10:1');
    expect(out).toContain('App.render');
  });

  it('strips URL query strings', () => {
    const stack = 'at fetch (https://example.com/api?token=secret&user=alice:42:1)';
    const out = redactStack(stack);
    expect(out).not.toContain('?token');
    expect(out).not.toContain('secret');
    expect(out).not.toContain('alice');
    expect(out).toContain('https://example.com/api');
  });

  it('preserves function names, short hex, and bare line numbers', () => {
    // 7-char short SHA (commit hash style) should survive, as should
    // bare numbers and component / function identifiers.
    const stack = [
      'Error: boom',
      '    at MyComponent.render (Pile.tsx:42:13)',
      '    at commit cd90988',
      '    at processQueue (line 99)',
    ].join('\n');
    const out = redactStack(stack);
    expect(out).toContain('MyComponent.render');
    expect(out).toContain('Pile.tsx:42:13');
    expect(out).toContain('cd90988');
    expect(out).toContain('processQueue');
    expect(out).toContain('line 99');
    expect(out).not.toContain('<redacted>');
  });
});

describe('crashReports — buildReport', () => {
  it('extracts name + message + redacted stack from an Error', () => {
    const before = Date.now();
    const err = new Error('boom');
    // Inject a stack containing PII to verify redaction wires through.
    err.stack =
      'Error: boom\n    at run (/Users/gary/repos/fGw/src/lib/x.ts:1:1)';

    const r = buildReport(err);
    const after = Date.now();

    expect(r.version).toBe(CRASH_REPORT_VERSION);
    expect(r.error_name).toBe('Error');
    expect(r.error_message).toBe('boom');
    expect(r.stack).not.toContain('/Users/gary');
    expect(r.stack).toContain('<redacted>');
    expect(r.stack).toContain(':1:1');
    expect(typeof r.ts).toBe('number');
    expect(r.ts).toBeGreaterThanOrEqual(before);
    expect(r.ts).toBeLessThanOrEqual(after);
    expect(typeof r.app_version).toBe('string');
    expect(typeof r.commit_sha).toBe('string');
    expect(typeof r.platform).toBe('string');
  });

  it("wraps a string throw with error_name='Unknown' and empty stack", () => {
    const r = buildReport('string thrown');
    expect(r.error_name).toBe('Unknown');
    expect(r.error_message).toBe('string thrown');
    expect(r.stack).toBe('');
    expect(r.version).toBe(CRASH_REPORT_VERSION);
  });

  it("treats null as error_message='unknown' without crashing", () => {
    const r = buildReport(null);
    expect(r.error_name).toBe('Unknown');
    expect(r.error_message).toBe('unknown');
    expect(r.stack).toBe('');
  });

  it('coerces non-Error objects via String(...) without crashing', () => {
    const r = buildReport({ weird: 'object' });
    expect(r.error_name).toBe('Unknown');
    // Default Object#toString → '[object Object]'.
    expect(r.error_message).toBe('[object Object]');
    expect(r.stack).toBe('');
  });

  it('supplies stable string fallbacks for env-derived fields', () => {
    // We don't assert specific values here (depends on whether vite has
    // injected them into the test runner); only that they're non-empty
    // strings — `'unknown'` is the documented fallback.
    const r = buildReport(new Error('x'));
    expect(r.app_version.length).toBeGreaterThan(0);
    expect(r.commit_sha.length).toBeGreaterThan(0);
    expect(r.platform.length).toBeGreaterThan(0);
  });
});
