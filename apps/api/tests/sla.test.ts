import { describe, expect, it } from 'vitest';
import {
  SLA_TARGET_HOURS,
  computeSla,
} from '../src/domain/sla.js';

describe('SLA_TARGET_HOURS', () => {
  it('maps every priority to a positive number', () => {
    for (const priority of ['urgent', 'high', 'medium', 'low'] as const) {
      const target = SLA_TARGET_HOURS[priority];
      expect(target).toBeDefined();
      expect(target!).toBeGreaterThan(0);
    }
  });

  it('urgent has a shorter target than high', () => {
    expect(SLA_TARGET_HOURS.urgent).toBeLessThan(SLA_TARGET_HOURS.high);
  });

  it('high has a shorter target than medium', () => {
    expect(SLA_TARGET_HOURS.high).toBeLessThan(SLA_TARGET_HOURS.medium);
  });

  it('medium has a shorter target than low', () => {
    expect(SLA_TARGET_HOURS.medium).toBeLessThan(SLA_TARGET_HOURS.low);
  });

  it('has the exact values from the spec', () => {
    expect(SLA_TARGET_HOURS).toEqual({
      urgent: 4,
      high: 8,
      medium: 24,
      low: 72,
    });
  });
});

describe('computeSla', () => {
  const NOW = new Date('2025-06-01T12:00:00Z');

  it('returns positive remaining seconds for a ticket well within target', () => {
    const createdAt = new Date('2025-06-01T10:00:00Z'); // 2h ago
    const result = computeSla('urgent', createdAt, null, NOW);
    expect(result.sla_target_hours).toBe(4);
    expect(result.sla_remaining_seconds).toBeGreaterThan(0);
    expect(result.sla_breached).toBe(false);
  });

  it('computes correct remaining seconds for urgent priority', () => {
    const createdAt = new Date('2025-06-01T10:00:00Z'); // 2h ago, target=4h, remaining=2h
    const result = computeSla('urgent', createdAt, null, NOW);
    expect(result.sla_remaining_seconds).toBe(2 * 3600);
  });

  it('computes correct remaining seconds for low priority', () => {
    const createdAt = new Date('2025-06-01T00:00:00Z'); // 12h ago, target=72h, remaining=60h
    const result = computeSla('low', createdAt, null, NOW);
    expect(result.sla_remaining_seconds).toBe(60 * 3600);
  });

  it('flags breach when elapsed time exceeds target', () => {
    const createdAt = new Date('2025-06-01T06:00:00Z'); // 6h ago, target=4h for urgent
    const result = computeSla('urgent', createdAt, null, NOW);
    expect(result.sla_breached).toBe(true);
    expect(result.sla_remaining_seconds).toBeLessThanOrEqual(0);
  });

  it('returns zero remaining seconds at the exact breach moment', () => {
    const createdAt = new Date('2025-06-01T08:00:00Z'); // 4h ago, target=4h for urgent
    const result = computeSla('urgent', createdAt, null, NOW);
    expect(result.sla_remaining_seconds).toBe(0);
    expect(result.sla_breached).toBe(true);
  });

  it('for resolved ticket resolved within target, sets breached=false and remaining >= 0', () => {
    const createdAt = new Date('2025-06-01T10:00:00Z'); // 2h before NOW
    const resolvedAt = new Date('2025-06-01T11:00:00Z'); // 1h after creation, target=4h
    const result = computeSla('urgent', createdAt, resolvedAt, NOW);
    expect(result.sla_target_hours).toBe(4);
    expect(result.sla_breached).toBe(false);
    expect(result.sla_remaining_seconds).toBeGreaterThanOrEqual(0);
  });

  it('for resolved ticket resolved after target, sets breached=true', () => {
    const createdAt = new Date('2025-06-01T06:00:00Z'); // 6h before NOW
    const resolvedAt = new Date('2025-06-01T11:00:00Z'); // resolved 5h after creation, target=4h for urgent
    const result = computeSla('urgent', createdAt, resolvedAt, NOW);
    expect(result.sla_breached).toBe(true);
    expect(result.sla_remaining_seconds).toBeLessThanOrEqual(0);
  });

  it('for closed ticket, uses resolved_at for computation', () => {
    const createdAt = new Date('2025-06-01T00:00:00Z');
    const resolvedAt = new Date('2025-06-01T03:00:00Z'); // 3h after creation, target=4h for urgent
    const result = computeSla('urgent', createdAt, resolvedAt, NOW);
    expect(result.sla_breached).toBe(false);
  });

  it('changing priority from low to urgent shortens target', () => {
    const createdAt = new Date('2025-06-01T06:00:00Z'); // 6h ago
    const lowResult = computeSla('low', createdAt, null, NOW);
    const urgentResult = computeSla('urgent', createdAt, null, NOW);
    expect(urgentResult.sla_target_hours).toBeLessThan(lowResult.sla_target_hours);
    expect(urgentResult.sla_remaining_seconds).toBeLessThan(lowResult.sla_remaining_seconds);
  });

  it('changing priority from urgent to low lengthens target', () => {
    const createdAt = new Date('2025-06-01T06:00:00Z'); // 6h ago
    const urgentResult = computeSla('urgent', createdAt, null, NOW);
    const lowResult = computeSla('low', createdAt, null, NOW);
    // urgent is breached (6h > 4h), but low is not (6h < 72h)
    expect(urgentResult.sla_breached).toBe(true);
    expect(lowResult.sla_breached).toBe(false);
  });

  it('resolved_at does not count down on subsequent calls', () => {
    const createdAt = new Date('2025-06-01T06:00:00Z');
    const resolvedAt = new Date('2025-06-01T09:30:00Z');

    const result1 = computeSla('urgent', createdAt, resolvedAt, NOW);
    const laterNow = new Date('2025-06-01T13:00:00Z'); // 1h later
    const result2 = computeSla('urgent', createdAt, resolvedAt, laterNow);

    expect(result1.sla_remaining_seconds).toBe(result2.sla_remaining_seconds);
    expect(result1.sla_breached).toBe(result2.sla_breached);
  });

  it('non-resolved ticket counts down over time', () => {
    const createdAt = new Date('2025-06-01T10:00:00Z');
    const result1 = computeSla('urgent', createdAt, null, NOW);
    const laterNow = new Date('2025-06-01T12:30:00Z'); // 30min later
    const result2 = computeSla('urgent', createdAt, null, laterNow);
    expect(result2.sla_remaining_seconds).toBeLessThan(result1.sla_remaining_seconds);
  });
});
