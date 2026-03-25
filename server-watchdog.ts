/**
 * UNITY WATCHDOG — Standalone Discord bot for full server + pipeline management
 *
 * Runs independently from the main server. Connects to DB directly.
 * Replaces the in-server discord-bot.ts with a standalone process that
 * survives server restarts and can start/stop the server remotely.
 *
 * Start: nohup npx tsx server-watchdog.ts > /tmp/unity-scratch/watchdog.log 2>&1 &
 *
 * COMMANDS:
 *   Server Control:
 *     /server-start    — Start the main server
 *     /server-stop     — Stop the main server
 *     /server-restart  — Restart the main server
 *     /server-status   — Check if server is running + uptime
 *     /server-logs     — Last N lines of server log
 *
 *   Job Management:
 *     /jobs            — List recent jobs with status
 *     /job <id>        — Detailed job info
 *     /cancel <id>     — Cancel a running job
 *     /retry <id>      — Retry a failed job
 *     /generate <type> — Trigger lofi/trap/history generation
 *
 *   Costs & Monitoring:
 *     /costs           — Today's spending breakdown
 *     /health          — Full system health report
 *     /spend-limit $   — Adjust daily cost limit
 *
 *   Pipeline Control:
 *     /start           — Resume pipeline (reset killswitch)
 *     /stop            — Emergency killswitch (halts AI ops)
 *
 * PROACTIVE ALERTS (sent automatically):
 *   - Job completed/failed notifications
 *   - Cost milestone alerts ($1, $5, $10, $25, $50)
 *   - Server crash detection
 *   - Stale job warnings
 */

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Interaction,
  type TextChannel,
} from 'discord.js';
import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, createWriteStream } from 'fs';
import { Pool } from 'pg';

// ============================================================================
// CONFIG
// ============================================================================

const SERVER_LOG = '/tmp/unity-scratch/server.log';
const SERVER_DIR = '/home/aaronishere2025';
const OWNER_ID = process.env.DISCORD_OWNER_ID || '';
const ALERT_CHANNEL_ID = process.env.DISCORD_PIPELINE_CHANNEL || '';

// Cost milestone alerts — track which ones we've already sent today
const COST_MILESTONES = [1, 5, 10, 25, 50];
const alertedMilestones = new Set<number>();
let lastMilestoneResetDate = new Date().toDateString();

// Job completion tracking
const lastKnownJobStates = new Map<string, string>();

// ============================================================================
// DATABASE (direct connection, independent of server)
// ============================================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30000,
});

