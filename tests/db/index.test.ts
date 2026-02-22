import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PremiarrDB } from '../../src/db/index.js';
import fs from 'fs';
import path from 'path';

describe('PremiarrDB', () => {
  const testDbPath = './test-data/test-premiarr.db';
  let db: PremiarrDB;

  beforeEach(() => {
    // Ensure test directory exists
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Remove existing test db
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    db = new PremiarrDB(testDbPath);
  });

  afterEach(() => {
    db.close();
    // Cleanup
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    const walPath = testDbPath + '-wal';
    const shmPath = testDbPath + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  });

  describe('hasNotified', () => {
    it('returns false for unknown URL', () => {
      expect(db.hasNotified('https://rottentomatoes.com/tv/unknown')).toBe(false);
    });

    it('returns true after recording notification', () => {
      const url = 'https://rottentomatoes.com/tv/test_show';
      db.recordNotification(url, 'Test Show', 'tv');
      expect(db.hasNotified(url)).toBe(true);
    });

    it('checks specific season when provided', () => {
      const url = 'https://rottentomatoes.com/tv/test_show';
      db.recordNotification(url, 'Test Show', 'tv', 1);

      expect(db.hasNotified(url, 1)).toBe(true);
      expect(db.hasNotified(url, 2)).toBe(false);
      expect(db.hasNotified(url)).toBe(true); // Any season
    });
  });

  describe('recordNotification', () => {
    it('records a TV show notification', () => {
      const url = 'https://rottentomatoes.com/tv/test_show';
      db.recordNotification(url, 'Test Show', 'tv', 1, 12345);

      const recent = db.getRecentNotifications(1);
      expect(recent).toHaveLength(1);
      expect(recent[0].rt_url).toBe(url);
      expect(recent[0].title).toBe('Test Show');
      expect(recent[0].media_type).toBe('tv');
      expect(recent[0].season_number).toBe(1);
      expect(recent[0].message_id).toBe(12345);
    });

    it('records a movie notification', () => {
      const url = 'https://rottentomatoes.com/m/test_movie';
      db.recordNotification(url, 'Test Movie', 'movie', undefined, 67890);

      const recent = db.getRecentNotifications(1);
      expect(recent).toHaveLength(1);
      expect(recent[0].media_type).toBe('movie');
      expect(recent[0].season_number).toBeNull();
    });

    it('ignores duplicate notifications (same URL and season)', () => {
      const url = 'https://rottentomatoes.com/tv/test_show';
      db.recordNotification(url, 'Test Show', 'tv', 1);
      db.recordNotification(url, 'Test Show', 'tv', 1); // Duplicate

      const count = db.getNotificationCount();
      expect(count.total).toBe(1);
    });

    it('allows same URL with different seasons', () => {
      const url = 'https://rottentomatoes.com/tv/test_show';
      db.recordNotification(url, 'Test Show', 'tv', 1);
      db.recordNotification(url, 'Test Show', 'tv', 2);

      const count = db.getNotificationCount();
      expect(count.total).toBe(2);
    });
  });

  describe('getHighestNotifiedSeason', () => {
    it('returns null for unknown show', () => {
      expect(db.getHighestNotifiedSeason('https://unknown')).toBeNull();
    });

    it('returns highest season number', () => {
      const url = 'https://rottentomatoes.com/tv/test_show';
      db.recordNotification(url, 'Test Show', 'tv', 1);
      db.recordNotification(url, 'Test Show', 'tv', 3);
      db.recordNotification(url, 'Test Show', 'tv', 2);

      expect(db.getHighestNotifiedSeason(url)).toBe(3);
    });

    it('returns null for movies', () => {
      const url = 'https://rottentomatoes.com/m/test_movie';
      db.recordNotification(url, 'Test Movie', 'movie');

      expect(db.getHighestNotifiedSeason(url)).toBeNull();
    });
  });

  describe('getShowByMessageId', () => {
    it('returns null for unknown message ID', () => {
      expect(db.getShowByMessageId(99999)).toBeNull();
    });

    it('returns show for known message ID', () => {
      const url = 'https://rottentomatoes.com/tv/test_show';
      db.recordNotification(url, 'Test Show', 'tv', 1, 12345);

      const show = db.getShowByMessageId(12345);
      expect(show).not.toBeNull();
      expect(show!.title).toBe('Test Show');
      expect(show!.rt_url).toBe(url);
    });
  });

  describe('getTrackedMessages', () => {
    it('returns empty map when no messages', () => {
      const map = db.getTrackedMessages();
      expect(map.size).toBe(0);
    });

    it('returns map of message IDs to shows', () => {
      db.recordNotification('https://rt.com/tv/show1', 'Show 1', 'tv', 1, 111);
      db.recordNotification('https://rt.com/tv/show2', 'Show 2', 'tv', 1, 222);
      db.recordNotification('https://rt.com/m/movie1', 'Movie 1', 'movie', undefined, 333);

      const map = db.getTrackedMessages();
      expect(map.size).toBe(3);
      expect(map.get(111)?.title).toBe('Show 1');
      expect(map.get(222)?.title).toBe('Show 2');
      expect(map.get(333)?.title).toBe('Movie 1');
    });

    it('excludes shows without message IDs', () => {
      db.recordNotification('https://rt.com/tv/show1', 'Show 1', 'tv', 1, 111);
      db.recordNotification('https://rt.com/tv/show2', 'Show 2', 'tv', 1); // No message ID

      const map = db.getTrackedMessages();
      expect(map.size).toBe(1);
    });
  });

  describe('getNotificationCount', () => {
    it('returns zero counts for empty database', () => {
      const count = db.getNotificationCount();
      expect(count.total).toBe(0);
      expect(count.movies).toBe(0);
      expect(count.tv).toBe(0);
    });

    it('counts movies and TV separately', () => {
      db.recordNotification('https://rt.com/tv/show1', 'Show 1', 'tv');
      db.recordNotification('https://rt.com/tv/show2', 'Show 2', 'tv');
      db.recordNotification('https://rt.com/m/movie1', 'Movie 1', 'movie');

      const count = db.getNotificationCount();
      expect(count.total).toBe(3);
      expect(count.movies).toBe(1);
      expect(count.tv).toBe(2);
    });
  });

  describe('getRecentNotifications', () => {
    it('returns empty array for empty database', () => {
      expect(db.getRecentNotifications()).toEqual([]);
    });

    it('returns notifications in reverse chronological order', () => {
      db.recordNotification('https://rt.com/tv/show1', 'Show 1', 'tv');
      db.recordNotification('https://rt.com/tv/show2', 'Show 2', 'tv');
      db.recordNotification('https://rt.com/tv/show3', 'Show 3', 'tv');

      const recent = db.getRecentNotifications(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].title).toBe('Show 3');
      expect(recent[1].title).toBe('Show 2');
    });
  });
});
