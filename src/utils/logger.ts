type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: number;

  constructor() {
    const envLevel = (process.env['LOG_LEVEL'] || 'info').toLowerCase() as LogLevel;
    this.level = LOG_LEVELS[envLevel] ?? LOG_LEVELS.info;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.level;
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(...args);
    }
  }
}

export const logger = new Logger();
