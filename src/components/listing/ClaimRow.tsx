import { Button } from '@/components/ui/Button';
import type { Claim } from '@/lib/listings/claim';
import { PubkeyChip, truncatedNpub } from './PubkeyChip';

/** Tiny relative-time helper. Offline-deterministic. */
export function relativeTime(
  seconds: number,
  nowSec: number = Math.floor(Date.now() / 1000),
): string {
  const delta = Math.max(0, nowSec - seconds);
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 30 * 86400) return `${Math.floor(delta / 86400)}d ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

export interface ClaimRowProps {
  claim: Claim;
  onOpenDm: (claimerPubkey: string) => void;
}

export function ClaimRow({ claim: c, onOpenDm }: ClaimRowProps) {
  return (
    <div
      className="flex items-start gap-3 py-3 border-b border-soil-100 last:border-b-0"
      data-testid="claim-row"
      data-claimer={c.authorPubkey}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <PubkeyChip pubkey={c.authorPubkey} />
          <span className="text-xs text-soil-500 font-mono">
            {relativeTime(c.createdAt)}
          </span>
        </div>
        {c.message && (
          <p className="text-sm text-soil-700 mt-1 whitespace-pre-wrap break-words">
            {c.message}
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onOpenDm(c.authorPubkey)}
        aria-label={`Open DM with ${truncatedNpub(c.authorPubkey)}`}
      >
        Open DM
      </Button>
    </div>
  );
}

export default ClaimRow;
