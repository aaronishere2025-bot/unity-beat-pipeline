/**
 * Discord Bot - Remote Server Control
 *
 * Slash commands for managing the pipeline from your phone:
 * /status - System status + job queue
 * /jobs - List recent jobs with status
 * /start - Start/resume automation pipeline
 * /stop - Stop automation pipeline
 * /cancel <id> - Cancel a running job
 * /retry <id> - Retry a failed job
 * /generate <type> - Trigger lofi/beat/video generation
 * /health - Full health report
 * /costs - Today's spending breakdown
 * /logs <id> - Recent progress logs for a job
 * /help - List all commands
 * /schedule <type> <count> <time> - Queue generation for later
 * /alerts <on|off> - Toggle proactive notifications
 * /spend-limit <amount> - Adjust daily cost guard on the fly
 */

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';

// ============================================================================
// CONFIG
// ============================================================================

const OWNER_ID = process.env.DISCORD_OWNER_ID || '';
const PIPELINE_HEALTH_CHANNEL = process.env.DISCORD_PIPELINE_CHANNEL || '';
let alertsEnabled = true;

// ============================================================================
// COMMAND DEFINITIONS
// ============================================================================

const commands = [
  new SlashCommandBuilder().setName('status').setDescription('System status + job queue overview'),
  new SlashCommandBuilder().setName('jobs').setDescription('List recent jobs with status'),
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('Start/resume automation pipeline (resets circuit breakers)'),
  new SlashCommandBuilder().setName('stop').setDescription('Stop automation pipeline (emergency killswitch)'),
  new SlashCommandBuilder()
    .setName('cancel')
    .setDescription('Cancel a running job')
    .addStringOption((opt) => opt.setName('id').setDescription('Job ID to cancel').setRequired(true)),
  new SlashCommandBuilder()
    .setName('retry')
    .setDescription('Retry a failed job')
    .addStringOption((opt) => opt.setName('id').setDescription('Job ID to retry').setRequired(true)),
  new SlashCommandBuilder()
    .setName('generate')
    .setDescription('Trigger content generation')
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Content type')
        .setRequired(true)
        .addChoices(
          { name: 'lofi', value: 'lofi' },
          { name: 'trap', value: 'trap' },
          { name: 'chillhop', value: 'chillhop' },
          { name: 'history', value: 'history' },
        ),
    )
    .addIntegerOption((opt) => opt.setName('count').setDescription('Number of videos (default 1)').setRequired(false)),
  new SlashCommandBuilder().setName('health').setDescription('Full system health report'),
  new SlashCommandBuilder().setName('costs').setDescription("Today's spending breakdown by service"),
  new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Recent progress logs for a job')
    .addStringOption((opt) => opt.setName('id').setDescription('Job ID').setRequired(true)),
  new SlashCommandBuilder().setName('commands').setDescription('List all available commands'),
  new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Queue generation for a specific time')
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Content type')
        .setRequired(true)
        .addChoices(
          { name: 'lofi', value: 'lofi' },
          { name: 'trap', value: 'trap' },
          { name: 'history', value: 'history' },
        ),
    )
    .addIntegerOption((opt) => opt.setName('count').setDescription('Number of videos').setRequired(true))
    .addStringOption((opt) =>
      opt.setName('time').setDescription('Time to run (e.g. "2am", "14:00")').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('alerts')
    .setDescription('Toggle proactive notifications')
    .addStringOption((opt) =>
      opt
        .setName('state')
        .setDescription('on or off')
        .setRequired(true)
        .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }),
    ),
  new SlashCommandBuilder()
    .setName('spend-limit')
    .setDescription('Adjust daily cost guard limit')
    .addNumberOption((opt) =>
      opt.setName('amount').setDescription('New daily limit in dollars (e.g. 10, 25, 50)').setRequired(true),
    ),
  new SlashCommandBuilder().setName('verify').setDescription('Run pipeline verification specs'),
];

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const { storage } = await import('../storage');
  const { costGuard } = await import('./cost-guard');

  const allJobs = await storage.listJobs();
  const processing = allJobs.filter((j) => j.status === 'processing');
  const queued = allJobs.filter((j) => j.status === 'queued');
  const failed = allJobs.filter((j) => j.status === 'failed');
  const completed = allJobs.filter((j) => j.status === 'completed');

  const spending = await costGuard.getCurrentSpending();
  const cbStatus = costGuard.getCircuitBreakerStatus();
  const pausedServices = Object.entries(cbStatus).filter(([_, s]) => s.pausedUntil);

  const embed = new EmbedBuilder()
    .setTitle('System Status')
    .setColor(processing.length > 0 ? 0x00ff00 : queued.length > 0 ? 0xffaa00 : 0x888888)
    .addFields(
      { name: 'Processing', value: `${processing.length}`, inline: true },
      { name: 'Queued', value: `${queued.length}`, inline: true },
      { name: 'Failed (recent)', value: `${failed.slice(0, 50).length}`, inline: true },
      { name: 'Completed', value: `${completed.length}`, inline: true },
      {
        name: 'Daily Spend',
        value: `$${spending.daily.current.toFixed(2)} / $${spending.daily.limit} (${spending.daily.percentage.toFixed(0)}%)`,
        inline: true,
      },
      {
        name: 'Circuit Breakers',
        value: pausedServices.length > 0 ? pausedServices.map(([svc]) => `${svc} PAUSED`).join(', ') : 'All clear',
        inline: true,
      },
    )
    .setTimestamp();

  if (processing.length > 0) {
    const jobLines = processing
      .slice(0, 5)
      .map((j) => `\`${j.id.slice(0, 8)}\` ${j.scriptName || j.mode || 'unknown'} — ${j.progress || 0}%`);
    embed.addFields({ name: 'Active Jobs', value: jobLines.join('\n') });
  }

  await interaction.reply({ embeds: [embed] });
}

