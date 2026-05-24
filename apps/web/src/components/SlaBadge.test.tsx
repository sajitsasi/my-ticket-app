import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlaBadge, formatRemaining } from './SlaBadge';
import type { TicketStatus } from '../types';

interface SlaProps {
  status: TicketStatus;
  sla_target_hours: number;
  sla_remaining_seconds: number;
  sla_breached: boolean;
}

function renderBadge(props: SlaProps) {
  return render(<SlaBadge {...props} />);
}

describe('SlaBadge', () => {
  it('shows countdown text when not breached and not resolved', () => {
    renderBadge({
      status: 'open',
      sla_target_hours: 4,
      sla_remaining_seconds: 5400,
      sla_breached: false,
    });
    expect(screen.getByTestId('sla-badge')).toHaveTextContent('1h 30m');
    expect(screen.getByTestId('sla-badge')).toHaveAttribute(
      'data-sla-state',
      'countdown'
    );
  });

  it('shows "Breached" when breached and not resolved', () => {
    renderBadge({
      status: 'open',
      sla_target_hours: 4,
      sla_remaining_seconds: -3600,
      sla_breached: true,
    });
    expect(screen.getByTestId('sla-badge')).toHaveTextContent('Breached');
    expect(screen.getByTestId('sla-badge')).toHaveAttribute(
      'data-sla-state',
      'breached'
    );
  });

  it('shows "Breached" when resolved but SLA was breached', () => {
    renderBadge({
      status: 'resolved',
      sla_target_hours: 4,
      sla_remaining_seconds: -3600,
      sla_breached: true,
    });
    expect(screen.getByTestId('sla-badge')).toHaveTextContent('Breached');
    expect(screen.getByTestId('sla-badge')).toHaveAttribute(
      'data-sla-state',
      'breached'
    );
  });

  it('shows "Met" when resolved on time', () => {
    renderBadge({
      status: 'resolved',
      sla_target_hours: 4,
      sla_remaining_seconds: 3600,
      sla_breached: false,
    });
    expect(screen.getByTestId('sla-badge')).toHaveTextContent('Met');
    expect(screen.getByTestId('sla-badge')).toHaveAttribute(
      'data-sla-state',
      'met'
    );
  });

  it('shows "Met" when closed on time', () => {
    renderBadge({
      status: 'closed',
      sla_target_hours: 4,
      sla_remaining_seconds: 1800,
      sla_breached: false,
    });
    expect(screen.getByTestId('sla-badge')).toHaveTextContent('Met');
  });

  it('shows "Breached" when closed after SLA target', () => {
    renderBadge({
      status: 'closed',
      sla_target_hours: 4,
      sla_remaining_seconds: -7200,
      sla_breached: true,
    });
    expect(screen.getByTestId('sla-badge')).toHaveTextContent('Breached');
  });

  it('shows hours only when minutes are zero', () => {
    renderBadge({
      status: 'in_progress',
      sla_target_hours: 8,
      sla_remaining_seconds: 7200,
      sla_breached: false,
    });
    expect(screen.getByTestId('sla-badge')).toHaveTextContent('2h');
  });

  it('shows minutes only when under an hour', () => {
    renderBadge({
      status: 'open',
      sla_target_hours: 4,
      sla_remaining_seconds: 1800,
      sla_breached: false,
    });
    expect(screen.getByTestId('sla-badge')).toHaveTextContent('30m');
  });

  it('has correct aria-label for countdown', () => {
    renderBadge({
      status: 'open',
      sla_target_hours: 4,
      sla_remaining_seconds: 5400,
      sla_breached: false,
    });
    expect(screen.getByTestId('sla-badge')).toHaveAttribute(
      'aria-label',
      '1h 30m remaining'
    );
  });

  it('has correct aria-label for breached', () => {
    renderBadge({
      status: 'open',
      sla_target_hours: 4,
      sla_remaining_seconds: -100,
      sla_breached: true,
    });
    expect(screen.getByTestId('sla-badge')).toHaveAttribute(
      'aria-label',
      'SLA breached'
    );
  });

  it('has correct aria-label for met', () => {
    renderBadge({
      status: 'resolved',
      sla_target_hours: 4,
      sla_remaining_seconds: 3600,
      sla_breached: false,
    });
    expect(screen.getByTestId('sla-badge')).toHaveAttribute(
      'aria-label',
      'SLA met'
    );
  });
});

describe('formatRemaining', () => {
  it('formats hours and minutes', () => {
    expect(formatRemaining(5400)).toBe('1h 30m');
  });

  it('formats whole hours', () => {
    expect(formatRemaining(7200)).toBe('2h');
  });

  it('formats minutes only', () => {
    expect(formatRemaining(1800)).toBe('30m');
  });

  it('formats zero', () => {
    expect(formatRemaining(0)).toBe('0m');
  });

  it('formats negative as zero', () => {
    expect(formatRemaining(-3600)).toBe('0m');
  });

  it('formats large hour values', () => {
    expect(formatRemaining(259200)).toBe('72h');
  });
});
