/**
 * SPEC-024 — Learn.
 *
 * Renders five FGW field-guide pages from `src/content/learn/*.md`. The
 * Compost Recipe template uses `{{var}}` substitution to inject the live
 * `PILE_*` constants from `@/domain/fgw` so the recipe is always in sync
 * with the source of truth (no hand-written numbers).
 *
 * The renderer is a 60-ish line state machine that walks the source line
 * by line, opening/closing list and code-block contexts as it goes. We
 * deliberately do not pull in `marked`/`remark` — the markdown surface is
 * tiny and stable.
 */
import { useMemo, useState } from 'react';
import sixKeysMd from '@/content/learn/six-keys.md?raw';
import compostRecipeMd from '@/content/learn/compost-recipe.md?raw';
import onTimeMd from '@/content/learn/on-time.md?raw';
import plantingStationMd from '@/content/learn/planting-station.md?raw';
import godsBlanketMd from '@/content/learn/gods-blanket.md?raw';
import {
  PILE_LAYER_RECIPE,
  PILE_TURN_SCHEDULE_DAYS,
  PILE_TEMP_RANGE_C,
  PILE_MOISTURE_TARGET,
  PLANTING_STATION,
  MULCH,
} from '@/domain/fgw';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

export interface LearnProps {
  onBack?: () => void;
  /** Initial topic id; useful for tests + deep-linking. */
  initialTopic?: TopicId;
}

type TopicId =
  | 'six-keys'
  | 'compost-recipe'
  | 'on-time'
  | 'planting-station'
  | 'gods-blanket';

interface Topic {
  id: TopicId;
  label: string;
  source: string;
  vars?: Record<string, string | number>;
}

function buildTopics(): Topic[] {
  const compostVars: Record<string, string | number> = {
    woody_cm: PILE_LAYER_RECIPE.woody_cm,
    dry_cm: PILE_LAYER_RECIPE.dry_cm,
    green_cm: PILE_LAYER_RECIPE.green_cm,
    layer_total_cm: PILE_LAYER_RECIPE.layer_total_cm,
    manure_bags_50kg: PILE_LAYER_RECIPE.manure_bags_50kg,
    water_min_l: PILE_LAYER_RECIPE.water_litres.min,
    water_max_l: PILE_LAYER_RECIPE.water_litres.max,
    turn_day_1: PILE_TURN_SCHEDULE_DAYS[0],
    turn_day_2: PILE_TURN_SCHEDULE_DAYS[1],
    turn_day_3: PILE_TURN_SCHEDULE_DAYS[2],
    turn_day_4: PILE_TURN_SCHEDULE_DAYS[3],
    turn_day_5: PILE_TURN_SCHEDULE_DAYS[4],
    turn_day_6: PILE_TURN_SCHEDULE_DAYS[5],
    temp_min_c: PILE_TEMP_RANGE_C.min,
    temp_max_c: PILE_TEMP_RANGE_C.max,
    moisture_pct: Math.round(PILE_MOISTURE_TARGET * 100),
  };
  const stationVars: Record<string, string | number> = {
    in_row_cm: PLANTING_STATION.in_row_cm,
    row_cm: PLANTING_STATION.row_cm,
    organic_input_depth_cm: PLANTING_STATION.organic_input_depth_cm,
    inorganic_input_depth_cm: PLANTING_STATION.inorganic_input_depth_cm,
  };
  const blanketVars: Record<string, string | number> = {
    thickness_cm: MULCH.thickness_cm,
    coverage_pct: Math.round(MULCH.coverage * 100),
  };
  return [
    { id: 'six-keys', label: 'Six Keys', source: sixKeysMd },
    { id: 'compost-recipe', label: 'Compost Recipe', source: compostRecipeMd, vars: compostVars },
    { id: 'on-time', label: 'On Time', source: onTimeMd },
    { id: 'planting-station', label: 'Planting Station', source: plantingStationMd, vars: stationVars },
    { id: 'gods-blanket', label: "God's Blanket", source: godsBlanketMd, vars: blanketVars },
  ];
}

function substitute(src: string, vars?: Record<string, string | number>): string {
  if (!vars) return src;
  return src.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (full, key: string) => {
    const v = vars[key];
    return v === undefined ? full : String(v);
  });
}