async function handleJobs(interaction: ChatInputCommandInteraction): Promise<void> {
  const { storage } = await import('../storage');
  const allJobs = await storage.listJobs();

  // Sort by most recent (createdAt descending) and take top 15
  const recent = allJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 15);

  const statusIcon: Record<string, string> = {
    completed: '✅',
    processing: '⏳',
    queued: '🔄',
    failed: '❌',
    cancelled: '🚫',
  };

  const lines = recent.map((j) => {
    const icon = statusIcon[j.status] || '❓';
    const name = (j.scriptName || j.mode || 'unknown').substring(0, 30);
    const age = getTimeAgo(new Date(j.createdAt));
    return `${icon} \`${j.id.slice(0, 8)}\` ${name} — ${j.progress || 0}% — ${age}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('Recent Jobs (15)')
    .setColor(0x5865f2)
    .setDescription(lines.join('\n') || 'No jobs found')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleStart(interaction: ChatInputCommandInteraction): Promise<void> {
  const { costGuard } = await import('./cost-guard');

  // Reset all circuit breakers and deactivate killswitch
  costGuard.resetCircuitBreaker();
  costGuard.deactivateEmergencyKillswitch();

  const embed = new EmbedBuilder()
    .setTitle('Pipeline Resumed')
    .setColor(0x00ff00)
    .setDescription('All circuit breakers reset. Emergency killswitch deactivated. Pipeline is running.')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const { costGuard } = await import('./cost-guard');

  costGuard.activateEmergencyKillswitch('Manual stop via Discord /stop command');

  const embed = new EmbedBuilder()
    .setTitle('Pipeline Stopped')
    .setColor(0xff0000)
    .setDescription('Emergency killswitch activated. All AI operations halted. Use `/start` to resume.')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleCancel(interaction: ChatInputCommandInteraction): Promise<void> {
  const { storage } = await import('../storage');
  const jobId = interaction.options.getString('id', true);

  // Find job by partial or full ID
  const allJobs = await storage.listJobs();
  const job = allJobs.find((j) => j.id === jobId || j.id.startsWith(jobId));

  if (!job) {
    await interaction.reply({ content: `Job not found: \`${jobId}\``, ephemeral: true });
    return;
  }

  if (job.status !== 'processing' && job.status !== 'queued') {
    await interaction.reply({
      content: `Job \`${job.id.slice(0, 8)}\` is ${job.status} — can only cancel processing/queued jobs`,
      ephemeral: true,
    });
    return;
  }

  await storage.updateJob(job.id, { status: 'cancelled', errorMessage: 'Cancelled via Discord' });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('Job Cancelled')
        .setColor(0xff6600)
        .setDescription(`\`${job.id.slice(0, 8)}\` ${job.scriptName || job.mode} — cancelled`)
        .setTimestamp(),
    ],
  });
}

