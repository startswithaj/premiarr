import { Bot, Context } from 'grammy';
import type { PremierShow } from '../types/index.js';
import { delay } from '../utils/helpers.js';
import { createIPv4Fetch } from '../utils/ipv4Fetch.js';
import { logger } from '../utils/logger.js';
import { escapeHtml, formatShowMessage, isHeartEmoji } from '../utils/telegramFormatters.js';

// ============ Bot API Interface for Dependency Injection ============

export interface SendMessageOptions {
  parse_mode?: 'HTML' | 'Markdown';
  reply_to_message_id?: number;
  message_thread_id?: number;
  link_preview_options?: { is_disabled: boolean };
}

export interface SentMessage {
  message_id: number;
}

export interface ChatInfo {
  type: string;
  title?: string;
}

export interface ReactionEvent {
  message_id: number;
  new_reaction: Array<{ type: string; emoji: string }>;
  user?: { id: number; username?: string };
}

export interface BotApi {
  sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<SentMessage>;
  getChat(chatId: string): Promise<ChatInfo>;
  onReaction(handler: (event: ReactionEvent) => Promise<void>): void;
  onCommand(command: string, handler: (ctx: Context) => void | Promise<void>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Grammy bot wrapper that implements BotApi interface
 */
export class GrammyBotApi implements BotApi {
  private bot: Bot;

  constructor(token: string) {
    this.bot = new Bot(token, {
      client: {
        canUseWebhookReply: () => false,
        fetch: createIPv4Fetch(),
      },
    });
  }

  async sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<SentMessage> {
    return this.bot.api.sendMessage(chatId, text, options);
  }

  async getChat(chatId: string): Promise<ChatInfo> {
    const chat = await this.bot.api.getChat(chatId);
    return {
      type: chat.type,
      title: 'title' in chat ? chat.title : undefined,
    };
  }

  onReaction(handler: (event: ReactionEvent) => Promise<void>): void {
    this.bot.on('message_reaction', async (ctx) => {
      await handler({
        message_id: ctx.messageReaction.message_id,
        new_reaction: ctx.messageReaction.new_reaction.map(r => ({
          type: r.type,
          emoji: r.type === 'emoji' ? r.emoji : '',
        })),
        user: ctx.messageReaction.user ? {
          id: ctx.messageReaction.user.id,
          username: ctx.messageReaction.user.username,
        } : undefined,
      });
    });
  }

  onCommand(command: string, handler: (ctx: Context) => void | Promise<void>): void {
    this.bot.command(command, handler);
  }

  async start(): Promise<void> {
    await this.bot.start({
      allowed_updates: ['message', 'message_reaction', 'callback_query'],
      onStart: () => logger.info('Telegram bot is running and listening for reactions'),
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  getBot(): Bot {
    return this.bot;
  }
}

// ============ Main TelegramBot Class ============

export interface ShowMessage {
  messageId: number;
  show: PremierShow;
  chatId: string;
}

export type HeartReactionHandler = (
  userId: number,
  username: string | undefined,
  show: PremierShow
) => Promise<void>;

export type ShowLookupFn = (messageId: number) => PremierShow | null;

// Retry config
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export class TelegramBot {
  private bot: BotApi;
  private chatId: string;
  private topicId?: number;
  private messageShowMap: Map<number, PremierShow> = new Map();
  private heartReactionHandler?: HeartReactionHandler;
  private showLookupFn?: ShowLookupFn;

  constructor(bot: BotApi, chatId: string, topicId?: number) {
    this.bot = bot;
    this.chatId = chatId;
    this.topicId = topicId;
    this.setupHandlers();
    logger.info(`[TELEGRAM] Initialized bot for chat ${chatId}${topicId ? ` (topic ${topicId})` : ''}`);

    // Verify chat access on init
    this.bot.getChat(chatId).then(chat => {
      logger.info(`[TELEGRAM] Chat verified: ${chat.type} - "${chat.title || 'private'}"`)
    }).catch(err => {
      logger.error(`[TELEGRAM] Cannot access chat ${chatId}:`, err.message);
    });
  }

  /**
   * Build message options, only including message_thread_id if topicId is set
   */
  private getMessageOptions(extra: SendMessageOptions = {}): SendMessageOptions {
    const options: SendMessageOptions = { ...extra };
    if (this.topicId) {
      options.message_thread_id = this.topicId;
    }
    return options;
  }

  /**
   * Retry wrapper with exponential backoff for Telegram API calls
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error as Error;
        const errorMessage = lastError.message || String(error);

        // Check for rate limit (429)
        const retryAfterMatch = errorMessage.match(/retry after (\d+)/i);
        if (retryAfterMatch) {
          const retryAfterMs = parseInt(retryAfterMatch[1], 10) * 1000;
          logger.debug(`[TELEGRAM] Rate limited. Waiting ${retryAfterMs / 1000}s before retry...`);
          await delay(retryAfterMs + 1000); // Add 1s buffer
          continue;
        }

        // For other errors, use exponential backoff
        if (attempt < MAX_RETRIES) {
          const backoffDelayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.debug(`[TELEGRAM] ${operationName} failed (attempt ${attempt}/${MAX_RETRIES}): ${errorMessage}`);
          logger.debug(`[TELEGRAM] Retrying in ${backoffDelayMs / 1000}s...`);
          await delay(backoffDelayMs);
        }
      }
    }

    logger.error(`[TELEGRAM] ${operationName} failed after ${MAX_RETRIES} attempts`);
    throw lastError;
  }

  /**
   * Set a function to look up shows by message ID (for DB persistence)
   */
  setShowLookup(fn: ShowLookupFn): void {
    this.showLookupFn = fn;
  }

  private setupHandlers(): void {
    // Handle message reactions (heart emoji)
    this.bot.onReaction(async (event) => {
      const messageId = event.message_id;
      const newReactions = event.new_reaction;

      logger.debug(`[REACTION] Received reaction on message ${messageId}`);
      logger.debug(`[REACTION] Reactions:`, newReactions.map(r => r.type === 'emoji' ? r.emoji : r.type));

      // Try in-memory map first, then DB lookup
      let show = this.messageShowMap.get(messageId);
      if (!show && this.showLookupFn) {
        logger.debug(`[REACTION] Not in memory, checking DB...`);
        show = this.showLookupFn(messageId) ?? undefined;
      }

      if (!show) {
        logger.debug(`[REACTION] Message ${messageId} not found in memory or DB, ignoring`);
        return;
      }

      logger.debug(`[REACTION] Found show: "${show.title}"`);

      // Check if any new reaction is a heart
      const hasHeart = newReactions.some((r) => {
        if (r.type === 'emoji') {
          return isHeartEmoji(r.emoji);
        }
        return false;
      });

      logger.debug(`[REACTION] Is heart: ${hasHeart}, Show: "${show.title}"`);

      if (hasHeart && this.heartReactionHandler) {
        const userId = event.user?.id;
        const username = event.user?.username;

        logger.debug(`[REACTION] Processing heart from ${username || userId} for "${show.title}"`);

        if (userId) {
          await this.heartReactionHandler(userId, username, show);
        }
      }
    });

    // Simple command handlers
    this.bot.onCommand('start', (ctx) => {
      ctx.reply(
        '🎬 Premiarr Bot\n\n' +
          "I'll notify this group about new TV show premieres with Rotten Tomatoes scores.\n\n" +
          'React with ❤️ to any show to request it on Jellyseerr!\n\n' +
          'Commands:\n' +
          '/tonight - Show new TV premieres tonight\n' +
          '/movies - Show new movies at home'
      );
    });

    this.bot.onCommand('status', (ctx) => {
      ctx.reply('✅ Premiarr bot is running!');
    });
  }

  /**
   * Register a handler for heart reactions
   */
  onHeartReaction(handler: HeartReactionHandler): void {
    this.heartReactionHandler = handler;
  }

  /**
   * Register a command handler
   */
  onCommand(
    command: string,
    handler: (ctx: Context) => Promise<void>
  ): void {
    this.bot.onCommand(command, handler);
  }

  /**
   * Send a show announcement message
   */
  async sendShowMessage(show: PremierShow): Promise<ShowMessage> {
    const message = formatShowMessage(show);

    const sent = await this.withRetry(
      () => this.bot.sendMessage(this.chatId, message, this.getMessageOptions({
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: false },
      })),
      `sendShowMessage(${show.title})`
    );

    // Track this message for heart reactions
    this.messageShowMap.set(sent.message_id, show);
    logger.debug(`[TRACKING] Message ${sent.message_id} -> "${show.title}" (now tracking ${this.messageShowMap.size} messages)`);

    return {
      messageId: sent.message_id,
      show,
      chatId: this.chatId,
    };
  }

  /**
   * Send a confirmation message when a show is requested
   */
  async sendRequestConfirmation(
    username: string | undefined,
    showTitle: string,
    replyToMessageId?: number
  ): Promise<void> {
    const userDisplay = username ? `@${username}` : 'Someone';
    const message = `✅ ${userDisplay} requested <b>${escapeHtml(showTitle)}</b> on Jellyseerr!`;

    await this.withRetry(
      () => this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'HTML',
        reply_to_message_id: replyToMessageId,
        message_thread_id: this.topicId,
      }),
      'sendRequestConfirmation'
    );
  }

  /**
   * Send an error message
   */
  async sendError(error: string, replyToMessageId?: number): Promise<void> {
    await this.withRetry(
      () => this.bot.sendMessage(this.chatId, `❌ ${error}`, {
        reply_to_message_id: replyToMessageId,
        message_thread_id: this.topicId,
      }),
      'sendError'
    );
  }

  /**
   * Send a simple text message
   */
  async sendMessage(text: string): Promise<void> {
    await this.withRetry(
      () => this.bot.sendMessage(this.chatId, text, {
        parse_mode: 'HTML',
        message_thread_id: this.topicId,
      }),
      'sendMessage'
    );
  }

  /**
   * Start the bot (for long-running mode)
   */
  async start(): Promise<void> {
    logger.info('Starting Telegram bot...');
    logger.debug(`Tracking ${this.messageShowMap.size} messages for reactions`);
    await this.bot.start();
  }

  /**
   * Stop the bot gracefully
   */
  async stop(): Promise<void> {
    await this.bot.stop();
  }

  /**
   * Get the message-to-show map (for testing)
   */
  getMessageShowMap(): Map<number, PremierShow> {
    return this.messageShowMap;
  }
}

/**
 * Factory function to create a TelegramBot with the real Grammy implementation
 */
export function createTelegramBot(token: string, chatId: string, topicId?: number): TelegramBot {
  const botApi = new GrammyBotApi(token);
  return new TelegramBot(botApi, chatId, topicId);
}
