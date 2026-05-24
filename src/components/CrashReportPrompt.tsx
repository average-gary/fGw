/**
 * Crash-report boot prompt (Phase 4): the modal that surfaces queued
 * crash reports on next launch and asks the user to Send / Discard /
 * Send-all.
 *
 * Presentational component — the parent (App) owns the queue state and
 * re-reads `getQueuedReports()` after each acknowledged action.
 *
 * Design grounding: see plan Decision 2 (per-report opt-in, no global
 * "remember this") and Phase 4 task list in
 * `.wiki/output/projects/crash-reports/plan-crash-reports-2026-05-22.md`.
 */
import { useState, type ReactNode } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { clearReport, sendCrashReport } from '@/lib/crashReports';
import type { CrashReport } from '@/domain/crashReports';

export interface CrashReportPromptProps {
  /** Queued reports, oldest first. The prompt acts on `reports[0]`. */
  reports: CrashReport[];
  /** Maintainer npub for visual confirmation; rendered truncated. */
  maintainerNpub: string;
  /** Called after a successful send. */
  onSent?: (ts: number) => void;
  /** Called after a discard (no DM sent). */
  onDiscarded?: (ts: number) => void;
  /** Called when the queue has been fully processed (sent + discarded). */
  onAllProcessed?: () => void;
}

/**
 * Truncate a bech32-shaped string to the first 9 + last 4 chars, joined
 * with an ellipsis. The maintainer npub is rendered this way so the user
 * can eyeball the destination without needing to read 63 characters.
 */
function truncateNpub(npub: string): string {
  if (npub.length <= 13) return npub;
  return `${npub.slice(0, 9)}…${npub.slice(-4)}`;
}

/**
 * One modal per queued report (the oldest). The footer holds Discard,
 * Send, and (when more than one queued) Send-all. The body shows a
 * pretty-printed JSON preview so the user reviews exactly what's about
 * to leave the device.
 */
export function CrashReportPrompt({
  reports,
  maintainerNpub,
  onSent,
  onDiscarded,
  onAllProcessed,
}: CrashReportPromptProps): ReactNode {
  const { warning, danger } = useToast();
  const [busy, setBusy] = useState(false);
  const current = reports[0];

  if (!current) return null;

  const truncated = truncateNpub(maintainerNpub);
  const payloadJson = JSON.stringify(current, null, 2);

  const handleDiscard = (): void => {
    clearReport(current.ts);
    onDiscarded?.(current.ts);
  };

  const surfaceFailure = (
    reason: 'no-signer' | 'decode-failed' | 'send-failed',
  ): void => {
    if (reason === 'no-signer') {
      warning('Sign in first', 'Crash reports need an active signer.');
    } else {
      danger('Send failed — try again later');
    }
  };

  const handleSend = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await sendCrashReport(current);
      if (result.ok) {
        onSent?.(current.ts);
      } else {
        surfaceFailure(result.reason);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSendAll = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      for (const report of reports) {
        const result = await sendCrashReport(report);
        if (result.ok) {
          onSent?.(report.ts);
        } else {
          surfaceFailure(result.reason);
          break;
        }
      }
      onAllProcessed?.();
    } finally {
      setBusy(false);
    }
  };

  const showSendAll = reports.length > 1;

  return (
    <Sheet
      open={true}
      onClose={handleDiscard}
      title="Crash report ready to send"
      description="Encrypted DM to the maintainer."
      maxHeight="80vh"
      hideCloseButton
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            disabled={busy}
          >
            Discard
          </Button>
          {showSendAll && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void handleSendAll();
              }}
              loading={busy}
            >
              {`Send all (${reports.length})`}
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              void handleSend();
            }}
            loading={busy}
          >
            Send
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-soil-700">
          We caught an error. Sending it as an encrypted DM helps the
          maintainer fix it. Review what&apos;s included before sending.
        </p>
        <p className="text-xs text-soil-500">
          Destination:{' '}
          <span className="font-mono text-soil-700">{truncated}</span>
        </p>
        <pre
          className="max-h-72 overflow-auto rounded-card border border-soil-200 bg-soil-50 px-3 py-2 text-xs font-mono break-all whitespace-pre-wrap text-soil-800"
          aria-label="Crash report payload"
        >
          {payloadJson}
        </pre>
      </div>
    </Sheet>
  );
}

export default CrashReportPrompt;