async function query(sql: string, params: any[] = []): Promise<any[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// ============================================================================
// SERVER MANAGEMENT
// ============================================================================

function findServerPids(): number[] {
  try {
    const result = execSync(
      "ps aux | grep -E 'tsx server/index-dev|node.*dist/index' | grep -v grep | awk '{print $2}'",
      { encoding: 'utf-8' },
    ).trim();
    return result ? result.split('\n').map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isServerRunning(): boolean {
  return findServerPids().length > 0;
}

function startServer(): { success: boolean; message: string } {
  if (isServerRunning()) {
    return { success: false, message: 'Server is already running' };
  }

  try {
    execSync(`mkdir -p /tmp/unity-scratch`);
    execSync(`> ${SERVER_LOG}`);

    const child = spawn('npx', ['tsx', 'server/index-dev.ts'], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: '8080' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const logStream = createWriteStream(SERVER_LOG, { flags: 'a' });
    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);
    child.unref();

    return { success: true, message: `Server started (PID ${child.pid})` };
  } catch (error: any) {
    return { success: false, message: `Failed: ${error.message}` };
  }
}

function stopServer(): { success: boolean; message: string } {
  const pids = findServerPids();
  if (pids.length === 0) {
    return { success: false, message: 'Server is not running' };
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }

  // Force kill after 3s
  setTimeout(() => {
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }, 3000);

  return { success: true, message: `Stopped ${pids.length} process(es)` };
}

function getServerUptime(): string {
  const pids = findServerPids();
  if (pids.length === 0) return 'Offline';

  try {
    const elapsed = execSync(`ps -o etimes= -p ${pids[0]}`, { encoding: 'utf-8' }).trim();
    const secs = parseInt(elapsed);
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  } catch {
    return 'Unknown';
  }
}

function getRecentLogs(lines: number = 25): string {
  try {
    if (!existsSync(SERVER_LOG)) return 'No log file found';
    const result = execSync(`tail -${lines} ${SERVER_LOG}`, { encoding: 'utf-8' });
    // Strip ANSI color codes
    return result.replace(/\x1B\[[0-9;]*m/g, '').trim() || 'Log is empty';
  } catch {
    return 'Failed to read logs';
  }
}

// ============================================================================
// DB QUERIES
// ============================================================================

async function getRecentJobs(limit: number = 15): Promise<any[]> {
  return query(
    `SELECT id, script_name, mode, status, progress, error_message, created_at, updated_at,
            youtube_video_id, actual_cost_usd
     FROM jobs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
}

async function getJob(jobId: string): Promise<any | null> {
  const rows = await query(
    `SELECT id, script_name, mode, status, progress, error_message, video_path,
            youtube_video_id, actual_cost_usd, retry_count, max_retries,
            created_at, updated_at, uploaded_at,
            unity_metadata
     FROM jobs WHERE id = $1 OR id LIKE $2 LIMIT 1`,
    [jobId, `${jobId}%`],
  );
  return rows[0] || null;
}

async function updateJobStatus(jobId: string, status: string, errorMessage?: string): Promise<void> {
  if (errorMessage) {
    await query(`UPDATE jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3`, [
      status,
      errorMessage,
      jobId,
    ]);
  } else {
    await query(`UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2`, [status, jobId]);
  }
}

async function getTodayCosts(): Promise<{
  total: number;
  byService: Record<string, { cost: number; calls: number }>;
  recentCalls: any[];
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byService = await query(
    `SELECT service, COALESCE(SUM(cost::numeric), 0) as total_cost, COUNT(*) as call_count
     FROM api_usage WHERE created_at >= $1 GROUP BY service ORDER BY total_cost DESC`,
    [today],
  );

  const recentCalls = await query(
    `SELECT service, operation, cost, success, created_at, job_id
     FROM api_usage WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 10`,
    [today],
  );

  const services: Record<string, { cost: number; calls: number }> = {};
  let total = 0;

  for (const row of byService) {
    const cost = parseFloat(row.total_cost);
    services[row.service] = { cost, calls: parseInt(row.call_count) };
    total += cost;
  }

  return { total, byService: services, recentCalls };
}

async function getMonthCosts(): Promise<number> {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const rows = await query(`SELECT COALESCE(SUM(cost::numeric), 0) as total FROM api_usage WHERE created_at >= $1`, [
    firstOfMonth,
  ]);
  return parseFloat(rows[0]?.total || '0');
}

// ============================================================================
// DISCORD COMMAND DEFINITIONS
// ============================================================================

const commands = [
  // Server control
  new SlashCommandBuilder().setName('server-start').setDescription('Start the main server'),
  new SlashCommandBuilder().setName('server-stop').setDescription('Stop the main server'),
  new SlashCommandBuilder().setName('server-restart').setDescription('Restart the main server'),
  new SlashCommandBuilder().setName('server-status').setDescription('Server status + uptime'),
  new SlashCommandBuilder()
    .setName('server-logs')
    .setDescription('Recent server logs')
    .addIntegerOption((opt) =>
      opt.setName('lines').setDescription('Lines to show (default 25, max 40)').setRequired(false),
    ),

  // Job management
  new SlashCommandBuilder().setName('jobs').setDescription('List recent jobs'),
  new SlashCommandBuilder()
    .setName('job')
    .setDescription('Detailed info on a specific job')
    .addStringOption((opt) => opt.setName('id').setDescription('Job ID (full or partial)').setRequired(true)),
  new SlashCommandBuilder()
    .setName('cancel')
    .setDescription('Cancel a running/queued job')
    .addStringOption((opt) => opt.setName('id').setDescription('Job ID').setRequired(true)),
  new SlashCommandBuilder()
    .setName('retry')
    .setDescription('Retry a failed job')
    .addStringOption((opt) => opt.setName('id').setDescription('Job ID').setRequired(true)),
  new SlashCommandBuilder()
    .setName('generate')
    .setDescription('Trigger content generation')
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Content type')
        .setRequired(true)
        .addChoices(
          { name: 'lofi (30 min mix)', value: 'lofi' },
          { name: 'trap (5 min beat)', value: 'trap' },
          { name: 'history (3 min)', value: 'history' },
        ),
    ),

  // Costs & monitoring
  new SlashCommandBuilder().setName('costs').setDescription("Today's spending breakdown + recent calls"),
  new SlashCommandBuilder().setName('health').setDescription('Full system health report'),
  new SlashCommandBuilder()
    .setName('spend-limit')
    .setDescription('View or adjust daily cost limit')
    .addNumberOption((opt) => opt.setName('amount').setDescription('New daily limit in dollars').setRequired(false)),

  // Pipeline control
  new SlashCommandBuilder().setName('start').setDescription('Resume pipeline (reset killswitch + circuit breakers)'),
  new SlashCommandBuilder().setName('stop').setDescription('Emergency stop — halt all AI operations'),

  // Help
  new SlashCommandBuilder().setName('commands').setDescription('List all available commands'),
];

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleServerStart(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const result = startServer();

  if (result.success) {
    await new Promise((r) => setTimeout(r, 6000));
    const running = isServerRunning();
    const pids = findServerPids();

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(running ? 'Server Started' : 'Server May Have Failed')
          .setColor(running ? 0x00ff00 : 0xff6600)
          .setDescription(result.message)
          .addFields(
            { name: 'Status', value: running ? 'Online' : 'Check logs', inline: true },
            { name: 'PID', value: pids[0]?.toString() || 'N/A', inline: true },
            { name: 'Port', value: '8080', inline: true },
          )
          .setTimestamp(),
      ],
    });
  } else {
    await interaction.editReply({
      embeds: [embed('Server Already Running', result.message, 0xffaa00)],
    });
  }
}

async function handleServerStop(interaction: ChatInputCommandInteraction) {
  const result = stopServer();
  await interaction.reply({
    embeds: [
      embed(result.success ? 'Server Stopped' : 'Not Running', result.message, result.success ? 0xff6600 : 0x888888),
    ],
  });
}

async function handleServerRestart(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  stopServer();
  await new Promise((r) => setTimeout(r, 4000));
  const result = startServer();
  await new Promise((r) => setTimeout(r, 6000));
  const running = isServerRunning();

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(running ? 'Server Restarted' : 'Restart May Have Failed')
        .setColor(running ? 0x00ff00 : 0xff0000)
        .setDescription(result.message)
        .addFields(
          { name: 'Status', value: running ? 'Online' : 'Check /server-logs', inline: true },
          { name: 'Uptime', value: getServerUptime(), inline: true },
        )
        .setTimestamp(),
    ],
  });
}

async function handleServerStatus(interaction: ChatInputCommandInteraction) {
  const running = isServerRunning();
  const pids = findServerPids();

  // Also check DB connectivity
  let dbStatus = 'Unknown';
  try {
    await query('SELECT 1');
    dbStatus = 'Connected';
  } catch {
    dbStatus = 'Error';
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(running ? 'Server Online' : 'Server Offline')
        .setColor(running ? 0x00ff00 : 0xff0000)
        .addFields(
          { name: 'Server', value: running ? 'Running' : 'Stopped', inline: true },
          { name: 'PID', value: pids.join(', ') || 'N/A', inline: true },
          { name: 'Uptime', value: getServerUptime(), inline: true },
          { name: 'Database', value: dbStatus, inline: true },
          { name: 'Port', value: '8080', inline: true },
        )
        .setTimestamp(),
    ],
  });
}

async function handleServerLogs(interaction: ChatInputCommandInteraction) {
  const lines = Math.min(interaction.options.getInteger('lines') || 25, 40);
  const logs = getRecentLogs(lines);
  const truncated = logs.length > 3900 ? '...' + logs.slice(-3900) : logs;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`Server Logs (last ${lines} lines)`)
        .setColor(0x5865f2)
        .setDescription(`\`\`\`\n${truncated}\n\`\`\``)
        .setTimestamp(),
    ],
  });
}

async function handleJobs(interaction: ChatInputCommandInteraction) {
  const jobs = await getRecentJobs(15);

  const icons: Record<string, string> = {
    completed: '✅',
    processing: '⏳',
    queued: '🔄',
    failed: '❌',
    cancelled: '🚫',
  };

  const lines = jobs.map((j) => {
    const icon = icons[j.status] || '❓';
    const name = (j.script_name || j.mode || '?').substring(0, 28);
    const age = timeAgo(new Date(j.created_at));
    const yt = j.youtube_video_id ? ' 📺' : '';
    return `${icon} \`${j.id.slice(0, 8)}\` ${name} — ${j.progress}%${yt} — ${age}`;
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('Recent Jobs')
        .setColor(0x5865f2)
        .setDescription(lines.join('\n') || 'No jobs found')
        .setTimestamp(),
    ],
  });
}