// ---------------------------------------------------------------------------
// Tiny markdown renderer (~60 LOC). Supports:
//   • # / ## / ### headings
//   • paragraphs (blank-line separated)
//   • bullet lists with `- ` (single level)
//   • bold (`**x**`) and inline code (`` `x` ``)
//   • fenced code blocks (``` ... ```)
//   • horizontal rule (---)
// ---------------------------------------------------------------------------
import type { ReactNode } from 'react';

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Walk through text, emitting <strong>, <code>, or plain text spans.
  const out: ReactNode[] = [];
  let rest = text;
  let i = 0;
  while (rest.length > 0) {
    const codeIdx = rest.indexOf('`');
    const boldIdx = rest.indexOf('**');
    if (codeIdx === -1 && boldIdx === -1) { out.push(rest); break; }
    const useCode = codeIdx !== -1 && (boldIdx === -1 || codeIdx < boldIdx);
    if (useCode) {
      const end = rest.indexOf('`', codeIdx + 1);
      if (end === -1) { out.push(rest); break; }
      if (codeIdx > 0) out.push(rest.slice(0, codeIdx));
      out.push(<code key={`${keyPrefix}-c${i++}`} className="rounded bg-soil-100 px-1 font-mono text-[0.92em]">{rest.slice(codeIdx + 1, end)}</code>);
      rest = rest.slice(end + 1);
    } else {
      const end = rest.indexOf('**', boldIdx + 2);
      if (end === -1) { out.push(rest); break; }
      if (boldIdx > 0) out.push(rest.slice(0, boldIdx));
      out.push(<strong key={`${keyPrefix}-b${i++}`} className="font-semibold text-soil-900">{rest.slice(boldIdx + 2, end)}</strong>);
      rest = rest.slice(end + 2);
    }
  }
  return out;
}

function renderMarkdown(src: string): ReactNode[] {
  const lines = src.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') { i++; continue; }
    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        buf.push(lines[i] ?? '');
        i++;
      }
      i++; // skip closing fence
      blocks.push(<pre key={key++} className="my-3 overflow-x-auto rounded-card bg-soil-100 p-3 font-mono text-xs"><code>{buf.join('\n')}</code></pre>);
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push(<h3 key={key++} className="mt-5 font-serif text-lg text-soil-900">{renderInline(line.slice(4), `h${key}`)}</h3>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(<h2 key={key++} className="mt-6 font-serif text-xl text-soil-900">{renderInline(line.slice(3), `h${key}`)}</h2>);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      blocks.push(<h1 key={key++} className="mt-2 font-serif text-3xl text-soil-900">{renderInline(line.slice(2), `h${key}`)}</h1>);
      i++; continue;
    }
    if (line.trim() === '---') {
      blocks.push(<hr key={key++} className="my-6 border-soil-200" />);
      i++; continue;
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('- ')) {
        // Continuation lines (indented) join into the same item.
        let item = (lines[i] ?? '').slice(2);
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i] ?? '')) {
          item += ' ' + (lines[i] ?? '').trim();
          i++;
        }
        items.push(item);
      }
      blocks.push(
        <ul key={key++} className="my-3 list-disc space-y-1.5 pl-5 text-soil-700 leading-relaxed">
          {items.map((it, j) => <li key={j}>{renderInline(it, `li${key}-${j}`)}</li>)}
        </ul>,
      );
      continue;
    }
    // Paragraph: collect contiguous non-blank, non-special lines.
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const l = lines[i] ?? '';
      if (l.trim() === '' || l.startsWith('#') || l.startsWith('- ') || l.startsWith('```') || l.trim() === '---') break;
      para.push(l);
      i++;
    }
    blocks.push(<p key={key++} className="my-3 text-soil-700 leading-relaxed">{renderInline(para.join(' '), `p${key}`)}</p>);
  }
  return blocks;
}

export function Learn({ onBack, initialTopic = 'six-keys' }: LearnProps) {
  const topics = useMemo(() => buildTopics(), []);
  const [active, setActive] = useState<TopicId>(initialTopic);
  const topic = topics.find((t) => t.id === active) ?? topics[0]!;
  const rendered = useMemo(
    () => renderMarkdown(substitute(topic.source, topic.vars)),
    [topic.source, topic.vars],
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6 gap-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
          {'←'} Back
        </Button>
        <h1 className="font-serif text-xl text-soil-900">Learn</h1>
        <span className="w-12" />
      </header>

      <nav role="tablist" aria-label="Learn topics" className="flex flex-wrap gap-2">
        {topics.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === active}
            onClick={() => setActive(t.id)}
            className={cn(
              'rounded-card border px-3 py-1.5 text-sm font-medium transition-colors',
              t.id === active
                ? 'border-moss-700/40 bg-moss-600 text-bloom-50'
                : 'border-soil-200 bg-bloom-50 text-soil-700 hover:bg-bloom-100',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <article
        role="tabpanel"
        aria-label={topic.label}
        className="rounded-card border border-soil-200 bg-bloom-50 px-5 py-4 text-soil-800"
      >
        {rendered}
      </article>
    </main>
  );
}

export default Learn;
