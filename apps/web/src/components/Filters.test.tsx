import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Filters } from './Filters';
import {
  EMPTY_FILTERS,
  isFiltersEmpty,
  type FilterValues,
} from './filterValues';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

const USERS = [
  { id: ALICE, name: 'Alice Agent' },
  { id: BOB, name: 'Bob Agent' },
];

const TAGS = ['bug', 'feature', 'urgent'];

function renderFilters(values: FilterValues = EMPTY_FILTERS) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  const utils = render(
    <Filters
      values={values}
      users={USERS}
      availableTags={TAGS}
      onChange={onChange}
      onReset={onReset}
    />
  );
  return { ...utils, onChange, onReset };
}

describe('Filters', () => {
  it('emits a status change when the dropdown selection changes', async () => {
    const { onChange } = renderFilters();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'open');
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, status: 'open' });
  });

  it('emits a priority change when the dropdown selection changes', async () => {
    const { onChange } = renderFilters();
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText('Filter by priority'),
      'urgent'
    );
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      priority: 'urgent',
    });
  });

  it('emits an assignee change with the selected user id', async () => {
    const { onChange } = renderFilters();
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText('Filter by assignee'),
      ALICE
    );
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      assignee: ALICE,
    });
  });

  it('emits a search change for every keystroke (no debounce)', async () => {
    const { onChange } = renderFilters();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search tickets'), 'abc');
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenNthCalledWith(1, {
      ...EMPTY_FILTERS,
      q: 'a',
    });
    expect(onChange).toHaveBeenNthCalledWith(2, {
      ...EMPTY_FILTERS,
      q: 'b',
    });
    expect(onChange).toHaveBeenNthCalledWith(3, {
      ...EMPTY_FILTERS,
      q: 'c',
    });
  });

  it('toggles a tag chip on click and toggles it off when clicked again', async () => {
    const { onChange, rerender } = renderFilters();
    const user = userEvent.setup();
    const bug = screen.getByRole('button', { name: 'bug' });
    await user.click(bug);
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, tag: 'bug' });

    rerender(
      <Filters
        values={{ ...EMPTY_FILTERS, tag: 'bug' }}
        users={USERS}
        availableTags={TAGS}
        onChange={onChange}
        onReset={vi.fn()}
      />
    );
    const bugAgain = screen.getByRole('button', { name: 'bug' });
    expect(bugAgain).toHaveAttribute('aria-pressed', 'true');
    await user.click(bugAgain);
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, tag: '' });
  });

  it('disables the Clear filters button when no filters are active', () => {
    renderFilters();
    expect(
      screen.getByRole('button', { name: /clear filters/i })
    ).toBeDisabled();
  });

  it('enables Clear filters when any filter is active and triggers onReset', async () => {
    const { onReset } = renderFilters({
      ...EMPTY_FILTERS,
      status: 'open',
    });
    const button = screen.getByRole('button', { name: /clear filters/i });
    expect(button).not.toBeDisabled();
    await userEvent.setup().click(button);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('isFiltersEmpty correctly detects empty and non-empty filters', () => {
    expect(isFiltersEmpty(EMPTY_FILTERS)).toBe(true);
    expect(isFiltersEmpty({ ...EMPTY_FILTERS, q: 'x' })).toBe(false);
    expect(isFiltersEmpty({ ...EMPTY_FILTERS, status: 'open' })).toBe(false);
    expect(isFiltersEmpty({ ...EMPTY_FILTERS, tag: 'bug' })).toBe(false);
  });
});