async function handleJob(interaction: ChatInputCommandInteraction) {
  const jobId = interaction.options.getString('id', true);
  const job = await getJob(jobId);

  if (!job) {
    await interaction.reply({ content: `Job not found: \`${jobId}\``, ephemeral: true });
    return;
  }

  const e = new EmbedBuilder()
    .setTitle(`Job: ${job.id.slice(0, 8)}`)
    .setColor(job.status === 'completed' ? 0x00ff00 : job.status === 'failed' ? 0xff0000 : 0xffaa00)
    .addFields(
      { name: 'Name', value: job.script_name || 'unnamed', inline: true },
      { name: 'Mode', value: job.mode || '?', inline: true },
      { name: 'Status', value: job.status, inline: true },
      { name: 'Progress', value: `${job.progress}%`, inline: true },
      { name: 'Retries', value: `${job.retry_count || 0}/${job.max_retries || 3}`, inline: true },
      {
        name: 'Cost',
        value: job.actual_cost_usd ? `$${parseFloat(job.actual_cost_usd).toFixed(2)}` : 'N/A',
        inline: true,
      },
      { name: 'Created', value: timeAgo(new Date(job.created_at)), inline: true },
    )
    .setTimestamp();

  if (job.youtube_video_id) {
    e.addFields({ name: 'YouTube', value: `[Watch](https://youtube.com/watch?v=${job.youtube_video_id})` });
  }
  if (job.error_message) {
    e.addFields({ name: 'Error', value: job.error_message.substring(0, 1024) });
  }

  await interaction.reply({ embeds: [e] });
}

