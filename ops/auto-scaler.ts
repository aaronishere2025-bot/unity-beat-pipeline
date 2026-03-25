#!/usr/bin/env tsx
/**
 * Auto-Scaler for Instance 2
 *
 * Monitors job queue and automatically:
 * - Starts instance 2 when queue > threshold
 * - Stops instance 2 when idle for X minutes
 *
 * Saves ~$120/month during off-peak hours!
 */

import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { eq, or, inArray } from 'drizzle-orm';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const INSTANCE_NAME = 'ai-workspace-2';
const ZONE = 'us-central1-a';
const PROJECT = 'unity-ai-1766877776';

const QUEUE_THRESHOLD_START = 10; // Start instance 2 when 10+ jobs queued
const IDLE_MINUTES_STOP = 15; // Stop instance 2 after 15 minutes idle
const CHECK_INTERVAL_MS = 60000; // Check every 60 seconds

let lastActiveTime = Date.now();
let instance2Running = false;

interface InstanceStatus {
  running: boolean;
  status: string;
}

async function getInstanceStatus(): Promise<InstanceStatus> {
  try {
    const { stdout } = await execAsync(
      `gcloud compute instances describe ${INSTANCE_NAME} --zone=${ZONE} --project=${PROJECT} --format="get(status)"`,
    );
    const status = stdout.trim();
    return {
      running: status === 'RUNNING',
      status,
    };
  } catch (error: any) {
    if (error.message.includes('not found')) {
      console.log(`⚠️  Instance ${INSTANCE_NAME} not found - needs to be created first`);
      return { running: false, status: 'NOT_FOUND' };
    }
    throw error;
  }
}

async function startInstance(): Promise<void> {
  console.log(`🚀 Starting ${INSTANCE_NAME}...`);
  try {
    await execAsync(`gcloud compute instances start ${INSTANCE_NAME} --zone=${ZONE} --project=${PROJECT}`);
    console.log(`✅ ${INSTANCE_NAME} started successfully`);
    instance2Running = true;
    lastActiveTime = Date.now();
  } catch (error: any) {
    console.error(`❌ Failed to start instance:`, error.message);
  }
}

async function stopInstance(): Promise<void> {
  console.log(`🛑 Stopping ${INSTANCE_NAME}...`);
  try {
    await execAsync(`gcloud compute instances stop ${INSTANCE_NAME} --zone=${ZONE} --project=${PROJECT}`);
    console.log(`✅ ${INSTANCE_NAME} stopped successfully`);
    console.log(`💰 Saving ~$8/day (~$240/month) while stopped`);
    instance2Running = false;
  } catch (error: any) {
    console.error(`❌ Failed to stop instance:`, error.message);
  }
}

async function getJobStats(): Promise<{ queued: number; processing: number; total: number }> {
  const allJobs = await db
    .select()
    .from(jobs)
    .where(or(eq(jobs.status, 'queued'), eq(jobs.status, 'processing')));

  const queued = allJobs.filter((j) => j.status === 'queued').length;
  const processing = allJobs.filter((j) => j.status === 'processing').length;

  return {
    queued,
    processing,
    total: queued + processing,
  };
}

async function checkAndScale(): Promise<void> {
  const now = new Date().toISOString();
  console.log(`\n[${now}] 🔍 Checking job queue...`);

  // Get current instance status
  const instanceStatus = await getInstanceStatus();

  if (instanceStatus.status === 'NOT_FOUND') {
    console.log('⚠️  Instance 2 not created yet. Run: npx tsx setup-budget-dual.sh');
    return;
  }

  instance2Running = instanceStatus.running;

  // Get job statistics
  const stats = await getJobStats();
  console.log(`   Jobs: ${stats.queued} queued, ${stats.processing} processing`);

  // Decision logic
  if (!instance2Running && stats.queued >= QUEUE_THRESHOLD_START) {
    console.log(`🚨 HIGH LOAD: ${stats.queued} jobs queued (threshold: ${QUEUE_THRESHOLD_START})`);
    console.log(`   Starting instance 2 to handle load...`);
    await startInstance();
    return;
  }

  if (instance2Running && stats.total > 0) {
    // Instance is working, update last active time
    lastActiveTime = Date.now();
    console.log(`✅ Instance 2 active (${stats.processing} processing)`);
    return;
  }

  if (instance2Running && stats.total === 0) {
    // Check if idle for long enough
    const idleMinutes = (Date.now() - lastActiveTime) / (1000 * 60);
    console.log(`💤 Instance 2 idle for ${idleMinutes.toFixed(1)} minutes`);

    if (idleMinutes >= IDLE_MINUTES_STOP) {
      console.log(`   Idle threshold reached (${IDLE_MINUTES_STOP} min) - stopping instance...`);
      await stopInstance();
    } else {
      const remainingMinutes = IDLE_MINUTES_STOP - idleMinutes;
      console.log(`   Will stop in ${remainingMinutes.toFixed(1)} minutes if still idle`);
    }
    return;
  }

  if (!instance2Running && stats.queued < QUEUE_THRESHOLD_START) {
    console.log(`😴 Low load (${stats.queued} jobs) - instance 2 stays off`);
    console.log(`💰 Saving money! (~$0.33/hour = ~$8/day)`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🤖 Auto-Scaler for Instance 2');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('📊 Configuration:');
  console.log(`   Instance: ${INSTANCE_NAME}`);
  console.log(`   Zone: ${ZONE}`);
  console.log(`   Project: ${PROJECT}`);
  console.log('');
  console.log('🎯 Scaling Rules:');
  console.log(`   Start instance 2: When ${QUEUE_THRESHOLD_START}+ jobs queued`);
  console.log(`   Stop instance 2: After ${IDLE_MINUTES_STOP} minutes idle`);
  console.log(`   Check interval: ${CHECK_INTERVAL_MS / 1000} seconds`);
  console.log('');
  console.log('💰 Cost Savings:');
  console.log(`   Instance 2 running: $0.33/hour = $240/month`);
  console.log(`   Instance 2 stopped: $0.00/hour (only pay when needed)`);
  console.log(`   Expected savings: ~$120/month (50% uptime)`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚀 Auto-scaler started! Press Ctrl+C to stop.');
  console.log('═══════════════════════════════════════════════════════════════════');

  // Initial check
  await checkAndScale();

  // Check every minute
  setInterval(async () => {
    try {
      await checkAndScale();
    } catch (error: any) {
      console.error('❌ Error during scaling check:', error.message);
    }
  }, CHECK_INTERVAL_MS);
}

main().catch(console.error);
