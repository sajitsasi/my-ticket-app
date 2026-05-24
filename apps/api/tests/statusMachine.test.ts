import { describe, expect, it } from 'vitest';
import {
  TICKET_STATUSES,
  isAllowedTransition,
  nextStatuses,
  type TicketStatus,
} from '../src/domain/ticketStatus.js';

describe('ticket status state machine', () => {
  describe('isAllowedTransition', () => {
    const allowed: Array<[TicketStatus, TicketStatus]> = [
      ['open', 'in_progress'],
      ['in_progress', 'resolved'],
      ['resolved', 'closed'],
      ['resolved', 'in_progress'],
    ];

    for (const [from, to] of allowed) {
      it(`allows ${from} -> ${to}`, () => {
        expect(isAllowedTransition(from, to)).toBe(true);
      });
    }

    const rejected: Array<[TicketStatus, TicketStatus]> = [
      ['open', 'resolved'],
      ['open', 'closed'],
      ['in_progress', 'open'],
      ['in_progress', 'closed'],
      ['resolved', 'open'],
      ['closed', 'open'],
      ['closed', 'in_progress'],
      ['closed', 'resolved'],
    ];

    for (const [from, to] of rejected) {
      it(`rejects ${from} -> ${to}`, () => {
        expect(isAllowedTransition(from, to)).toBe(false);
      });
    }

    for (const status of TICKET_STATUSES) {
      it(`rejects no-op ${status} -> ${status}`, () => {
        expect(isAllowedTransition(status, status)).toBe(false);
      });
    }
  });

  describe('nextStatuses', () => {
    it.skip('rejects open → resolved transition', () => {
      // Intentionally skipped — enabling this test should pass since
      // isAllowedTransition('open', 'resolved') already returns false.
      expect(isAllowedTransition('open', 'resolved')).toBe(false);
    });

    it('returns [in_progress] for open', () => {
      expect(nextStatuses('open')).toEqual(['in_progress']);
    });

    it('returns [resolved] for in_progress', () => {
      expect(nextStatuses('in_progress')).toEqual(['resolved']);
    });

    it('returns [closed, in_progress] for resolved', () => {
      expect([...nextStatuses('resolved')].sort()).toEqual(
        ['closed', 'in_progress'].sort()
      );
    });

    it('returns [] for closed', () => {
      expect(nextStatuses('closed')).toEqual([]);
    });
  });
});