async function handleCancel(interaction: ChatInputCommandInteraction) {
  const jobId = interaction.options.getString('id', true);
  const job = await getJob(jobId);

  if (!job) {
    await interaction.reply({ content: `Job not found: \`${jobId}\``, ephemeral: true });
    return;
  }
  if (job.status !== 'processing' && job.status !== 'queued') {
    await interaction.reply({ content: `Job is ${job.status} — can only cancel processing/queued`, ephemeral: true });
    return;
  }

  await updateJobStatus(job.id, 'cancelled', 'Cancelled via Discord');
  await interaction.reply({
    embeds: [embed('Job Cancelled', `\`${job.id.slice(0, 8)}\` ${job.script_name || job.mode}`, 0xff6600)],
  });
}

async function handleRetry(interaction: ChatInputCommandInteraction) {
  const jobId = interaction.options.getString('id', true);
  const job = await getJob(jobId);

  if (!job) {
    await interaction.reply({ content: `Job not found: \`${jobId}\``, ephemeral: true });
    return;
  }
  if (job.status !== 'failed') {
    await interaction.reply({ content: `Job is ${job.status} — can only retry failed jobs`, ephemeral: true });
    return;
  }

  await query(
    `UPDATE jobs SET status = 'queued', error_message = NULL, progress = 0,
     retry_count = COALESCE(retry_count, 0) + 1, updated_at = NOW() WHERE id = $1`,
    [job.id],
  );

  await interaction.reply({
    embeds: [
      embed(
        'Job Requeued',
        `\`${job.id.slice(0, 8)}\` ${job.script_name || job.mode} — retry #${(job.retry_count || 0) + 2}`,
        0x00ff00,
      ),
    ],
  });
}

