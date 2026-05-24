/**
 * Phase 4 tests — CrashReportPrompt boot modal.
 *
 * The Phase 3 sender is mocked at the `@/lib/crashReports` boundary so
 * these tests don't touch DM, NDK, or the auth store. `clearReport` is
 * also mocked because it writes localStorage; the Discard test asserts
 * the call directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  class MemoryStorage {
    private m = new Map<string, string>();
    get length(): number {
      return this.m.size;
    }
    clear(): void {
      this.m.clear();
    }
    getItem(k: string): string | null {
      return this.m.has(k) ? (this.m.get(k) as string) : null;
    }
    key(i: number): string | null {
      return Array.from(this.m.keys())[i] ?? null;
    }
    removeItem(k: string): void {
      this.m.delete(k);
    }
    setItem(k: string, v: string): void {
      this.m.set(k, String(v));
    }
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

vi.mock('@/lib/crashReports', () => ({
  sendCrashReport: vi.fn(async () => ({ ok: true })),
  clearReport: vi.fn(),
}));

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/ui/Toast';
import {
  CRASH_REPORT_VERSION,
  MAINTAINER_NPUB,
  type CrashReport,
} from '@/domain/crashReports';
import { clearReport, sendCrashReport } from '@/lib/crashReports';
import { CrashReportPrompt } from './CrashReportPrompt';

const mockedSendCrashReport = sendCrashReport as unknown as ReturnType<
  typeof vi.fn
>;
const mockedClearReport = clearReport as unknown as ReturnType<typeof vi.fn>;

function makeReport(ts: number, message = 'boom'): CrashReport {
  return {
    version: CRASH_REPORT_VERSION,
    ts,
    app_version: 'test-app',
    commit_sha: 'deadbeef',
    platform: 'happy-dom',
    error_name: 'Error',
    error_message: message,
    stack: 'at testFn (./src/test.ts:1:1)',
  };
}

function renderPrompt(props: {
  reports: CrashReport[];
  onSent?: (ts: number) => void;
  onDiscarded?: (ts: number) => void;
  onAllProcessed?: () => void;
}) {
  return render(
    <ToastProvider>
      <CrashReportPrompt
        reports={props.reports}
        maintainerNpub={MAINTAINER_NPUB}
        onSent={props.onSent}
        onDiscarded={props.onDiscarded}
        onAllProcessed={props.onAllProcessed}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  mockedSendCrashReport.mockReset();
  mockedSendCrashReport.mockImplementation(async () => ({ ok: true }));
  mockedClearReport.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('CrashReportPrompt', () => {
  it('renders the oldest report payload as JSON', () => {
    const report = makeReport(1, 'first-boom');
    renderPrompt({ reports: [report] });

    const pre = screen.getByLabelText('Crash report payload');
    expect(pre.textContent).toBe(JSON.stringify(report, null, 2));
    expect(pre.textContent).toContain('first-boom');
  });

  it('renders the maintainer npub truncated (first 9 + last 4 chars)', () => {
    renderPrompt({ reports: [makeReport(1)] });
    const truncated = `${MAINTAINER_NPUB.slice(0, 9)}…${MAINTAINER_NPUB.slice(-4)}`;
    expect(screen.getByText(truncated)).toBeTruthy();
    // Full npub should not be rendered anywhere visible.
    expect(screen.queryByText(MAINTAINER_NPUB)).toBeNull();
  });

  it('Send button calls sendCrashReport(reports[0]) and onSent on success', async () => {
    const user = userEvent.setup();
    const report = makeReport(101, 'send-me');
    const onSent = vi.fn();
    renderPrompt({ reports: [report], onSent });

    await user.click(screen.getByRole('button', { name: /^Send$/ }));

    await waitFor(() => {
      expect(mockedSendCrashReport).toHaveBeenCalledWith(report);
    });
    expect(onSent).toHaveBeenCalledWith(101);
  });

  it('Discard button calls clearReport and onDiscarded; does not call sendCrashReport', async () => {
    const user = userEvent.setup();
    const report = makeReport(202, 'discard-me');
    const onDiscarded = vi.fn();
    renderPrompt({ reports: [report], onDiscarded });

    await user.click(screen.getByRole('button', { name: /Discard/ }));

    expect(mockedClearReport).toHaveBeenCalledWith(202);
    expect(onDiscarded).toHaveBeenCalledWith(202);
    expect(mockedSendCrashReport).not.toHaveBeenCalled();
  });

  it('does not render Send all when only one report is queued', () => {
    renderPrompt({ reports: [makeReport(1)] });
    expect(screen.queryByRole('button', { name: /Send all/ })).toBeNull();
  });

  it('Send all (N) iterates through every queued report', async () => {
    const user = userEvent.setup();
    const reports = [makeReport(1, 'a'), makeReport(2, 'b'), makeReport(3, 'c')];
    const onSent = vi.fn();
    const onAllProcessed = vi.fn();
    renderPrompt({ reports, onSent, onAllProcessed });

    await user.click(screen.getByRole('button', { name: /Send all \(3\)/ }));

    await waitFor(() => {
      expect(mockedSendCrashReport).toHaveBeenCalledTimes(3);
    });
    expect(mockedSendCrashReport).toHaveBeenNthCalledWith(1, reports[0]);
    expect(mockedSendCrashReport).toHaveBeenNthCalledWith(2, reports[1]);
    expect(mockedSendCrashReport).toHaveBeenNthCalledWith(3, reports[2]);
    expect(onSent).toHaveBeenCalledTimes(3);
    expect(onAllProcessed).toHaveBeenCalledTimes(1);
  });

  it('on no-signer failure surfaces a toast and does not call onSent; report stays', async () => {
    const user = userEvent.setup();
    mockedSendCrashReport.mockImplementation(async () => ({
      ok: false,
      reason: 'no-signer',
    }));
    const onSent = vi.fn();
    renderPrompt({ reports: [makeReport(303, 'nope')], onSent });

    await user.click(screen.getByRole('button', { name: /^Send$/ }));

    await waitFor(() => {
      expect(mockedSendCrashReport).toHaveBeenCalledTimes(1);
    });
    expect(onSent).not.toHaveBeenCalled();
    // Toast surfaced — the warning copy is unique enough to assert on.
    await waitFor(() => {
      expect(screen.getByText(/Sign in first/)).toBeTruthy();
    });
  });
});
