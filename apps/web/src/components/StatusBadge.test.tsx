import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders the human-readable label without a select when no onChange is provided', () => {
    render(<StatusBadge status="open" />);
    expect(screen.getByTestId('status-badge-label')).toHaveTextContent('Open');
    expect(screen.queryByLabelText('Change status')).toBeNull();
  });

  it('renders a select with only valid next statuses for open', () => {
    render(<StatusBadge status="open" onChange={() => {}} />);
    const select = screen.getByLabelText('Change status') as HTMLSelectElement;
    const optionLabels = Array.from(select.options)
      .filter((o) => o.value !== '')
      .map((o) => o.textContent);
    expect(optionLabels).toEqual(['In Progress']);
  });

  it('offers closed and in_progress as next options for resolved', () => {
    render(<StatusBadge status="resolved" onChange={() => {}} />);
    const select = screen.getByLabelText('Change status') as HTMLSelectElement;
    const values = Array.from(select.options)
      .filter((o) => o.value !== '')
      .map((o) => o.value);
    expect(values.sort()).toEqual(['closed', 'in_progress']);
  });

  it('does not render a select for closed (terminal state)', () => {
    render(<StatusBadge status="closed" onChange={() => {}} />);
    expect(screen.getByTestId('status-badge-label')).toHaveTextContent('Closed');
    expect(screen.queryByLabelText('Change status')).toBeNull();
  });

  it('invokes onChange with the selected next status', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StatusBadge status="open" onChange={onChange} />);
    await user.selectOptions(
      screen.getByLabelText('Change status'),
      'in_progress'
    );
    expect(onChange).toHaveBeenCalledWith('in_progress');
  });

  it('disables the select when disabled prop is true', () => {
    render(
      <StatusBadge status="open" onChange={() => {}} disabled />
    );
    expect(
      screen.getByLabelText('Change status') as HTMLSelectElement
    ).toBeDisabled();
  });
});