async function handleRetry(interaction: ChatInputCommandInteraction): Promise<void> {
  const { storage } = await import('../storage');
  const jobId = interaction.options.getString('id', true);

  const allJobs = await storage.listJobs();
  const job = allJobs.find((j) => j.id === jobId || j.id.startsWith(jobId));

  if (!job) {
    await interaction.reply({ content: `Job not found: \`${jobId}\``, ephemeral: true });
    return;
  }

  if (job.status !== 'failed') {
    await interaction.reply({
      content: `Job \`${job.id.slice(0, 8)}\` is ${job.status} — can only retry failed jobs`,
      ephemeral: true,
    });
    return;
  }

  await storage.updateJob(job.id, {
    status: 'queued',
    errorMessage: undefined,
    retryCount: (job.retryCount || 0) + 1,
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('Job Requeued')
        .setColor(0x00ff00)
        .setDescription(
          `\`${job.id.slice(0, 8)}\` ${job.scriptName || job.mode} — requeued for retry (attempt ${(job.retryCount || 0) + 2})`,
        )
        .setTimestamp(),
    ],
  });
}

async function handleGenerate(interaction: ChatInputCommandInteraction): Promise<void> {
  const type = interaction.options.getString('type', true);
  const count = interaction.options.getInteger('count') || 1;

  await interaction.deferReply();

  try {
    const { storage } = await import('../storage');

    const createdJobs: string[] = [];

    for (let i = 0; i < count; i++) {
      let jobData: any;

      if (type === 'history') {
        jobData = {
          mode: 'unity_kling',
          scriptName: `Discord-generated history video ${i + 1}`,
          scriptContent: 'Auto-discover a viral historical topic',
          status: 'queued',
        };
      } else {
        // Beat/lofi/trap/chillhop
        const styleMap: Record<string, string> = {
          lofi: 'lofi hip hop, chill beats, vinyl crackle, 85 BPM, instrumental',
          trap: 'trap beats, heavy 808s, crispy hi-hats, 140 BPM, instrumental',
          chillhop: 'chillhop, jazzy piano, smooth rhodes, 90 BPM, instrumental',
        };

        const targetDuration = type === 'lofi' ? 1800 : 180; // 30 min for lofi, 3 min for others

        jobData = {
          mode: 'music',
          scriptName: `Discord ${type} beat ${i + 1}`,
          scriptContent: styleMap[type] || styleMap.lofi,
          status: 'queued',
          metadata: {
            targetDuration,
            isInstrumental: true,
            singleClip: true,
          },
        };
      }

      const created = await storage.createJob(jobData);
      createdJobs.push(created.id);
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Generation Started: ${count}x ${type}`)
          .setColor(0x00ff00)
          .setDescription(createdJobs.map((id) => `\`${id.slice(0, 8)}\``).join(', '))
          .setTimestamp(),
      ],
    });
  } catch (error: any) {
    await interaction.editReply({ content: `Failed to create jobs: ${error.message}` });
  }
}

