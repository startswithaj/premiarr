import 'dotenv/config';
import { loadConfig } from './utils/config.js';
import { logger } from './utils/logger.js';
import { Premiarr } from './premiarr.js';

async function main(): Promise<void> {
  try {
    const config = loadConfig();
    const premiarr = new Premiarr(config);

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`\nReceived ${signal}, shutting down...`);
      await premiarr.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    await premiarr.start();
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
