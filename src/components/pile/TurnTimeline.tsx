/**
 * SPEC-021 — Six-turn timeline.
 *
 * Renders one pill per turn with relative date + completion state. The next
 * due turn (first uncompleted whose start is in the future) is highlighted.
 */
import { Badge } from '@/components/ui/Badge';
import { PILE_TURN_SCHEDULE_DAYS } from '@/domain/fgw';
import type { Pile, TurnRecord } from '@/lib/pile/types';

export interface TurnTimelineProps {
  pile: Pile;
}

function relativeDate(unixSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const dDays = Math.round((unixSec - now) / 86400);
  if (dDays === 0) return 'today';
  if (dDays > 0) return `in ${dDays}d`;
  return `${-dDays}d ago`;
}

export function TurnTimeline({ pile }: TurnTimelineProps) {
  // Compute scheduled instants directly from `plannedBuildDate +
  // PILE_TURN_SCHEDULE_DAYS` so we don't depend on `generateTurnEvents`'s
  // 9 AM local snapping (the relative-date display is in days, not hours).
  const turns = PILE_TURN_SCHEDULE_DAYS.map((days, i) => {
    const startSec = pile.plannedBuildDate + days * 86400;
    const rec: TurnRecord | undefined = pile.turnRecords.find(
      (r) => r.index === i + 1,
    );
    return {
      index: i + 1,
      startSec,
      completed: !!rec?.completedAt,
    };
  });

  // First uncompleted turn = "next due". If all done, undefined.
  const nextDueIndex = turns.find((t) => !t.completed)?.index;

  return (
    <ol
      className="flex flex-wrap items-stretch gap-2"
      aria-label="Turn timeline"
    >
      {turns.map((t) => {
        const isNext = t.index === nextDueIndex;
        const variant = t.completed ? 'success' : isNext ? 'warning' : 'muted';
        return (
          <li
            key={t.index}
            className="flex flex-col items-center gap-1"
            aria-current={isNext ? 'step' : undefined}
            data-testid={`turn-pill-${t.index}`}
          >
            <Badge variant={variant} size="md">
              Turn {t.index}
            </Badge>
            <span className="font-mono text-[10px] uppercase tracking-eyebrow text-soil-500">
              {t.completed ? 'done' : relativeDate(t.startSec)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default TurnTimeline;
