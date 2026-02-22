import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hasBeenReleased } from '../../src/utils/dateUtils.js';

describe('dateUtils', () => {
  describe('hasBeenReleased', () => {
    beforeEach(() => {
      // Mock current date to Feb 21, 2026
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-21T12:00:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns false for undefined input', () => {
      expect(hasBeenReleased(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(hasBeenReleased('')).toBe(false);
    });

    it('returns true for past date with "Latest Episode:" prefix', () => {
      expect(hasBeenReleased('Latest Episode: Feb 19')).toBe(true);
    });

    it('returns true for today with "Latest Episode:" prefix', () => {
      expect(hasBeenReleased('Latest Episode: Feb 21')).toBe(true);
    });

    it('returns false for future date with "Latest Episode:" prefix', () => {
      expect(hasBeenReleased('Latest Episode: Feb 25')).toBe(false);
    });

    it('returns true for past date with "Opened" prefix', () => {
      expect(hasBeenReleased('Opened Feb 20, 2026')).toBe(true);
    });

    it('returns true for past date with "Streaming" prefix', () => {
      expect(hasBeenReleased('Streaming Jan 15, 2026')).toBe(true);
    });

    it('returns true for past date with "Premieres" prefix', () => {
      expect(hasBeenReleased('Premieres Feb 1')).toBe(true);
    });

    it('returns true for past date with "Premiere" prefix (singular)', () => {
      expect(hasBeenReleased('Premiere Feb 1')).toBe(true);
    });

    it('returns true for past date with "Re-released" prefix', () => {
      expect(hasBeenReleased('Re-released Jan 10')).toBe(true);
    });

    it('returns false for future date', () => {
      expect(hasBeenReleased('Mar 15, 2026')).toBe(false);
    });

    it('handles date with full year', () => {
      expect(hasBeenReleased('Jan 1, 2026')).toBe(true);
      expect(hasBeenReleased('Dec 31, 2026')).toBe(false);
    });

    it('returns false for completely unparseable date', () => {
      // Note: JavaScript Date is very permissive, most strings parse to something
      expect(hasBeenReleased('xyz123!@#')).toBe(false);
    });

    it('handles case insensitive prefixes', () => {
      expect(hasBeenReleased('LATEST EPISODE: Feb 19')).toBe(true);
      expect(hasBeenReleased('opened Feb 20, 2026')).toBe(true);
      expect(hasBeenReleased('STREAMING Jan 15')).toBe(true);
    });
  });
});
