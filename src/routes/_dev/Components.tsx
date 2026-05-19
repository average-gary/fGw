import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Card, CardTitle, CardSubtitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { ToastProvider, useToast } from '@/components/ui/Toast';

/**
 * /_dev/components — visual showcase of every UI primitive.
 *
 * Rendered as the default content of <App/> for now (SPEC-004 acceptance).
 * Replace with the Feed route when SPEC-018 lands.
 */

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="px-5 py-7 border-b border-soil-200/70 last:border-b-0">
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h2 className="font-serif text-2xl text-soil-900 leading-tight">{title}</h2>
      {description && (
        <p className="mt-1.5 text-sm text-soil-600 leading-relaxed">{description}</p>
      )}
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Stack({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div>
      {label && <p className="text-xs font-mono uppercase tracking-eyebrow text-soil-400 mb-2">{label}</p>}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// Tiny inline icon used in a few demos.
const Sprout = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 14V8M8 8C8 5.5 9.5 4 12 4C12 6.5 10.5 8 8 8ZM8 8C8 5.5 6.5 4 4 4C4 6.5 5.5 8 8 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

function ShowcaseInner() {
  const { toast, success, warning, danger } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [textareaValue, setTextareaValue] = useState(
    'Two cubic yards of fresh manure, ready Saturday morning. Pickup off Lost River Road.',
  );
  const [errorInput, setErrorInput] = useState('');

  return (
    <div className="min-h-screen w-full">
      {/* Top hero banner — sets the tone for the showcase page. */}
      <header className="relative px-5 pt-10 pb-7 border-b border-soil-200/70">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="h-full w-full bg-[radial-gradient(120%_60%_at_0%_0%,rgba(126,163,77,0.10),transparent_60%),radial-gradient(80%_50%_at_100%_0%,rgba(203,114,54,0.08),transparent_60%)]" />
        </div>
        <p className="eyebrow text-moss-700">SPEC-004 · UI Primitives</p>
        <h1 className="mt-2 font-serif text-display-md text-soil-900">
          Compost Marketplace<span className="text-moss-700">.</span>
        </h1>
        <p className="mt-2 text-soil-700 max-w-prose leading-relaxed">
          The visual foundation. Earthy palette, distinctive type, restrained
          chrome — built for the Powder Keg Farms chapter and any FGW chapter
          that comes after.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Badge variant="success" dot>FGW · Powder Keg WV</Badge>
          <Badge variant="default">USDA Zone 6b</Badge>
          <Badge variant="muted">High View, WV</Badge>
        </div>
      </header>

      {/* Buttons */}
      <Section
        eyebrow="01 · Actions"
        title="Buttons"
        description="Primary action is moss green; destructive is harvest rust. Subtle press shadow rather than flat slabs."
      >
        <Stack label="Variants — md">
          <Button>Plant a need</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="destructive">Abandon pile</Button>
        </Stack>

        <Stack label="Sizes">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </Stack>

        <Stack label="With icon slots">
          <Button leadingIcon={<Sprout />}>Add a sprout</Button>
          <Button variant="secondary" trailingIcon={<Arrow />}>Continue</Button>
          <Button variant="ghost" leadingIcon={<Arrow />}>Back</Button>
        </Stack>

        <Stack label="Loading & disabled">
          <Button loading>Publishing</Button>
          <Button variant="secondary" loading>Saving</Button>
          <Button disabled>Unavailable</Button>
          <Button variant="destructive" loading>Removing</Button>
        </Stack>

        <Stack label="Full width">
          <Button fullWidth size="lg" leadingIcon={<Sprout />}>
            Build a 2 × 2 × 2 pile
          </Button>
        </Stack>
      </Section>

      {/* Inputs */}
      <Section
        eyebrow="02 · Forms"
        title="Inputs"
        description="Text input with label, helper, and error state. Two variants."
      >
        <Input
          label="Pile name"
          placeholder="e.g. North field, spring '26"
          helperText="Human-readable. We'll auto-slug a short id from this."
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
        />
        <Input
          label="Filled variant"
          variant="filled"
          placeholder="Search materials"
          leadingAdornment={
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
        />
        <Input
          label="With trailing unit"
          type="number"
          defaultValue={12}
          trailingAdornment={<span className="text-xs font-mono">bags</span>}
        />
        <Input
          label="Required + error"
          required
          value={errorInput}
          onChange={(e) => setErrorInput(e.target.value)}
          error={errorInput.length === 0 ? 'A title is required to publish.' : undefined}
          placeholder="Listing title"
        />
        <Input label="Disabled" disabled defaultValue="Locked while publishing" />
      </Section>

      {/* Textarea */}
      <Section
        eyebrow="03 · Forms"
        title="Textarea"
        description="Auto-grow optional. Same focus and error treatments as Input."
      >
        <Textarea
          label="Description"
          autoGrow
          value={textareaValue}
          onChange={(e) => setTextareaValue(e.target.value)}
          helperText="Auto-grows to a max of 10 rows."
        />
        <Textarea
          label="Filled variant"
          variant="filled"
          rows={3}
          placeholder="Write a short note to the chapter…"
        />
        <Textarea
          label="With error"
          rows={2}
          error="Please describe what you're offering."
        />
      </Section>

      {/* Select */}
      <Section
        eyebrow="04 · Forms"
        title="Select"
        description="Native select, styled to match Input. Caret tracks current text color."
      >
        <Select
          label="Material"
          placeholder="Choose a material…"
          options={[
            { value: 'manure-fresh', label: 'Fresh manure' },
            { value: 'manure-aged', label: 'Aged manure' },
            { value: 'green-grass', label: 'Green grass clippings' },
            { value: 'woody-cardboard', label: 'Cardboard (woody)' },
            { value: 'dry-leaves', label: 'Dry leaves' },
            { value: 'compost-finished', label: 'Finished compost' },
          ]}
          defaultValue=""
        />
        <Select
          label="Pile preset"
          variant="filled"
          options={[
            { value: 'standard', label: 'Standard — 2 × 2 × 2 m' },
            { value: 'large', label: 'Large — 4 × 4 × 3 m' },
            { value: 'commercial', label: 'Commercial — 6 × 6 × 6 m' },
            { value: 'custom', label: 'Custom dimensions' },
          ]}
          defaultValue="standard"
        />
        <Select
          label="Geo precision (with error)"
          options={[
            { value: '4', label: 'Region (~20 km)' },
            { value: '5', label: 'Town (~2.4 km)' },
            { value: '6', label: 'Neighborhood (~610 m)' },
            { value: '7', label: 'Street (~76 m)' },
          ]}
          error="Pick a precision before publishing."
          defaultValue="5"
        />
      </Section>

      {/* Card */}
      <Section
        eyebrow="05 · Surfaces"
        title="Cards"
        description="Paper-tone surface with a hairline border. Optional header, footer, hover lift."
      >
        <Card
          header={
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>5 bags fresh manure</CardTitle>
                <CardSubtitle>Need · within 15 mi of High View</CardSubtitle>
              </div>
              <Badge variant="warning" dot>Urgent</Badge>
            </div>
          }
          footer={
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-soil-500 truncate">npub1g…3kx</span>
              <Button size="sm">Volunteer</Button>
            </div>
          }
        >
          <p className="text-sm text-soil-700 leading-relaxed">
            Building a standard 2 × 2 × 2 pile this Saturday. Looking for ~five
            50&nbsp;kg bags of fresh manure. Will pick up.
          </p>
        </Card>

        <Card hoverable>
          <p className="font-serif text-lg text-soil-900 leading-tight">
            Hoverable card — lift on hover.
          </p>
          <p className="text-sm text-soil-600 mt-1">
            Use for tappable list rows in feeds and inboxes.
          </p>
        </Card>

        <Card variant="inset">
          <p className="text-sm text-soil-700">
            Inset variant — sits inside other cards or as a quiet stat block.
          </p>
        </Card>

        <Card variant="flat">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Next turn</p>
              <p className="font-serif text-2xl text-soil-900 leading-tight mt-1">
                Day 3 · Saturday 9:00 AM
              </p>
            </div>
            <Spinner size="md" tone="moss" />
          </div>
        </Card>
      </Section>

      {/* Badges */}
      <Section
        eyebrow="06 · Status"
        title="Badges"
        description="Small monospaced pills. Use sparingly — never more than two on the same row."
      >
        <Stack label="Variants">
          <Badge>Default</Badge>
          <Badge variant="success">Allowed</Badge>
          <Badge variant="warning">Pending</Badge>
          <Badge variant="danger">Banned</Badge>
          <Badge variant="muted">Archived</Badge>
        </Stack>
        <Stack label="With dot">
          <Badge dot>Need</Badge>
          <Badge variant="success" dot>Offer</Badge>
          <Badge variant="warning" dot>Curing</Badge>
          <Badge variant="danger" dot>No-show</Badge>
          <Badge variant="muted" dot>Draft</Badge>
        </Stack>
        <Stack label="Sizes">
          <Badge size="sm">sm</Badge>
          <Badge size="md">md</Badge>
        </Stack>
      </Section>

      {/* Spinner */}
      <Section
        eyebrow="07 · Feedback"
        title="Spinner"
        description="Two-arc design. Inherits color via tone='current' so it can live inside any colored container."
      >
        <Stack label="Sizes">
          <Spinner size="xs" tone="moss" />
          <Spinner size="sm" tone="moss" />
          <Spinner size="md" tone="moss" />
          <Spinner size="lg" tone="moss" />
        </Stack>
        <Stack label="Tones">
          <Spinner size="md" tone="moss" />
          <Spinner size="md" tone="soil" />
          <span className="inline-flex h-9 px-3 items-center rounded-card bg-soil-800 text-bloom-50">
            <Spinner size="sm" tone="bloom" />
          </span>
        </Stack>
      </Section>

      {/* Sheet */}
      <Section
        eyebrow="08 · Surfaces"
        title="Sheet"
        description="Bottom sheet — backdrop tap, ESC, or close button to dismiss. Body scroll locked while open."
      >
        <Stack>
          <Button onClick={() => setSheetOpen(true)} leadingIcon={<Sprout />}>
            Open sheet
          </Button>
        </Stack>
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Volunteer for this turn"
          description="Saturday · 9:00 AM · Powder Keg North field"
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setSheetOpen(false)}>
                Maybe later
              </Button>
              <Button onClick={() => {
                setSheetOpen(false);
                success('You\'re in', 'See you Saturday at 9.');
              }}>
                I&rsquo;m in
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <Card variant="inset">
              <p className="text-sm text-soil-700 leading-relaxed">
                Day-3 turn for the standard 2 × 2 × 2 pile. Estimated ~1.5 hours,
                one volunteer minimum.
              </p>
            </Card>
            <Textarea
              label="Note for the builder (optional)"
              autoGrow
              rows={2}
              placeholder="Bringing a 5-gal bucket of finished compost too."
            />
            <Select
              label="Bringing a tool?"
              placeholder="Pick a tool…"
              options={[
                { value: 'pitchfork', label: 'Pitchfork' },
                { value: 'wheelbarrow', label: 'Wheelbarrow' },
                { value: 'tarp', label: 'Tarp' },
                { value: 'water', label: '5-gal water jugs' },
              ]}
            />
          </div>
        </Sheet>
      </Section>

      {/* Toast */}
      <Section
        eyebrow="09 · Feedback"
        title="Toast"
        description="Stacked at bottom-center. ToastProvider sits at the root; useToast() raises them."
      >
        <Stack>
          <Button
            onClick={() =>
              toast({
                title: 'Listing published',
                description: 'It will sync to Powder Keg WV in a moment.',
              })
            }
          >
            Default toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              success(
                'Pile turn scheduled',
                '6 turns over the next 39 days. Notifications set for 9 AM.',
              )
            }
          >
            Success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              warning('Connection wobbly', 'Holding your event until the relay is back.')
            }
          >
            Warning toast
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              danger('Publish refused', 'You aren\'t a chapter member yet. Request an invite.')
            }
          >
            Danger toast
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast({
                title: 'Saved as draft',
                description: 'You can publish later from My Listings.',
                action: { label: 'View drafts', onClick: () => undefined },
              })
            }
          >
            With action
          </Button>
        </Stack>
      </Section>

      <footer className="px-5 py-6 text-center">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-soil-400">
          End of showcase · SPEC-004
        </p>
      </footer>
    </div>
  );
}

export default function ComponentsRoute() {
  return (
    <ToastProvider>
      <ShowcaseInner />
    </ToastProvider>
  );
}
