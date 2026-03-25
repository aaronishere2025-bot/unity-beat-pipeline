# Unity Beat Pipeline

Built by Aaron Wilkins

AI-powered YouTube beat generation and upload pipeline with Thompson Sampling optimization. Currently operating across multiple YouTube channels with daily automated uploads.

Automatically generates instrumental music, creates visualizer videos, and uploads to YouTube — learning what works best over time.

## What It Does

- **Music Generation** — Creates instrumental beats via Suno AI (lofi, trap, and more)
- **Visual Generation** — Generates matching background visuals via Gemini AI
- **Video Assembly** — FFmpeg assembles audio + visuals into YouTube-ready videos
- **Smart Uploads** — Uploads to YouTube with optimized titles, descriptions, and tags
- **Thompson Sampling** — Multi-armed bandit learns which styles perform best based on YouTube analytics

## How Thompson Sampling Works

The pipeline uses a multi-armed bandit (Thompson Sampling) to optimize content over time:

1. **Multiple style "arms"** — each represents a different music style configuration
2. **Beta distribution sampling** — explores new styles while exploiting known winners
3. **YouTube feedback loop** — analytics (views, CTR, retention) feed back into the bandit
4. **Automatic optimization** — over time, the system converges on what your audience likes

```
Beat generation triggered
  -> Bandit selects style (Thompson Sampling)
  -> Suno generates music
  -> Gemini creates matching visual
  -> FFmpeg assembles video
  -> YouTube upload with optimized metadata
  -> Analytics feed back to bandit
  -> Next generation is smarter
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Express + PostgreSQL (Drizzle ORM)
- **Music**: Suno API
- **Visuals**: Gemini AI (image generation + Ken Burns effect)
- **Video**: FFmpeg (hardware-accelerated encoding)
- **Upload**: YouTube Data API v3

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Fill in your API keys (Suno, Gemini, YouTube OAuth)

# Set up database
npm run db:push

# Start development server
npm run dev

# Generate a beat
npx tsx gen-daily.ts
```

## Environment Variables

See `.env.example` for required variables:

- `DATABASE_URL` — PostgreSQL connection string
- `SUNO_API_KEY` — Suno AI API key for music generation
- `GEMINI_API_KEY` — Google Gemini API key for visual generation
- `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` — YouTube OAuth credentials
- `YOUTUBE_REDIRECT_URI` — OAuth redirect URI

## Architecture

```
Pipeline
  ┌───────────┐   ┌──────────┐   ┌──────────┐
  │ Thompson  │ → │  Suno    │ → │  Gemini  │
  │ Sampling  │   │  Music   │   │  Visual  │
  └───────────┘   └──────────┘   └──────────┘
       ^                              |
       |          ┌──────────┐        |
       |          │  FFmpeg  │ <------+
       |          │ Assembly │
       |          └──────────┘
       |               |
       |          ┌──────────┐
       +----------│ YouTube  │
        analytics │  Upload  │
                  └──────────┘
```

## Daily Schedule

The pipeline runs on a configurable daily schedule, generating and uploading beats automatically. Schedule times are configurable via the pipeline orchestrator.

## Cost Per Video

| Type | Music | Visual | Total |
|------|-------|--------|-------|
| Lofi (30 min) | ~$0.40 | ~$0.05 | ~$0.45 |
| Trap (5 min) | ~$0.05 | ~$0.02 | ~$0.07 |

## Key Services

| Service | Purpose |
|---------|---------|
| `beat-scheduler.ts` | Daily beat generation scheduling |
| `suno-style-bandit.ts` | Thompson Sampling style optimization |
| `suno-api.ts` | Suno AI music generation |
| `music-mode-generator.ts` | End-to-end beat video pipeline |
| `ffmpeg-processor.ts` | Video assembly and encoding |
| `youtube-upload-service.ts` | YouTube upload with metadata |
| `youtube-metadata-generator.ts` | Title/description/tag generation |
| `analytics-polling-scheduler.ts` | YouTube analytics feedback loop |

## License

MIT
