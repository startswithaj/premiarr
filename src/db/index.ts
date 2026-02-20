import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface NotifiedShow {
  id: number;
  rt_url: string;
  title: string;
  media_type: 'movie' | 'tv';
  season_number?: number;
  message_id?: number;
  notified_at: string;
}

export class PremiarrDB {
  private db: Database.Database;

  constructor(dbPath: string = './data/premiarr.db') {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init(): void {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notified_shows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rt_url TEXT NOT NULL,
        title TEXT NOT NULL,
        media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),
        season_number INTEGER,
        message_id INTEGER,
        notified_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(rt_url, season_number)
      );

      CREATE INDEX IF NOT EXISTS idx_rt_url ON notified_shows(rt_url);
      CREATE INDEX IF NOT EXISTS idx_notified_at ON notified_shows(notified_at);
    `);
  }

  /**
   * Check if we've already notified about a show/movie
   * If seasonNumber is provided, checks for that specific season
   * Otherwise, checks if we've ever notified about this URL
   */
  hasNotified(rtUrl: string, seasonNumber?: number): boolean {
    if (seasonNumber !== undefined) {
      // Check for specific season
      const stmt = this.db.prepare(`
        SELECT 1 FROM notified_shows
        WHERE rt_url = ? AND season_number = ?
        LIMIT 1
      `);
      return stmt.get(rtUrl, seasonNumber) !== undefined;
    } else {
      // Check if we've ever notified about this URL (any season)
      const stmt = this.db.prepare(`
        SELECT 1 FROM notified_shows
        WHERE rt_url = ?
        LIMIT 1
      `);
      return stmt.get(rtUrl) !== undefined;
    }
  }

  /**
   * Get the highest season number we've notified about for a TV show
   */
  getHighestNotifiedSeason(rtUrl: string): number | null {
    const stmt = this.db.prepare(`
      SELECT MAX(season_number) as max_season FROM notified_shows
      WHERE rt_url = ? AND media_type = 'tv'
    `);
    const result = stmt.get(rtUrl) as { max_season: number | null } | undefined;
    return result?.max_season ?? null;
  }

  /**
   * Record that we've notified about a show/movie
   */
  recordNotification(
    rtUrl: string,
    title: string,
    mediaType: 'movie' | 'tv',
    seasonNumber?: number,
    messageId?: number
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO notified_shows (rt_url, title, media_type, season_number, message_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(rtUrl, title, mediaType, seasonNumber ?? null, messageId ?? null);
  }

  /**
   * Get recent notifications (for debugging/stats)
   */
  getRecentNotifications(limit: number = 20): NotifiedShow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM notified_shows
      ORDER BY notified_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as NotifiedShow[];
  }

  /**
   * Get show by message ID (for reaction handling)
   */
  getShowByMessageId(messageId: number): NotifiedShow | null {
    const stmt = this.db.prepare(`
      SELECT * FROM notified_shows
      WHERE message_id = ?
      LIMIT 1
    `);
    return (stmt.get(messageId) as NotifiedShow) ?? null;
  }

  /**
   * Get all tracked messages with their show data (for loading on startup)
   */
  getTrackedMessages(): Map<number, NotifiedShow> {
    const stmt = this.db.prepare(`
      SELECT * FROM notified_shows
      WHERE message_id IS NOT NULL
    `);
    const rows = stmt.all() as NotifiedShow[];
    const map = new Map<number, NotifiedShow>();
    for (const row of rows) {
      if (row.message_id) {
        map.set(row.message_id, row);
      }
    }
    return map;
  }

  /**
   * Get count of notifications
   */
  getNotificationCount(): { total: number; movies: number; tv: number } {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM notified_shows').get() as {
        count: number;
      }
    ).count;
    const movies = (
      this.db
        .prepare("SELECT COUNT(*) as count FROM notified_shows WHERE media_type = 'movie'")
        .get() as { count: number }
    ).count;
    const tv = (
      this.db
        .prepare("SELECT COUNT(*) as count FROM notified_shows WHERE media_type = 'tv'")
        .get() as { count: number }
    ).count;

    return { total, movies, tv };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