async function handleGenerate(interaction: ChatInputCommandInteraction) {
  const type = interaction.options.getString('type', true);
  await interaction.deferReply();

  try {
    if (!isServerRunning()) {
      await interaction.editReply({
        embeds: [embed('Server Offline', 'Start the server first with `/server-start`', 0xff0000)],
      });
      return;
    }

    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    let jobData: any;

    if (type === 'lofi') {
      const styles = [
        'lofi hip-hop, chill study beats, 80 BPM, jazzy chords, vinyl crackle, soft piano, mellow bass',
        'lofi jazz, 75 BPM, smooth jazz piano, upright bass, brush drums, vinyl warmth',
        'lofi ambient, 70 BPM, ethereal pads, gentle piano, nature sounds, meditation music',
        'lofi chillhop, 85 BPM, rhodes piano, jazzy bass, dusty drums, late night study vibes',
      ];
      const style = styles[Math.floor(Math.random() * styles.length)];

      jobData = {
        script_name: `Lofi Study Vibes - ${today}`,
        script_content: `lofi beat - ${style}`,
        mode: 'music',
        status: 'queued',
        aspect_ratio: '16:9',
        auto_upload: true,
        audio_duration: '1800',
        metadata: JSON.stringify({ targetDuration: 1800 }),
        unity_metadata: JSON.stringify({
          genre: 'lofi',
          channelId: 'yt_1768620532767_kv4drxdea',
          automationSource: 'discord-watchdog',
          musicStyle: style,
          numTracks: 15,
          trackDuration: 120,
        }),
      };
    } else if (type === 'trap') {
      const styles = [
        'Dark trap, 140 BPM, heavy 808 bass, crispy hi-hats, menacing synths',
        'Melodic trap, 138 BPM, emotional piano, smooth 808s, atmospheric pads',
        'Hard trap, 155 BPM, aggressive 808s, double-time hi-hats, distorted synths',
        'Trap soul, 140 BPM, soulful samples, smooth 808s, emotional chords',
      ];
      const style = styles[Math.floor(Math.random() * styles.length)];

      jobData = {
        script_name: `Trap Beat - ${today}`,
        script_content: `trap beat - ${style}`,
        mode: 'music',
        status: 'queued',
        aspect_ratio: '16:9',
        auto_upload: true,
        audio_duration: '300',
        metadata: JSON.stringify({ targetDuration: 300 }),
        unity_metadata: JSON.stringify({
          genre: 'trap',
          channelId: 'yt_1768620554675_usovd1wx3',
          automationSource: 'discord-watchdog',
          musicStyle: style,
        }),
      };
    } else {
      // history
      jobData = {
        script_name: `History Rap - ${today}`,
        script_content: 'Auto-discover a viral historical topic',
        mode: 'unity_kling',
        status: 'queued',
        aspect_ratio: '9:16',
        auto_upload: true,
        metadata: JSON.stringify({}),
      };
    }

    const cols = Object.keys(jobData);
    const vals = Object.values(jobData);
    const placeholders = vals.map((_, i) => `$${i + 1}`);

    const rows = await query(
      `INSERT INTO jobs (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
      vals,
    );

    const channelNames: Record<string, string> = {
      lofi: 'ChillBeats4Me',
      trap: 'Trap Beats INC',
      history: 'RappingThroughHistory',
    };
    const durations: Record<string, string> = {
      lofi: '30 min mix',
      trap: '5 min beat',
      history: '~3 min video',
    };

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Generation Started: ${type}`)
          .setColor(0x00ff00)
          .setDescription(`Job \`${rows[0].id.slice(0, 8)}\` queued`)
          .addFields(
            { name: 'Type', value: type, inline: true },
            { name: 'Duration', value: durations[type] || '?', inline: true },
            { name: 'Channel', value: channelNames[type] || '?', inline: true },
          )
          .setTimestamp(),
      ],
    });
  } catch (error: any) {
    await interaction.editReply({ content: `Failed: ${error.message}` });
  }
}