async function handleHealth(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { storage } = await import('../storage');
  const { costGuard } = await import('./cost-guard');

  const allJobs = await storage.listJobs();
  const now = new Date();

  // Last successful job
  const lastCompleted = allJobs
    .filter((j) => j.status === 'completed')
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())[0];

  const lastCompletedAge = lastCompleted
    ? getTimeAgo(new Date(lastCompleted.updatedAt || lastCompleted.createdAt))
    : 'Never';

  // Failed in last 24h
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentFailed = allJobs.filter((j) => j.status === 'failed' && new Date(j.createdAt) > dayAgo);

  // Success rate last 24h
  const recentAll = allJobs.filter((j) => new Date(j.createdAt) > dayAgo);
  const recentCompleted = recentAll.filter((j) => j.status === 'completed');
  const successRate = recentAll.length > 0 ? ((recentCompleted.length / recentAll.length) * 100).toFixed(0) : 'N/A';

  // Cost report
  const spending = await costGuard.getCurrentSpending();
  const cbStatus = costGuard.getCircuitBreakerStatus();
  const killswitch = costGuard.isKillswitchActive();

  // Stale detection — warn if no job completed in 3+ days
  const staleDays = lastCompleted
    ? Math.floor((now.getTime() - new Date(lastCompleted.updatedAt || lastCompleted.createdAt).getTime()) / 86400000)
    : 999;
  const staleWarning = staleDays >= 3 ? `\n**WARNING: No successful job in ${staleDays} days!**` : '';

  const embed = new EmbedBuilder()
    .setTitle('System Health Report')
    .setColor(killswitch ? 0xff0000 : staleDays >= 3 ? 0xff6600 : 0x00ff00)
    .addFields(
      { name: 'Killswitch', value: killswitch ? 'ACTIVE (pipeline stopped)' : 'Off', inline: true },
      { name: 'Last Completed', value: lastCompletedAge, inline: true },
      {
        name: 'Success Rate (24h)',
        value: `${successRate}% (${recentCompleted.length}/${recentAll.length})`,
        inline: true,
      },
      { name: 'Failed (24h)', value: `${recentFailed.length}`, inline: true },
      {
        name: 'Daily Spend',
        value: `$${spending.daily.current.toFixed(2)} / $${spending.daily.limit}`,
        inline: true,
      },
      {
        name: 'Monthly Spend',
        value: `$${spending.monthly.current.toFixed(2)} / $${spending.monthly.limit}`,
        inline: true,
      },
    )
    .setDescription(staleWarning)
    .setTimestamp();

  // Per-service breakdown
  const serviceLines = Object.entries(spending.dailyPerService)
    .map(([svc, status]) => {
      const cb = cbStatus[svc];
      const paused = cb?.pausedUntil ? ' [PAUSED]' : '';
      return `${svc}: $${status.current.toFixed(2)} / $${status.limit} (${status.percentage.toFixed(0)}%)${paused}`;
    })
    .join('\n');
  embed.addFields({ name: 'Service Spending', value: `\`\`\`\n${serviceLines}\n\`\`\`` });

  await interaction.editReply({ embeds: [embed] });
}

