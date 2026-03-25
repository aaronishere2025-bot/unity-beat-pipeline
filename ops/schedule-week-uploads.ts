#!/usr/bin/env tsx
/**
 * Schedule completed videos throughout the next 5 days
 * - Trap videos → Trap Beats INC channel
 * - Lofi videos → ChillBeats4Me channel
 * - 6 videos per day, spaced 4 hours apart
 */

async function scheduleUploads() {
  const apiUrl = 'http://localhost:8080';

  // Channel IDs
  const trapChannel = 'yt_1768620554675_usovd1wx3'; // Trap Beats INC
  const lofiChannel = 'yt_1768620532767_kv4drxdea'; // ChillBeats4Me

  console.log('📅 Scheduling videos for the next 5 days...\n');

  // Get all completed jobs
  const response = await fetch(`${apiUrl}/api/jobs`);
  const jobsData = await response.json();
  const allJobs = jobsData.data || [];

  // Filter for recently created music jobs that are completed
  const recentMusicJobs = allJobs
    .filter((job: any) => job.mode === 'music' && job.status === 'completed')
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30); // Get the 30 most recent

  console.log(`Found ${recentMusicJobs.length} completed music jobs\n`);

  if (recentMusicJobs.length === 0) {
    console.log('⚠️ No completed jobs found. Wait for generation to complete and run this script again.');
    return;
  }

  // Separate trap and lofi
  const trapJobs = recentMusicJobs.filter(
    (j: any) => j.script_name.toLowerCase().includes('trap') || j.script_name.toLowerCase().includes('drill'),
  );
  const lofiJobs = recentMusicJobs.filter((j: any) => j.script_name.toLowerCase().includes('lofi'));

  console.log(`📊 Distribution:`);
  console.log(`   Trap videos: ${trapJobs.length}`);
  console.log(`   Lofi videos: ${lofiJobs.length}\n`);

  // Schedule uploads over 5 days
  const startTime = new Date();
  startTime.setHours(startTime.getHours() + 1); // Start 1 hour from now
  startTime.setMinutes(0);
  startTime.setSeconds(0);

  const schedules: Array<{ job: any; time: Date; channel: string }> = [];

  // Upload times: 10am, 2pm, 6pm, 10pm daily (4 slots per day)
  const uploadHours = [10, 14, 18, 22];
  let currentDay = 0;
  let currentSlot = 0;

  // Interleave trap and lofi
  const allJobsToSchedule = [];
  const maxLength = Math.max(trapJobs.length, lofiJobs.length);

  for (let i = 0; i < maxLength; i++) {
    if (i < trapJobs.length) allJobsToSchedule.push({ job: trapJobs[i], channel: trapChannel });
    if (i < lofiJobs.length) allJobsToSchedule.push({ job: lofiJobs[i], channel: lofiChannel });
  }

  // Schedule each video
  for (const item of allJobsToSchedule) {
    const scheduleTime = new Date(startTime);
    scheduleTime.setDate(scheduleTime.getDate() + currentDay);
    scheduleTime.setHours(uploadHours[currentSlot]);

    schedules.push({
      job: item.job,
      time: scheduleTime,
      channel: item.channel,
    });

    // Move to next slot
    currentSlot++;
    if (currentSlot >= uploadHours.length) {
      currentSlot = 0;
      currentDay++;
    }
  }

  // Apply schedules via API
  console.log('⏰ Applying upload schedules...\n');

  for (let i = 0; i < schedules.length; i++) {
    const { job, time, channel } = schedules[i];
    const channelName = channel === lofiChannel ? 'ChillBeats4Me' : 'Trap Beats INC';

    console.log(`${i + 1}/${schedules.length}: ${job.script_name}`);
    console.log(`   📅 ${time.toLocaleString()}`);
    console.log(`   📺 ${channelName}`);

    try {
      // First generate metadata
      const metadataResponse = await fetch(`${apiUrl}/api/youtube/generate-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });

      const metadataResult = await metadataResponse.json();

      if (!metadataResult.success) {
        console.log(`   ❌ Failed to generate metadata: ${metadataResult.error}\n`);
        continue;
      }

      const metadata = metadataResult.data;

      // Schedule upload
      const uploadResponse = await fetch(`${apiUrl}/api/youtube/upload-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          customMetadata: metadata,
          channelConnectionId: channel,
          scheduledUploadTime: time.toISOString(),
        }),
      });

      const uploadResult = await uploadResponse.json();

      if (uploadResult.success) {
        console.log(`   ✅ Scheduled!\n`);
      } else {
        console.log(`   ❌ Failed: ${uploadResult.error}\n`);
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}\n`);
    }

    // Small delay
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log('✅ All videos scheduled!\n');
  console.log('📊 Summary:');
  console.log(`   Total videos: ${schedules.length}`);
  console.log(`   First upload: ${schedules[0].time.toLocaleString()}`);
  console.log(`   Last upload: ${schedules[schedules.length - 1].time.toLocaleString()}`);
  console.log(
    `   Days span: ${Math.ceil((schedules[schedules.length - 1].time.getTime() - schedules[0].time.getTime()) / (1000 * 60 * 60 * 24))}`,
  );
}

scheduleUploads().catch(console.error);
