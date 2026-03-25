# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouTube beat content automation platform. Generates instrumental music (Suno API), creates visualizer videos (Kling AI), assembles with FFmpeg, and uploads to YouTube on a daily schedule. Two channels: **ChillBeats4Me** (lofi, 30-min mixes) and **Trap Beats INC** (trap, 5-min beats).

Daily target: 1 lofi + 1 trap beat per day, using "nano banana" Kling visual themes.

## Quick Commands

```bash
# Development
npm run dev                    # Start frontend + backend (http://localhost:5000)
npm run build                  # Vite frontend + esbuild backend → dist/
npm run start                  # Run production build
npm run check                  # TypeScript type checking
npm run lint                   # ESLint
npm run format                 # Prettier

# Database
npm run db:push                # Sync schema changes to PostgreSQL

# Job Management
npm run jobs:check-failed      # Diagnose failed jobs
npm run jobs:fix-broken        # Attempt auto-fix
npm run jobs:check-recent      # List recent jobs
npm run jobs:reset-failed      # Reset failed jobs to retry

# Content Generation
npx tsx gen-daily.ts           # Generate 1 lofi + 1 trap (dedupes if already run today)
npx tsx schedule-uploads.ts    # Upload completed jobs to YouTube, scheduled 1/day/channel
npm run generate:daily-beats   # Generate daily beat content (alternate method)

# Ad-hoc scripts
npx tsx <script-name>.ts       # Run any root-level script

# Python Audio Analysis
cd scripts && python -m beat_analyzer.cli <audio_file> --pretty
```

## Architecture

**Stack**: React 18 + TypeScript + Vite + Express + PostgreSQL (local, Drizzle ORM) + FFmpeg + Python (Librosa)

**Single-port dev server**: Vite runs as Express middleware in dev mode (`server/index-dev.ts`). Port defaults to `5000` via `PORT` env var. Vite config also proxies `/api` to `localhost:5000`.

### Key Patterns

- **Singleton Services**: All services use `getInstance()` + exported instance (`export const myService = MyService.getInstance()`)
- **Shared Schema**: `shared/schema.ts` is the single source of truth for DB types, imported by both client and server
- **Path Aliases**: `@/*` → `client/src/*`, `@shared/*` → `shared/*`, `@assets/*` → `attached_assets/*` (Vite only). Server always uses relative paths.
- **Auth is bypassed**: `AuthGuard` always renders children, `GuestGuard` always redirects to `/app`. Stripe uses a dummy key. Google OAuth logs a warning instead of crashing when unconfigured.

### Background Schedulers (started in app.ts)

9 schedulers auto-start on boot: Suno task resumption, Scheduled Uploads, Agent Scheduler, Video Scheduler, Beat Scheduler, Error Cleanup, Analytics Polling (2 AM daily), Health Check, Pipeline Orchestrator. Discord watchdog runs as a separate process (`server-watchdog.ts`).

**Beat Scheduler** (`server/services/beat-scheduler.ts`): Called by pipeline orchestrator at 7:50 PM PT (lofi) and 8:50 PM PT (trap). Use `beatScheduler.generateLofi()` / `beatScheduler.generateTrap(title)` directly — NOT the `/api/beats/generate` HTTP endpoint (requires auth).

## Two Pipelines

### Pipeline A: Unity/Kling (Narrative Videos)
Goal → Research → Lyrics → Music (Suno) → Audio Analysis → Video Prompts → Kling Generation → FFmpeg Assembly → YouTube Upload
- Time: 30-65 min | Cost: $1.50-$3.00

### Pipeline B: Music/Beats (Instrumental Content) — PRIMARY
Beat Params → Style Selection → Music Gen (Suno) → Audio Analysis → Loop Visual (Kling) → FFmpeg Assembly → Upload
- Lofi: 30-min mix, 1 loop clip repeated ~360x. Cost: ~$0.45
- Trap: 3-5 min beat. Cost: ~$0.05-$0.12

## YouTube Channel Setup

