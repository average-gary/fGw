/**
 * SPEC-024 — Learn route tests.
 *
 * Confirms:
 *   • All five topic tabs render.
 *   • Switching tabs swaps the rendered content.
 *   • The Compost Recipe page interpolates `PILE_*` constants — we look
 *     for the literal "10 cm woody" line and the schedule recap.
 *
 * Vite's `?raw` import suffix is honoured by vitest by default (the
 * vite.config.ts is the test config too), so we get the markdown source
 * inline.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Learn } from './Learn';
import {
  PILE_LAYER_RECIPE,
  PILE_TURN_SCHEDULE_DAYS,
  PILE_TEMP_RANGE_C,
  PLANTING_STATION,
  MULCH,
} from '@/domain/fgw';

afterEach(() => cleanup());

describe('SPEC-024 Learn route', () => {
  it('renders all five topic tabs', () => {
    render(<Learn />);
    expect(screen.getByRole('tab', { name: 'Six Keys' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Compost Recipe' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'On Time' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Planting Station' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: "God's Blanket" })).toBeTruthy();
  });

  it('opens Six Keys by default and renders headings', () => {
    render(<Learn />);
    // h1 from the markdown.
    expect(screen.getByRole('heading', { name: /Six Management Keys/i })).toBeTruthy();
    // Subheading exact match (avoids ambiguity with "Plant On Time").
    expect(screen.getByRole('heading', { name: '1. On Time' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Save Seeds/i })).toBeTruthy();
  });

  it('switches to Compost Recipe and substitutes PILE_* constants', async () => {
    const user = userEvent.setup();
    render(<Learn />);
    await user.click(screen.getByRole('tab', { name: 'Compost Recipe' }));

    // Constant interpolation: "10 cm woody"
    expect(
      screen.getByText(
        new RegExp(`${PILE_LAYER_RECIPE.woody_cm}\\s*cm woody`, 'i'),
      ),
    ).toBeTruthy();

    // The full turn-day schedule should appear in the rendered page.
    const turnDays = PILE_TURN_SCHEDULE_DAYS.join(', ');
    const compostPanel = screen.getByRole('tabpanel', { name: 'Compost Recipe' });
    expect(compostPanel.textContent ?? '').toContain(turnDays);

    // Temperature range from PILE_TEMP_RANGE_C.
    const tempRangeRe = new RegExp(
      `${PILE_TEMP_RANGE_C.min}.{0,4}${PILE_TEMP_RANGE_C.max}`,
    );
    expect(tempRangeRe.test(compostPanel.textContent ?? '')).toBe(true);

    // The "every 10 days for the next 2 or 3 turns" hint is part of the page.
    expect(compostPanel.textContent ?? '').toMatch(
      /every 10 days for the next 2 or 3 turns/i,
    );
  });

  it('switches to Planting Station and renders the spacing constants', async () => {
    const user = userEvent.setup();
    render(<Learn />);
    await user.click(screen.getByRole('tab', { name: 'Planting Station' }));

    const panel = screen.getByRole('tabpanel', { name: 'Planting Station' });
    const txt = panel.textContent ?? '';
    expect(txt).toContain(`${PLANTING_STATION.in_row_cm} cm`);
    expect(txt).toContain(`${PLANTING_STATION.row_cm} cm`);
    expect(txt).toContain(`${PLANTING_STATION.organic_input_depth_cm} cm`);
  });

  it("switches to God's Blanket and renders MULCH constants", async () => {
    const user = userEvent.setup();
    render(<Learn />);
    await user.click(screen.getByRole('tab', { name: "God's Blanket" }));

    const panel = screen.getByRole('tabpanel', { name: "God's Blanket" });
    const txt = panel.textContent ?? '';
    expect(txt).toContain(`${MULCH.thickness_cm} cm`);
    expect(txt).toContain(`${Math.round(MULCH.coverage * 100)}%`);
  });

  it('switches to On Time tab', async () => {
    const user = userEvent.setup();
    render(<Learn />);
    await user.click(screen.getByRole('tab', { name: 'On Time' }));
    expect(screen.getByRole('heading', { name: /Key 1/i })).toBeTruthy();
  });
});