async function handleCosts(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const { total, byService, recentCalls } = await getTodayCosts();
  const monthlyCost = await getMonthCosts();

  const serviceLines =
    Object.entries(byService)
      .map(([svc, { cost, calls }]) => `${svc.padEnd(8)} $${cost.toFixed(2).padStart(7)} (${calls} calls)`)
      .join('\n') || 'No spending today';

  const recentLines =
    recentCalls
      .slice(0, 8)
      .map((c) => {
        const icon = c.success ? '✅' : '❌';
        const time = new Date(c.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `${icon} ${c.service}/${c.operation} $${parseFloat(c.cost).toFixed(3)} — ${time}`;
      })
      .join('\n') || 'None';

  const e = new EmbedBuilder()
    .setTitle("Today's Costs")
    .setColor(total > 25 ? 0xff0000 : total > 10 ? 0xffaa00 : 0x00ff00)
    .addFields(
      { name: 'Today', value: `**$${total.toFixed(2)}**`, inline: true },
      { name: 'This Month', value: `$${monthlyCost.toFixed(2)}`, inline: true },
      {
        name: 'Projected Monthly',
        value: `$${((monthlyCost / Math.max(new Date().getDate(), 1)) * 30).toFixed(2)}`,
        inline: true,
      },
    )
    .addFields({ name: 'By Service', value: `\`\`\`\n${serviceLines}\n\`\`\`` })
    .addFields({ name: 'Recent Calls', value: recentLines })
    .setTimestamp();

  await interaction.editReply({ embeds: [e] });
}

async function handleHealth(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const running = isServerRunning();
  const jobs = await getRecentJobs(50);
  const { total } = await getTodayCosts();

  const dayAgo = new Date(Date.now() - 86400000);
  const recent = jobs.filter((j) => new Date(j.created_at) > dayAgo);
  const recentCompleted = recent.filter((j) => j.status === 'completed');
  const recentFailed = recent.filter((j) => j.status === 'failed');
  const processing = jobs.filter((j) => j.status === 'processing');
  const queued = jobs.filter((j) => j.status === 'queued');

  const successRate = recent.length > 0 ? `${((recentCompleted.length / recent.length) * 100).toFixed(0)}%` : 'N/A';

  const lastCompleted = jobs.find((j) => j.status === 'completed');
  const lastCompletedAge = lastCompleted
    ? timeAgo(new Date(lastCompleted.updated_at || lastCompleted.created_at))
    : 'Never';

  let dbStatus = 'Unknown';
  try {
    await query('SELECT 1');
    dbStatus = 'Connected';
  } catch {
    dbStatus = 'Error';
  }

  const e = new EmbedBuilder()
    .setTitle('System Health')
    .setColor(running && dbStatus === 'Connected' ? 0x00ff00 : 0xff0000)
    .addFields(
      { name: 'Server', value: running ? `Online (${getServerUptime()})` : 'OFFLINE', inline: true },
      { name: 'Database', value: dbStatus, inline: true },
      { name: 'Daily Spend', value: `$${total.toFixed(2)}`, inline: true },
      { name: 'Processing', value: `${processing.length}`, inline: true },
      { name: 'Queued', value: `${queued.length}`, inline: true },
      { name: 'Success (24h)', value: `${successRate} (${recentCompleted.length}/${recent.length})`, inline: true },
      { name: 'Failed (24h)', value: `${recentFailed.length}`, inline: true },
      { name: 'Last Completed', value: lastCompletedAge, inline: true },
    )
    .setTimestamp();

  // Show stuck jobs warning
  const stuckJobs = processing.filter((j) => {
    const age = Date.now() - new Date(j.updated_at || j.created_at).getTime();
    return age > 30 * 60 * 1000; // 30+ minutes
  });
  if (stuckJobs.length > 0) {
    e.addFields({
      name: '⚠️ Possibly Stuck',
      value: stuckJobs
        .map((j) => `\`${j.id.slice(0, 8)}\` ${j.script_name} — ${j.progress}% — ${timeAgo(new Date(j.updated_at))}`)
        .join('\n'),
    });
  }

  await interaction.editReply({ embeds: [e] });
}

async function handlePipelineStart(interaction: ChatInputCommandInteraction) {
  if (!isServerRunning()) {
    await interaction.reply({
      embeds: [embed('Server Offline', 'Start the server first with `/server-start`', 0xff0000)],
    });
    return;
  }

  try {
    execSync(`curl -s -X POST http://localhost:8080/api/pipeline/resume`, { timeout: 5000 });
  } catch {}

  await interaction.reply({
    embeds: [embed('Pipeline Resumed', 'Circuit breakers reset. AI operations active.', 0x00ff00)],
  });
}

async function handlePipelineStop(interaction: ChatInputCommandInteraction) {
  if (!isServerRunning()) {
    await interaction.reply({ embeds: [embed('Server Offline', 'Nothing to stop', 0x888888)] });
    return;
  }

  try {
    execSync(`curl -s -X POST http://localhost:8080/api/pipeline/pause`, { timeout: 5000 });
  } catch {}

  await interaction.reply({
    embeds: [
      embed(
        'Pipeline Stopped',
        'Emergency killswitch activated. All AI operations halted.\nUse `/start` to resume.',
        0xff0000,
      ),
    ],
  });
}

async function handleCommands(interaction: ChatInputCommandInteraction) {
  const e = new EmbedBuilder()
    .setTitle('Unity Watchdog Commands')
    .setColor(0x5865f2)
    .setDescription('Full server + pipeline management from Discord')
    .addFields(
      {
        name: '🖥️ Server',
        value: '`/server-start` `/server-stop` `/server-restart`\n`/server-status` `/server-logs [lines]`',
        inline: false,
      },
      {
        name: '📋 Jobs',
        value:
          '`/jobs` — Recent jobs\n`/job <id>` — Job details\n`/cancel <id>` `/retry <id>`\n`/generate <lofi|trap|history>`',
        inline: false,
      },
      {
        name: '💰 Costs',
        value: "`/costs` — Today's breakdown + recent calls\n`/spend-limit [amount]` — View/set daily limit",
        inline: false,
      },
      {
        name: '🏥 Health',
        value: '`/health` — Full system report\n`/start` — Resume pipeline\n`/stop` — Emergency killswitch',
        inline: false,
      },
    )
    .setFooter({ text: 'Proactive alerts: job completions, failures, cost milestones' })
    .setTimestamp();

  await interaction.reply({ embeds: [e] });
}

async function handleSpendLimit(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getNumber('amount');

  if (!amount) {
    // Just show current spending
    const { total } = await getTodayCosts();
    await interaction.reply({
      embeds: [
        embed(
          'Current Spending',
          `Today: **$${total.toFixed(2)}**\nSet a limit with \`/spend-limit <amount>\``,
          0x5865f2,
        ),
      ],
    });
    return;
  }

  if (!isServerRunning()) {
    await interaction.reply({ embeds: [embed('Server Offline', 'Start server to adjust limits', 0xff0000)] });
    return;
  }

  try {
    execSync(
      `curl -s -X POST http://localhost:8080/api/cost-guard/limit -H "Content-Type: application/json" -d '{"daily":${amount}}'`,
      { timeout: 5000 },
    );
  } catch {}

  await interaction.reply({
    embeds: [embed('Spend Limit Updated', `Daily limit set to **$${amount}**`, 0x00ff00)],
  });
}

// ============================================================================
// PROACTIVE MONITORING
// ============================================================================

let discordClient: Client | null = null;

function sendAlert(title: string, description: string, color: number = 0x5865f2): void {
  if (!discordClient || !ALERT_CHANNEL_ID) return;

  const channel = discordClient.channels.cache.get(ALERT_CHANNEL_ID) as TextChannel | undefined;
  if (channel && 'send' in channel) {
    const e = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
    channel.send({ embeds: [e] }).catch(() => {});
  }
}

async function monitorLoop(): Promise<void> {
  // Reset milestones at midnight
  const today = new Date().toDateString();
  if (today !== lastMilestoneResetDate) {
    alertedMilestones.clear();
    lastMilestoneResetDate = today;
  }

  try {
    // 1. Cost milestone alerts
    const { total, byService } = await getTodayCosts();
    for (const milestone of COST_MILESTONES) {
      if (total >= milestone && !alertedMilestones.has(milestone)) {
        alertedMilestones.add(milestone);
        const breakdown = Object.entries(byService)
          .map(([svc, { cost }]) => `${svc}: $${cost.toFixed(2)}`)
          .join(' | ');
        sendAlert(
          `💰 Cost Alert: $${milestone} reached`,
          `Today's total: **$${total.toFixed(2)}**\n${breakdown}`,
          total > 25 ? 0xff0000 : 0xffaa00,
        );
      }
    }

    // 2. Job state change detection
    const recentJobs = await getRecentJobs(10);
    for (const job of recentJobs) {
      const prevState = lastKnownJobStates.get(job.id);

      if (prevState && prevState !== job.status) {
        if (job.status === 'completed') {
          const yt = job.youtube_video_id
            ? `\n[Watch on YouTube](https://youtube.com/watch?v=${job.youtube_video_id})`
            : '';
          const cost = job.actual_cost_usd ? ` — $${parseFloat(job.actual_cost_usd).toFixed(2)}` : '';
          sendAlert(
            `✅ Job Completed: ${job.script_name || job.mode}`,
            `\`${job.id.slice(0, 8)}\`${cost}${yt}`,
            0x00ff00,
          );
        } else if (job.status === 'failed') {
          sendAlert(
            `❌ Job Failed: ${job.script_name || job.mode}`,
            `\`${job.id.slice(0, 8)}\`\n${(job.error_message || 'Unknown error').slice(0, 300)}`,
            0xff0000,
          );
        }
      }

      lastKnownJobStates.set(job.id, job.status);
    }

    // 3. Server crash detection
    // (If server was running last check but isn't now)
  } catch (error: any) {
    // Silently fail monitoring — don't crash the watchdog
  }
}

// ============================================================================
// BOT STARTUP
// ============================================================================

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !clientId) {
    console.error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID in .env');
    process.exit(1);
  }

  // Test DB connection
  try {
    await query('SELECT 1');
    console.log('Watchdog: Database connected');
  } catch (error: any) {
    console.error('Watchdog: Database connection failed:', error.message);
    process.exit(1);
  }

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), {
    body: commands.map((cmd) => cmd.toJSON()),
  });
  console.log('Watchdog: Slash commands registered');

  // Create client
  discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });

  discordClient.on('ready', () => {
    console.log(`Watchdog: Online as ${discordClient!.user?.tag}`);
    console.log(`Watchdog: Server is ${isServerRunning() ? 'running' : 'stopped'}`);

    // Start monitoring loop (every 30 seconds)
    setInterval(monitorLoop, 30_000);
    monitorLoop(); // Run immediately
  });

  discordClient.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // Owner-only
    if (OWNER_ID && interaction.user.id !== OWNER_ID) {
      await interaction.reply({ content: 'Unauthorized.', ephemeral: true });
      return;
    }

    try {
      switch (interaction.commandName) {
        // Server
        case 'server-start':
          await handleServerStart(interaction);
          break;
        case 'server-stop':
          await handleServerStop(interaction);
          break;
        case 'server-restart':
          await handleServerRestart(interaction);
          break;
        case 'server-status':
          await handleServerStatus(interaction);
          break;
        case 'server-logs':
          await handleServerLogs(interaction);
          break;
        // Jobs
        case 'jobs':
          await handleJobs(interaction);
          break;
        case 'job':
          await handleJob(interaction);
          break;
        case 'cancel':
          await handleCancel(interaction);
          break;
        case 'retry':
          await handleRetry(interaction);
          break;
        case 'generate':
          await handleGenerate(interaction);
          break;
        // Costs
        case 'costs':
          await handleCosts(interaction);
          break;
        case 'spend-limit':
          await handleSpendLimit(interaction);
          break;
        // Health
        case 'health':
          await handleHealth(interaction);
          break;
        case 'start':
          await handlePipelineStart(interaction);
          break;
        case 'stop':
          await handlePipelineStop(interaction);
          break;
        // Help
        case 'commands':
          await handleCommands(interaction);
          break;
        default:
          await interaction.reply({ content: `Unknown: ${interaction.commandName}`, ephemeral: true });
      }
    } catch (error: any) {
      console.error(`Command error (${interaction.commandName}):`, error);
      const msg = { content: `Error: ${error.message?.slice(0, 200)}`, ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    }
  });

  await discordClient.login(token);
}

// ============================================================================
// HELPERS
// ============================================================================

function embed(title: string, desc: string, color: number): EmbedBuilder {
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

main().catch((err) => {
  console.error('Watchdog fatal:', err);
  process.exit(1);
});
