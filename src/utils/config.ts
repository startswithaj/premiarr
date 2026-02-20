import type { Config } from '../types/index.js';

export function loadConfig(): Config {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  };

  const optional = (name: string, defaultValue: string): string => {
    return process.env[name] || defaultValue;
  };

  const topicIdStr = process.env['TELEGRAM_TOPIC_ID'];
  const topicId = topicIdStr ? parseInt(topicIdStr, 10) : undefined;

  return {
    telegram: {
      botToken: required('TELEGRAM_BOT_TOKEN'),
      chatId: required('TELEGRAM_CHAT_ID'),
      topicId: topicId && !isNaN(topicId) ? topicId : undefined,
    },
    seerr: {
      url: required('SEERR_URL'),
      apiKey: required('SEERR_API_KEY'),
    },
    schedule: {
      dailyCron: optional('DAILY_CRON', '0 8 * * *'),
    },
    rt: {
      tvFilter: optional('RT_TV_FILTER', 'critics:fresh~sort:newest'),
      movieFilter: optional('RT_MOVIE_FILTER', 'critics:fresh~sort:newest'),
    },
    runMode: optional('RUN_MODE', 'daemon') as 'daemon' | 'cron',
    runOnStartup: optional('RUN_ON_STARTUP', 'false') === 'true',
    dbPath: optional('DB_PATH', './data/premiarr.db'),
  };
}
