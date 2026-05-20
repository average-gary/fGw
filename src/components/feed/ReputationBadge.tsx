/**
 * SPEC-018 — Reputation badge.
 *
 * Tiny presentational wrapper over `useReputation`. When score > 0 we show
 * a "starred" positive count; otherwise a muted neutral dot. We deliberately
 * stay quiet for the negative/no-show case — surfacing those numbers prom-
 * inently in feed cards turns reputation into a public stockade. The full
 * breakdown lives on the profile route.
 */
import { useReputation } from '@/lib/reputation';
import { Badge } from '@/components/ui/Badge';

export interface ReputationBadgeProps {
  pubkey: string;
  className?: string;
}

export function ReputationBadge({ pubkey, className }: ReputationBadgeProps) {
  const { score, positive } = useReputation(pubkey);

  if (score > 0) {
    return (
      <Badge variant="success" className={className} aria-label={`Reputation score ${score}`}>
        <span aria-hidden="true">★</span>
        <span>+{positive}</span>
      </Badge>
    );
  }
  return (
    <Badge variant="muted" dot className={className} aria-label="No reputation yet">
      new
    </Badge>
  );
}

export default ReputationBadge;
