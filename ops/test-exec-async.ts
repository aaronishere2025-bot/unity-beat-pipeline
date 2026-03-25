#!/usr/bin/env tsx
/**
 * Test execAsync directly
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

async function testExecAsync() {
  const audioPath = join(process.cwd(), 'data', 'temp', 'processing', 'test_beat_1768600901264.mp3');
  const scriptDir = join(process.cwd(), 'scripts');
  const pythonPath = '../venv/bin/python';

  console.log('🧪 Testing execAsync directly...\n');
  console.log(`Script dir: ${scriptDir}`);
  console.log(`Python: ${pythonPath}`);
  console.log(`Audio: ${audioPath}\n`);

  const command = `cd ${scriptDir} && ${pythonPath} -m beat_analyzer.cli "${audioPath}" --quiet`;
  console.log(`Command: ${command}\n`);

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });

    console.log('✅ Command succeeded!');
    console.log(`\nstdout length: ${stdout.length} bytes`);
    console.log(`stderr length: ${stderr.length} bytes`);

    if (stderr) {
      console.log(`\nstderr content:\n${stderr}`);
    }

    const result = JSON.parse(stdout);
    console.log(`\n📊 Result:`);
    console.log(`   BPM: ${result.bpm}`);
    console.log(`   Key: ${result.key}`);
    console.log(`   Duration: ${result.duration}s`);
  } catch (error: any) {
    console.error('❌ Command failed!');
    console.error(`\nError message: ${error.message}`);
    console.error(`Error code: ${error.code}`);
    console.error(`Error signal: ${error.signal}`);

    if (error.stdout) {
      console.error(`\nstdout (${error.stdout.length} bytes):\n${error.stdout.substring(0, 500)}`);
    }
    if (error.stderr) {
      console.error(`\nstderr (${error.stderr.length} bytes):\n${error.stderr}`);
    }
  }
}

testExecAsync().catch(console.error);
