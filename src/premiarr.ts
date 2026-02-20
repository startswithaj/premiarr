import cron from 'node-cron';
import { RottenTomatoesClient, RTMovie } from './clients/rottenTomatoes.js';
import { SeerrClient } from './clients/seerr.js';
import { TelegramBot, createTelegramBot } from './clients/telegram.js';
import { PremiarrDB } from './db/index.js';
import { hasBeenReleased } from './utils/dateUtils.js';
import { delay } from './utils/helpers.js';
import { logger } from './utils/logger.js';
import type { Config, PremierShow, RTTvShow } from './types/index.js';

export class Premiarr {
  private config: Config;
  private rtClient: RottenTomatoesClient;
  private seerrClient: SeerrClient;
  private telegramBot: TelegramBot;
  private db: PremiarrDB;
  private scheduledTasks: cron.ScheduledTask[] = [];

  constructor(config: Config) {
    this.config = config;
    this.rtClient = new RottenTomatoesClient();
    this.seerrClient = new SeerrClient(config.seerr.url, config.seerr.apiKey);
    this.telegramBot = createTelegramBot(
      config.telegram.botToken,
      config.telegram.chatId,
      config.telegram.topicId
    );
    this.db = new PremiarrDB(config.dbPath);

    // Set up DB lookup for reactions on old messages
    this.telegramBot.setShowLookup((messageId) => {
      const notified = this.db.getShowByMessageId(messageId);
      if (!notified) return null;
      // Convert NotifiedShow to PremierShow
      return {
        title: notified.title,
        rtUrl: notified.rt_url,
        mediaType: notified.media_type,
        certifiedFresh: false,
      };
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle heart reactions
    this.telegramBot.onHeartReaction(async (userId, username, show) => {
      logger.info(
        `Heart reaction from ${username || userId} for "${show.title}"`
      );
      await this.handleMediaRequest(show, username);
    });

    // Add command handlers
    this.telegramBot.onCommand('tonight', async () => {
      await this.sendNewTvTonight();
    });

    this.telegramBot.onCommand('movies', async () => {
      await this.sendNewMovies();
    });

    this.telegramBot.onCommand('stats', async (ctx) => {
      const stats = this.db.getNotificationCount();
      ctx.reply(
        `📊 Premiarr Stats\n\nTotal notifications: ${stats.total}\nMovies: ${stats.movies}\nTV Shows: ${stats.tv}`
      );
    });
  }

  /**
   * Filter TV shows to only those that have been released and we haven't notified about
   */
  private filterNewTvReleases(shows: RTTvShow[]): RTTvShow[] {
    logger.debug('--- Filtering TV Shows ---');
    return shows.filter((show) => {
      // Check if already released
      const released = hasBeenReleased(show.premiereDate);
      if (!released) {
        logger.debug(`[SKIP] "${show.title}" - not yet released (date: ${show.premiereDate || 'none'})`);
        return false;
      }

      // Check if we've already notified about this show
      if (this.db.hasNotified(show.url)) {
        logger.debug(`[SKIP] "${show.title}" - already notified`);
        return false;
      }

      logger.debug(`[KEEP] "${show.title}" - released (date: ${show.premiereDate})`);
      return true;
    });
  }

  /**
   * Filter movies to only those that have been released and we haven't notified about
   */
  private filterNewMovieReleases(movies: RTMovie[]): RTMovie[] {
    logger.debug('--- Filtering Movies ---');
    return movies.filter((movie) => {
      // Check if already released
      const released = hasBeenReleased(movie.releaseDate);
      if (!released) {
        logger.debug(`[SKIP] "${movie.title}" - not yet released (date: ${movie.releaseDate || 'none'})`);
        return false;
      }

      // Check if we've already notified about this movie
      if (this.db.hasNotified(movie.url)) {
        logger.debug(`[SKIP] "${movie.title}" - already notified`);
        return false;
      }

      logger.debug(`[KEEP] "${movie.title}" - released (date: ${movie.releaseDate})`);
      return true;
    });
  }

  /**
   * Map Rotten Tomatoes TV shows to PremierShow with Seerr data
   */
  private async enrichTvWithSeerrData(rtShows: RTTvShow[]): Promise<PremierShow[]> {
    const shows: PremierShow[] = [];

    for (const rtShow of rtShows) {
      const premierShow: PremierShow = {
        title: rtShow.title,
        rtUrl: rtShow.url,
        tomatoScore: rtShow.tomatoScore,
        audienceScore: rtShow.audienceScore,
        certifiedFresh: rtShow.certifiedFresh || false,
        posterUrl: rtShow.posterUrl,
        synopsis: rtShow.synopsis,
        network: rtShow.network,
        mediaType: 'tv',
        releaseDate: rtShow.premiereDate,
      };

      // Try to find the show in Seerr
      try {
        const seerrId = await this.seerrClient.findTvByTitle(rtShow.title);
        if (seerrId) {
          premierShow.seerrId = seerrId;
          premierShow.seerrStatus = await this.seerrClient.getTvMediaStatus(seerrId);

          // Get current season info and IMDB ID
          const details = await this.seerrClient.getTvDetails(seerrId);
          premierShow.currentSeason = details.numberOfSeasons;
          premierShow.imdbId = details.externalIds?.imdbId;
        }
      } catch (error) {
        logger.warn(`Could not find "${rtShow.title}" in Seerr:`, error);
        premierShow.seerrStatus = 'unavailable';
      }

      shows.push(premierShow);
    }

    return shows;
  }

  /**
   * Map Rotten Tomatoes movies to PremierShow with Seerr data
   */
  private async enrichMoviesWithSeerrData(rtMovies: RTMovie[]): Promise<PremierShow[]> {
    const shows: PremierShow[] = [];

    for (const rtMovie of rtMovies) {
      const premierShow: PremierShow = {
        title: rtMovie.title,
        rtUrl: rtMovie.url,
        tomatoScore: rtMovie.tomatoScore,
        audienceScore: rtMovie.audienceScore,
        certifiedFresh: rtMovie.certifiedFresh || false,
        posterUrl: rtMovie.posterUrl,
        mediaType: 'movie',
        releaseDate: rtMovie.releaseDate,
      };

      // Try to find the movie in Seerr
      try {
        const seerrId = await this.seerrClient.findMovieByTitle(rtMovie.title);
        if (seerrId) {
          premierShow.seerrId = seerrId;
          premierShow.seerrStatus = await this.seerrClient.getMovieMediaStatus(seerrId);

          // Get IMDB ID
          const details = await this.seerrClient.getMovieDetails(seerrId);
          premierShow.imdbId = details.externalIds?.imdbId;
        }
      } catch (error) {
        logger.warn(`Could not find "${rtMovie.title}" in Seerr:`, error);
        premierShow.seerrStatus = 'unavailable';
      }

      shows.push(premierShow);
    }

    return shows;
  }

  /**
   * Handle a media request from a heart reaction
   */
  private async handleMediaRequest(
    show: PremierShow,
    username: string | undefined
  ): Promise<void> {
    if (show.mediaType === 'movie') {
      await this.handleMovieRequest(show, username);
    } else {
      await this.handleTvRequest(show, username);
    }
  }

  /**
   * Handle a TV show request from a heart reaction
   */
  private async handleTvRequest(
    show: PremierShow,
    username: string | undefined
  ): Promise<void> {
    if (!show.seerrId) {
      // Try to find it again
      const seerrId = await this.seerrClient.findTvByTitle(show.title);
      if (!seerrId) {
        logger.error(`Could not find "${show.title}" in Seerr for request`);
        await this.telegramBot.sendError(`Could not find "${show.title}" in Jellyseerr`);
        return;
      }
      show.seerrId = seerrId;
    }

    // Check current status
    const status = await this.seerrClient.getTvMediaStatus(show.seerrId);

    if (status === 'available') {
      logger.debug(`"${show.title}" is already available`);
      await this.telegramBot.sendMessage(`✅ <b>${show.title}</b> is already available in your library!`);
      return;
    }

    if (status === 'requested' || status === 'pending') {
      logger.debug(`"${show.title}" is already requested/pending`);
      await this.telegramBot.sendMessage(`📥 <b>${show.title}</b> has already been requested`);
      return;
    }

    try {
      // Request the show (all seasons or latest season)
      const details = await this.seerrClient.getTvDetails(show.seerrId);
      logger.debug(`[REQUEST] TV Details for "${show.title}":`);
      logger.debug(`[REQUEST]   TMDB ID: ${show.seerrId}`);
      logger.debug(`[REQUEST]   Name: ${details.name}`);
      logger.debug(`[REQUEST]   Number of seasons: ${details.numberOfSeasons}`);
      logger.debug(`[REQUEST]   Seasons:`, details.seasons?.map(s => `S${s.seasonNumber}: ${s.name}`));

      const latestSeason = details.numberOfSeasons;
      logger.debug(`[REQUEST] Requesting season ${latestSeason} for "${show.title}"`);

      const response = await this.seerrClient.requestTv(show.seerrId, [latestSeason]);
      logger.debug(`[REQUEST] Response:`, JSON.stringify(response, null, 2));

      await this.telegramBot.sendRequestConfirmation(username, show.title);
      logger.info(`Requested "${show.title}" season ${latestSeason}`);
    } catch (error) {
      logger.error(`Failed to request "${show.title}":`, error);
      await this.telegramBot.sendError(`Failed to request "${show.title}" on Jellyseerr`);
    }
  }

  /**
   * Handle a movie request from a heart reaction
   */
  private async handleMovieRequest(
    show: PremierShow,
    username: string | undefined
  ): Promise<void> {
    logger.debug(`[REQUEST] Handling movie request for "${show.title}"`);

    if (!show.seerrId) {
      // Try to find it again
      logger.debug(`[REQUEST] No seerrId, searching for "${show.title}"...`);
      const seerrId = await this.seerrClient.findMovieByTitle(show.title);
      if (!seerrId) {
        logger.error(`Could not find "${show.title}" in Seerr`);
        await this.telegramBot.sendError(`Could not find "${show.title}" in Jellyseerr`);
        return;
      }
      logger.debug(`[REQUEST] Found TMDB ID: ${seerrId}`);
      show.seerrId = seerrId;
    }

    // Check current status
    logger.debug(`[REQUEST] Checking status for TMDB ID ${show.seerrId}...`);
    const status = await this.seerrClient.getMovieMediaStatus(show.seerrId);
    logger.debug(`[REQUEST] Current status: ${status}`);

    if (status === 'available') {
      logger.debug(`"${show.title}" is already available`);
      await this.telegramBot.sendMessage(`✅ <b>${show.title}</b> is already available in your library!`);
      return;
    }

    if (status === 'requested' || status === 'pending') {
      logger.debug(`"${show.title}" is already requested/pending`);
      await this.telegramBot.sendMessage(`📥 <b>${show.title}</b> has already been requested`);
      return;
    }

    try {
      logger.debug(`[REQUEST] Requesting movie "${show.title}" (TMDB: ${show.seerrId})...`);
      const response = await this.seerrClient.requestMovie(show.seerrId);
      logger.debug(`[REQUEST] Response:`, JSON.stringify(response, null, 2));
      await this.telegramBot.sendRequestConfirmation(username, show.title);
      logger.info(`Requested movie "${show.title}"`);
    } catch (error) {
      logger.error(`Failed to request "${show.title}":`, error);
      await this.telegramBot.sendError(`Failed to request "${show.title}" on Jellyseerr`);
    }
  }

  /**
   * Format today's date for section headers
   */
  private formatDateHeader(): string {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    };
    return today.toLocaleDateString(undefined, options);
  }

  /**
   * Send section header message
   */
  private async sendSectionHeader(section: 'MOVIES' | 'TV SHOWS'): Promise<void> {
    const date = this.formatDateHeader();
    const emoji = section === 'MOVIES' ? '🎥' : '📺';
    const header = [
      '╔══════════════════════╗',
      `   ${emoji} ${section}`,
      `   ${date}`,
      '╚══════════════════════╝'
    ].join('\n');
    await this.telegramBot.sendMessage(header);
  }

  /**
   * Send daily notifications - movies first, then TV shows
   */
  async sendDailyNotifications(): Promise<void> {
    // Send movies first, then TV shows
    // Headers are only sent if there are items to announce
    await this.sendNewMovies();
    await this.sendNewTvTonight();
  }

  /**
   * Fetch and send new TV shows premiering today/yesterday
   */
  async sendNewTvTonight(): Promise<number> {
    logger.info('Fetching new TV shows...');

    try {
      const rtShows = await this.rtClient.browseTvShowsWithFilter(this.config.rt.tvFilter);
      logger.info(`Found ${rtShows.length} shows from RT`);

      // Filter to only new releases we haven't notified about
      const newShows = this.filterNewTvReleases(rtShows);
      logger.info(`${newShows.length} are new releases we haven't notified about`);

      if (newShows.length === 0) {
        logger.info('No new shows to notify about');
        return 0;
      }

      const shows = await this.enrichTvWithSeerrData(newShows);

      // Send header before shows
      await this.sendSectionHeader('TV SHOWS');

      // Send messages and record notifications
      for (const show of shows) {
        const msg = await this.telegramBot.sendShowMessage(show);

        // Record in database
        this.db.recordNotification(
          show.rtUrl,
          show.title,
          'tv',
          show.currentSeason,
          msg.messageId
        );

        logger.info(`Sent notification for "${show.title}"`);

        // Small delay to avoid rate limiting
        await delay(500);
      }

      logger.info(`Sent ${shows.length} show announcements`);
      return shows.length;
    } catch (error) {
      logger.error('Error fetching new TV tonight:', error);
      return 0;
    }
  }

  /**
   * Fetch and send new movies
   */
  async sendNewMovies(): Promise<number> {
    logger.info('Fetching new movies...');

    try {
      const rtMovies = await this.rtClient.browseMoviesWithFilter(this.config.rt.movieFilter);
      logger.info(`Found ${rtMovies.length} movies from RT`);

      // Filter to only new releases we haven't notified about
      const newMovies = this.filterNewMovieReleases(rtMovies);
      logger.info(`${newMovies.length} are new releases we haven't notified about`);

      if (newMovies.length === 0) {
        logger.info('No new movies to notify about');
        return 0;
      }

      const movies = await this.enrichMoviesWithSeerrData(newMovies);

      // Send header before movies
      await this.sendSectionHeader('MOVIES');

      // Send messages and record notifications
      for (const movie of movies) {
        const msg = await this.telegramBot.sendShowMessage(movie);

        // Record in database
        this.db.recordNotification(
          movie.rtUrl,
          movie.title,
          'movie',
          undefined,
          msg.messageId
        );

        logger.info(`Sent notification for movie "${movie.title}"`);

        // Small delay to avoid rate limiting
        await delay(500);
      }

      logger.info(`Sent ${movies.length} movie announcements`);
      return movies.length;
    } catch (error) {
      logger.error('Error fetching new movies:', error);
      return 0;
    }
  }

  /**
   * Set up scheduled tasks
   */
  private setupSchedule(): void {
    // Daily new TV tonight
    const dailyTask = cron.schedule(
      this.config.schedule.dailyCron,
      () => {
        logger.debug('Running daily task...');
        this.sendDailyNotifications();
      }
    );
    this.scheduledTasks.push(dailyTask);
    logger.info(`Scheduled daily task: ${this.config.schedule.dailyCron}`);
  }

  /**
   * Run in daemon mode (long-running with scheduler)
   */
  async runDaemon(): Promise<void> {
    logger.info('Starting Premiarr in daemon mode...');

    this.setupSchedule();

    // Run on startup if configured
    if (this.config.runOnStartup) {
      logger.info('Running initial fetch on startup...');
      await this.sendDailyNotifications();
    }

    // Start the Telegram bot
    await this.telegramBot.start();
  }

  /**
   * Run in cron mode (single execution)
   */
  async runCron(): Promise<void> {
    logger.info('Running Premiarr in cron mode...');

    await this.sendDailyNotifications();

    logger.info('Cron execution complete');
  }

  /**
   * Perform startup health checks
   * - Rotten Tomatoes: Required, exit if fails
   * - Jellyseerr: Optional, warn if fails
   */
  private async performHealthChecks(): Promise<boolean> {
    logger.info('Performing startup health checks...');
    let allHealthy = true;

    // Check Rotten Tomatoes (required)
    logger.info('[Health] Checking Rotten Tomatoes connectivity...');
    try {
      const rtShows = await this.rtClient.browseTvShowsWithFilter('sort:newest', 1);
      if (rtShows && rtShows.length > 0) {
        logger.info(`[Health] ✓ Rotten Tomatoes OK (fetched ${rtShows.length} shows)`);
      } else {
        logger.error('[Health] ✗ Rotten Tomatoes returned no data');
        allHealthy = false;
      }
    } catch (error) {
      logger.error('[Health] ✗ Rotten Tomatoes check failed:', error);
      allHealthy = false;
    }

    // Check Jellyseerr (optional)
    if (this.config.seerr.url && this.config.seerr.apiKey) {
      logger.info('[Health] Checking Jellyseerr connectivity...');
      try {
        // Try a simple search to verify connectivity
        await this.seerrClient.search('test');
        logger.info('[Health] ✓ Jellyseerr OK');
      } catch (error) {
        logger.warn('[Health] ⚠ Jellyseerr check failed (requests will not work):', error);
        // Don't fail startup, just warn
      }
    } else {
      logger.info('[Health] ⚠ Jellyseerr not configured (requests disabled)');
    }

    return allHealthy;
  }

  /**
   * Start Premiarr based on configured run mode
   */
  async start(): Promise<void> {
    logger.info('='.repeat(50));
    logger.info('🎬 Premiarr - TV Premiere Notifications');
    logger.info('='.repeat(50));

    // Perform health checks before starting
    const healthy = await this.performHealthChecks();
    if (!healthy) {
      logger.error('Health checks failed. Exiting.');
      process.exit(1);
    }

    const stats = this.db.getNotificationCount();
    logger.info(`Database: ${stats.total} notifications (${stats.tv} TV, ${stats.movies} movies)`);

    if (this.config.runMode === 'daemon') {
      await this.runDaemon();
    } else {
      await this.runCron();
    }
  }

  /**
   * Stop Premiarr gracefully
   */
  async stop(): Promise<void> {
    logger.info('Stopping Premiarr...');

    // Stop scheduled tasks
    for (const task of this.scheduledTasks) {
      task.stop();
    }

    // Stop Telegram bot
    await this.telegramBot.stop();

    // Close database
    this.db.close();

    logger.info('Premiarr stopped');
  }
}