Two channels connected via OAuth (`data/youtube_connected_channels.json`):
- **ChillBeats4Me** (`UCLROBoF3NsVmScg6IvBHa_w`) — lofi beats
- **Trap Beats INC** (`UChC4Y80hS5HG1g9IqoG-TxA`) — trap beats

OAuth uses a single redirect URI: `/api/youtube/callback`. Multi-channel auth passes channel type via the `state` parameter. Auth URLs: `/api/youtube/multi/auth-url/chillbeats` and `/api/youtube/multi/auth-url/trapbeats`.

**Upload scheduling**: When uploading, check what's already scheduled on the channel and slot the next video after the last scheduled date (always maintain a backlog).

## Core Services (server/services/)

**Content Pipeline**: `job-worker.ts` (main orchestrator), `suno-api.ts`, `kling-video-generator.ts`, `ffmpeg-processor.ts`, `music-mode-generator.ts`, `beat-scheduler.ts`

**YouTube**: `youtube-multi-channel-service.ts`, `youtube-upload-service.ts`, `youtube-oauth-simple.ts`, `youtube-metadata-generator.ts`, `youtube-channel-bandit.ts` (Thompson Sampling)

**Audio**: `audio-analysis-service.ts` (Librosa via child_process), `looping-section-service.ts`, `semantic-audio-service.ts`

**Error/Self-Fix**: `error-monitor.ts`, `multi-model-error-analyzer.ts` (parallel GPT+Gemini+Claude), `auto-fix-agent.ts`

**Cost**: `api-cost-tracker.ts`, `dynamic-model-router.ts` (Thompson Sampling for model selection), `cost-guard.ts`

## Suno Duration Control

Suno API has no direct `duration` parameter. Use structure-based control: pass `generateInstrumentalStructure()` output as lyrics with `instrumental: false`. Validate actual duration after generation. Recycle taskIds on retry to save credits. See `suno-api.ts`.

## FFmpeg Patterns

- Always use `-y` flag, `-loglevel error`, absolute paths
- Hardware encoding auto-detected (NVIDIA NVENC > Intel QSV > CPU ultrafast)
- Concurrency limited via ConcurrencyLimiter in `looping-section-service.ts`
- Temp files: `/tmp/unity-scratch/`, audio cache: `/tmp/audio-analysis-cache/`

## Data & Storage

- `data/` directory contains videos, thumbnails, cache, YouTube credentials
- `data/videos/renders/` is symlinked to `/mnt/d/unity-data/videos/renders` (SSD)
- Video files are large (5-200MB per beat) — keep on D: drive, not WSL root
- WSL root disk is limited (~112GB) — monitor with `df -h /`

## Environment & Secrets

`.env` file in project root with: `DATABASE_URL`, `SUNO_API_KEY`, `KLING_ACCESS_KEY`, `KLING_SECRET_KEY`, `GEMINI_API_KEY`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`, `YOUTUBE_REFRESH_TOKEN`, and others.

`server/secret-manager-loader.ts` tries GCP Secret Manager first, falls back to `.env`. GCP project: `unity-ai-1766877776`.

## Database

**Drizzle ORM** with local PostgreSQL (`unity_db`). Schema at `shared/schema.ts` (~4500 lines). Connection pool: max 20.

**Core Tables**: `jobs` (queued→processing→completed/failed), `unityContentPackages`, `youtubeAnalytics`, `youtubeChannels`, `errorReports`, `apiUsage`.

```bash
npm run db:push              # Sync schema to database
npx drizzle-kit studio       # Visual DB inspector
```

## ESLint/Prettier

- `@typescript-eslint/no-explicit-any` is **off** (any is allowed)
- Unused vars are warnings only (prefix with `_` to suppress)
- Prettier enforced via ESLint

## Known Limitations

- `server/routes.ts` is monolithic (~20K lines) — needs splitting
- ~400+ root-level .ts scripts (ad-hoc tests, one-offs)
- No unit test framework — relies on integration scripts
- Auth middleware blocks most `/api/youtube/upload*` and `/api/beats/generate*` routes — use direct service calls instead
- Kling API rate limits: 60-180s per clip generation
- Gemini API has spending caps — check before relying on it