async function handleCosts(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { costGuard } = await import('./cost-guard');
  const report = await costGuard.getDetailedReport();

  const embed = new EmbedBuilder()
    .setTitle("Today's Cost Breakdown")
    .setColor(report.spending.daily.percentage > 80 ? 0xff0000 : 0x5865f2)
    .addFields(
      {
        name: 'Daily',
        value: `$${report.spending.daily.current.toFixed(2)} / $${report.spending.daily.limit} (${report.spending.daily.status})`,
        inline: true,
      },
      {
        name: 'Monthly',
        value: `$${report.spending.monthly.current.toFixed(2)} / $${report.spending.monthly.limit}`,
        inline: true,
      },
      {
        name: 'Projected Monthly',
        value: `$${report.projectedMonthlySpend.toFixed(2)}`,
        inline: true,
      },
    )
    .setTimestamp();

  // Per-service breakdown
  const svcLines = Object.entries(report.spending.dailyPerService)
    .map(
      ([svc, status]) =>
        `${svc.padEnd(8)} $${status.current.toFixed(2).padStart(6)} / $${status.limit} (${status.status})`,
    )
    .join('\n');
  embed.addFields({ name: 'By Service', value: `\`\`\`\n${svcLines}\n\`\`\`` });

  // Top cost drivers
  if (report.topCostDrivers.length > 0) {
    const driverLines = report.topCostDrivers
      .slice(0, 5)
      .map((d) => `${d.service}/${d.operation}: $${d.cost.toFixed(2)} (${d.calls} calls)`)
      .join('\n');
    embed.addFields({ name: 'Top Cost Drivers (Month)', value: `\`\`\`\n${driverLines}\n\`\`\`` });
  }

  // Circuit breaker status
  const cbEntries = Object.entries(report.circuitBreakers);
  if (cbEntries.length > 0) {
    const cbLines = cbEntries
      .map(([svc, state]) => `${svc}: ${state.consecutiveFailures} failures${state.pausedUntil ? ' [PAUSED]' : ''}`)
      .join('\n');
    embed.addFields({ name: 'Circuit Breakers', value: cbLines });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleLogs(interaction: ChatInputCommandInteraction): Promise<void> {
  const { storage } = await import('../storage');
  const jobId = interaction.options.getString('id', true);

  const allJobs = await storage.listJobs();
  const job = allJobs.find((j) => j.id === jobId || j.id.startsWith(jobId));

  if (!job) {
    await interaction.reply({ content: `Job not found: \`${jobId}\``, ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Job: ${job.id.slice(0, 8)}`)
    .setColor(job.status === 'completed' ? 0x00ff00 : job.status === 'failed' ? 0xff0000 : 0xffaa00)
    .addFields(
      { name: 'Name', value: job.scriptName || 'unnamed', inline: true },
      { name: 'Mode', value: job.mode || 'unknown', inline: true },
      { name: 'Status', value: job.status, inline: true },
      { name: 'Progress', value: `${job.progress || 0}%`, inline: true },
      { name: 'Retries', value: `${job.retryCount || 0} / ${job.maxRetries || 3}`, inline: true },
      { name: 'Created', value: getTimeAgo(new Date(job.createdAt)), inline: true },
    )
    .setTimestamp();

  if (job.errorMessage) {
    embed.addFields({
      name: 'Error',
      value: job.errorMessage.substring(0, 1024),
    });
  }

  if (job.videoPath) {
    embed.addFields({ name: 'Video', value: job.videoPath });
  }

  await interaction.reply({ embeds: [embed] });
}

async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('Unity Bot Commands')
    .setColor(0x5865f2)
    .setDescription('Control your video pipeline from Discord')
    .addFields(
      { name: '/status', value: 'System status + active jobs + spending', inline: false },
      { name: '/jobs', value: 'List 15 most recent jobs with status', inline: false },
      { name: '/start', value: 'Resume pipeline (reset circuit breakers + killswitch)', inline: false },
      { name: '/stop', value: 'Emergency stop — halts all AI operations', inline: false },
      { name: '/cancel <id>', value: 'Cancel a processing/queued job', inline: false },
      { name: '/retry <id>', value: 'Requeue a failed job for retry', inline: false },
      { name: '/generate <type> [count]', value: 'Create lofi/trap/chillhop/history jobs', inline: false },
      { name: '/health', value: 'Full health report with stale job detection', inline: false },
      { name: '/costs', value: "Today's spending by service + top cost drivers", inline: false },
      { name: '/logs <id>', value: 'Detailed info on a specific job', inline: false },
      {
        name: '/schedule <type> <count> <time>',
        value: 'Queue generation for a specific time (e.g. /schedule lofi 3 2am)',
        inline: false,
      },
      { name: '/alerts <on|off>', value: 'Toggle proactive Discord notifications', inline: false },
      { name: '/spend-limit <amount>', value: 'Adjust daily cost guard limit on the fly', inline: false },
      { name: '/verify', value: 'Run pipeline verification specs (12 checks)', inline: false },
    )
    .setFooter({ text: 'Owner-only — unauthorized users are ignored' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleSchedule(interaction: ChatInputCommandInteraction): Promise<void> {
  const type = interaction.options.getString('type', true);
  const count = interaction.options.getInteger('count', true);
  const timeStr = interaction.options.getString('time', true);

  // Parse time string (e.g. "2am", "14:00", "2:30am")
  const now = new Date();
  let targetHour = 0;
  let targetMinute = 0;

  const match12 = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);

  if (match12) {
    targetHour = parseInt(match12[1]);
    targetMinute = match12[2] ? parseInt(match12[2]) : 0;
    if (match12[3].toLowerCase() === 'pm' && targetHour !== 12) targetHour += 12;
    if (match12[3].toLowerCase() === 'am' && targetHour === 12) targetHour = 0;
  } else if (match24) {
    targetHour = parseInt(match24[1]);
    targetMinute = parseInt(match24[2]);
  } else {
    await interaction.reply({
      content: `Invalid time format: \`${timeStr}\`. Use "2am", "14:00", etc.`,
      ephemeral: true,
    });
    return;
  }

  // Calculate delay
  const target = new Date(now);
  target.setHours(targetHour, targetMinute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1); // Next day if time already passed

  const delayMs = target.getTime() - now.getTime();
  const delayHours = (delayMs / 3600000).toFixed(1);

  // Schedule using setTimeout (in-memory — lost on restart, but simple)
  setTimeout(async () => {
    try {
      const { storage } = await import('../storage');

      for (let i = 0; i < count; i++) {
        const styleMap: Record<string, string> = {
          lofi: 'lofi hip hop, chill beats, vinyl crackle, 85 BPM, instrumental',
          trap: 'trap beats, heavy 808s, crispy hi-hats, 140 BPM, instrumental',
          history: '',
        };

        const jobData: any =
          type === 'history'
            ? {
                mode: 'unity_kling',
                scriptName: `Scheduled history video ${i + 1}`,
                scriptContent: 'Auto-discover a viral historical topic',
                status: 'queued',
              }
            : {
                mode: 'music',
                scriptName: `Scheduled ${type} beat ${i + 1}`,
                scriptContent: styleMap[type] || styleMap.lofi,
                status: 'queued',
                metadata: {
                  targetDuration: type === 'lofi' ? 1800 : 180,
                  isInstrumental: true,
                  singleClip: true,
                },
              };

        await storage.createJob(jobData);
      }

      // Notify on Discord
      sendNotification(
        `Scheduled Generation Started`,
        `${count}x ${type} jobs created (scheduled at ${timeStr})`,
        0x00ff00,
      );
    } catch (error: any) {
      sendNotification('Scheduled Generation Failed', error.message, 0xff0000);
    }
  }, delayMs);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('Generation Scheduled')
        .setColor(0x5865f2)
        .setDescription(
          `${count}x ${type} scheduled for ${target.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} (in ~${delayHours} hours)`,
        )
        .setTimestamp(),
    ],
  });
}

