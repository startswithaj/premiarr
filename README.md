<p align="center">
  <img src="assets/logo.png" alt="Premiarr Logo" width="128" /><br/>
  <img src="assets/workmark.png" alt="Premiarr" width="200" />
</p>

<p align="center">
  A Telegram bot that announces new TV show premieres and movies at home (streaming) from Rotten Tomatoes, with integration to Jellyseerr for easy media requests.
</p>

## Features

- Fetches fresh TV shows and movies at home (streaming) from Rotten Tomatoes
- Sends formatted notifications to Telegram with RT scores and links
- Displays IMDB links when available
- Heart react to any announcement to request it on Jellyseerr
- Tracks notifications to prevent duplicates across restarts
- Configurable daily schedule
- Supports Telegram forum/topic groups

## How It Works

1. **Scheduled Fetching**: At configured times, Premiarr fetches the latest fresh-rated content from Rotten Tomatoes
2. **Filtering**: Shows and movies are filtered to only include released content that hasn't been announced before
3. **Enrichment**: Each item is looked up in Jellyseerr to get availability status and IMDB links
4. **Notification**: Formatted messages are sent to your Telegram chat with scores, links, and status
5. **Requesting**: Users can react with a heart emoji to automatically request the content on Jellyseerr

## Project Structure

```
src/
├── index.ts                 # Entry point
├── premiarr.ts              # Core orchestrator
├── clients/
│   ├── rottenTomatoes.ts    # RT API client
│   ├── seerr.ts             # Jellyseerr API client
│   └── telegram.ts          # Telegram bot client
├── db/
│   └── index.ts             # SQLite database layer
├── types/
│   └── index.ts             # TypeScript types
└── utils/
    ├── config.ts            # Environment config loader
    ├── dateUtils.ts         # Date parsing utilities
    ├── helpers.ts           # Shared helper functions
    ├── ipv4Fetch.ts         # IPv4-forced fetch for Telegram API
    ├── logger.ts            # Configurable logging
    └── telegramFormatters.ts # Message formatting utilities
```

## Configuration

Copy `.env.example` to `.env` and configure:

### Required

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Target chat/group ID |
| `SEERR_URL` | Jellyseerr instance URL |
| `SEERR_API_KEY` | Jellyseerr API key |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_TOPIC_ID` | - | Topic ID for forum groups |
| `DAILY_CRON` | `0 8 * * *` | Cron expression for daily announcements |
| `RT_TV_FILTER` | `critics:fresh~sort:newest` | Rotten Tomatoes TV filter |
| `RT_MOVIE_FILTER` | `critics:fresh~sort:newest` | Rotten Tomatoes movie filter |
| `RUN_MODE` | `daemon` | `daemon` for long-running, `cron` for single execution |
| `RUN_ON_STARTUP` | `false` | Run fetch immediately on startup |
| `DB_PATH` | `./data/premiarr.db` | SQLite database path |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |

### RT Filter Options

Filters can be combined with `~`:
- `critics:fresh`, `critics:rotten`
- `audience:upright`, `audience:spilled`
- `sort:newest`, `sort:popular`

Example: `critics:fresh~audience:upright~sort:newest`

## Running Locally

### Prerequisites

- Node.js 20+
- npm

### Development

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your values

# Run in development mode (hot reload)
npm run dev
```

### Production

```bash
# Build
npm run build

# Run
npm start
```

## Docker

### Build

```bash
docker build -t premiarr .
```

### Run

```bash
docker run -d \
  --name premiarr \
  --env-file .env \
  -v premiarr-data:/app/data \
  premiarr
```

### Docker Compose

```bash
docker-compose up -d
```

The `docker-compose.yml` file is configured with all environment variables and a named volume for persistent data.

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Show welcome message |
| `/status` | Check bot status |
| `/tonight` | Manually trigger TV show fetch |
| `/movies` | Manually trigger movies at home fetch |
| `/stats` | Show notification statistics |

## Message Format

Each announcement includes:
- Title with IMDB and RT links
- Media type (Movie/TV Show)
- Release date with today/yesterday indicator
- Tomatometer and audience scores
- Certified Fresh badge (if applicable)
- Network/streaming service
- Jellyseerr availability status
- Synopsis excerpt

React with a heart emoji to request the content on Jellyseerr.

## Database

Premiarr uses SQLite to track:
- Notified shows (prevents duplicate announcements)
- Message IDs (enables reaction handling across restarts)

The database is stored at the path configured by `DB_PATH`.

## Health Checks

On startup, Premiarr verifies:
1. **Rotten Tomatoes**: Required - exits if unreachable
2. **Jellyseerr**: Optional - warns if unreachable but continues

## License

MIT
