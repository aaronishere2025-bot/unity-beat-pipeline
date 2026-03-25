import axios from 'axios';
import fs from 'fs';

async function testLofi() {
  console.log('Testing lofi with videoPath/thumbnailPath fix\n');

  const jobData = {
    mode: 'music',
    scriptName: 'Lofi Paths Fix Test - Jan 22',
    scriptContent: 'lofi jazz, 75 BPM, smooth piano, target 3:00 length',
    aspectRatio: '16:9',
    autoUpload: false,
  };

  console.log('Creating job...');
  const createRes = await axios.post('http://localhost:8080/api/jobs', jobData);
  const jobId = createRes.data.data.id;

  console.log('Job created:', jobId, '\n');

  let attempts = 0;
  while (attempts < 60) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await axios.get('http://localhost:8080/api/jobs/' + jobId);
    const job = statusRes.data.data;

    const num = attempts + 1;
    console.log('[' + num + '] ' + job.status + ' | ' + job.progress + '% | ' + (job.progressMessage || ''));

    if (job.status === 'completed') {
      console.log('\n✅ COMPLETED!\n');
      console.log('videoPath:', job.videoPath || 'NOT SET');
      console.log('thumbnailPath:', job.thumbnailPath || 'NOT SET');
      console.log('duration:', job.duration + 's');
      console.log('cost: $' + job.cost);

      if (job.videoPath && fs.existsSync(job.videoPath)) {
        const stats = fs.statSync(job.videoPath);
        console.log('\nVideo file exists:', (stats.size / 1024 / 1024).toFixed(2) + ' MB');
      }

      if (job.videoPath && job.thumbnailPath) {
        console.log('\n🎉 SUCCESS! Paths are saved!\n');
        process.exit(0);
      } else {
        console.log('\nFAILED! Paths not saved.\n');
        process.exit(1);
      }
    } else if (job.status === 'failed') {
      console.log('\nFAILED!');
      console.log('Error:', job.error);
      process.exit(1);
    }

    attempts++;
  }
}

testLofi();