async function handleAlerts(interaction: ChatInputCommandInteraction): Promise<void> {
  const state = interaction.options.getString('state', true);
  alertsEnabled = state === 'on';

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`Alerts ${alertsEnabled ? 'Enabled' : 'Disabled'}`)
        .setColor(alertsEnabled ? 0x00ff00 : 0xff6600)
        .setDescription(
          alertsEnabled
            ? 'You will receive proactive notifications for job completions, failures, and cost alerts.'
            : 'Notifications paused. Use `/alerts on` to re-enable.',
        )
        .setTimestamp(),
    ],
  });
}

async function handleSpendLimit(interaction: ChatInputCommandInteraction): Promise<void> {
  const amount = interaction.options.getNumber('amount', true);
  const { costGuard } = await import('./cost-guard');

  const perService = Math.floor(amount / 5); // Split evenly across 5 services
  costGuard.updateLimits({
    daily: amount,
    dailyPerService: {
      openai: perService,
      gemini: perService,
      claude: perService,
      kling: perService,
      suno: perService,
    },
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('Cost Limit Updated')
        .setColor(0x00ff00)
        .setDescription(`Daily limit set to **$${amount}** ($${perService}/service)`)
        .setTimestamp(),
    ],
  });
}

async function handleVerify(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { pipelineVerifier } = await import('./pipeline-verifier');
  const { results, passed, failed, summary } = await pipelineVerifier.runAll();

  const lines = results.map((r) => {
    const icon = r.passed ? '✅' : '❌';
    return `${icon} **${r.name}** — ${r.detail}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`Pipeline Verification: ${summary}`)
    .setColor(failed === 0 ? 0x00ff00 : 0xff0000)
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Passed', value: `${passed}`, inline: true },
      { name: 'Failed', value: `${failed}`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ============================================================================
// BOT SETUP
// ============================================================================

let client: Client | null = null;

/**
 * Send a proactive notification to the pipeline health channel
 */
export function sendNotification(title: string, description: string, color: number = 0x5865f2): void {
  if (!alertsEnabled || !client) return;

  const channel = PIPELINE_HEALTH_CHANNEL ? client.channels.cache.get(PIPELINE_HEALTH_CHANNEL) : null;

  if (channel && 'send' in channel) {
    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
    (channel as any).send({ embeds: [embed] }).catch(() => {});
  }
}

export async function startDiscordBot(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.log('Discord bot: DISCORD_BOT_TOKEN not set, skipping');
    return;
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    console.log('Discord bot: DISCORD_CLIENT_ID not set, skipping');
    return;
  }

  try {
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(clientId), {
      body: commands.map((cmd) => cmd.toJSON()),
    });
    console.log('Discord bot: Slash commands registered');

    // Create and start client
    client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });

    client.on('ready', () => {
      console.log(`Discord bot: Logged in as ${client!.user?.tag}`);
    });

    client.on('interactionCreate', async (interaction: Interaction) => {
      if (!interaction.isChatInputCommand()) return;

      // Owner-only authorization
      if (OWNER_ID && interaction.user.id !== OWNER_ID) {
        await interaction.reply({ content: 'Unauthorized.', ephemeral: true });
        return;
      }

      const { commandName } = interaction;

      try {
        switch (commandName) {
          case 'status':
            await handleStatus(interaction);
            break;
          case 'jobs':
            await handleJobs(interaction);
            break;
          case 'start':
            await handleStart(interaction);
            break;
          case 'stop':
            await handleStop(interaction);
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
          case 'health':
            await handleHealth(interaction);
            break;
          case 'costs':
            await handleCosts(interaction);
            break;
          case 'logs':
            await handleLogs(interaction);
            break;
          case 'commands':
            await handleHelp(interaction);
            break;
          case 'schedule':
            await handleSchedule(interaction);
            break;
          case 'alerts':
            await handleAlerts(interaction);
            break;
          case 'spend-limit':
            await handleSpendLimit(interaction);
            break;
          case 'verify':
            await handleVerify(interaction);
            break;
          default:
            await interaction.reply({ content: `Unknown command: ${commandName}`, ephemeral: true });
        }
      } catch (error: any) {
        console.error(`Discord bot command error (${commandName}):`, error);
        const reply = { content: `Error: ${error.message}`, ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    });

    await client.login(token);
  } catch (error: any) {
    console.error(`Discord bot failed to start: ${error.message}`);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
