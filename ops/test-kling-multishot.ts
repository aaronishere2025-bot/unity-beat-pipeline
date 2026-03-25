/**
 * Test Script: Kling 3.0 Multi-Shot API Format Discovery
 *
 * Probes kie.ai with 3 different multi-shot payload formats to discover
 * the correct API format before building the full pipeline.
 *
 * Cost: Max 300 credits (3 × 5s clips @ 100 credits each)
 *
 * Run: npx tsx test-kling-multishot.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { initializeSecretsWithFallback } from './server/secret-manager-loader.js';

const KIE_BASE_URL = 'https://api.kie.ai';
const CREATE_ENDPOINT = '/api/v1/jobs/createTask';
const STATUS_ENDPOINT = '/api/v1/jobs/recordInfo';

async function getHeaders() {
  const key = process.env.KLING_ACCESS_KEY;
  if (!key) throw new Error('KLING_ACCESS_KEY not set');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
}

async function submitTask(label: string, payload: any): Promise<{ taskId?: string; response: any; error?: string }> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Payload:\n${JSON.stringify(payload, null, 2)}`);

  try {
    const headers = await getHeaders();
    const response = await axios.post(`${KIE_BASE_URL}${CREATE_ENDPOINT}`, payload, {
      headers,
      timeout: 30000,
    });

    console.log(`\nResponse (${response.status}):\n${JSON.stringify(response.data, null, 2)}`);

    if (response.data.code !== 200) {
      return { response: response.data, error: response.data.msg || 'Non-200 code' };
    }

    const taskId = response.data.data?.taskId;
    if (!taskId) {
      return { response: response.data, error: 'No taskId in response' };
    }

    console.log(`\nTask ID: ${taskId}`);
    return { taskId, response: response.data };
  } catch (err: any) {
    const errData = err.response?.data || err.message;
    console.error(`\nERROR (${err.response?.status || 'network'}):\n${JSON.stringify(errData, null, 2)}`);
    return { response: errData, error: String(errData) };
  }
}

async function pollOnce(taskId: string): Promise<any> {
  console.log(`\nPolling task ${taskId}...`);
  try {
    const headers = await getHeaders();
    const response = await axios.get(`${KIE_BASE_URL}${STATUS_ENDPOINT}?taskId=${taskId}`, {
      headers,
      timeout: 30000,
    });
    console.log(`Poll response:\n${JSON.stringify(response.data, null, 2)}`);
    return response.data;
  } catch (err: any) {
    console.error(`Poll error: ${err.message}`);
    return null;
  }
}

async function waitForResult(taskId: string, maxPolls: number = 60): Promise<any> {
  console.log(`\nWaiting for task ${taskId} to complete (max ${maxPolls} polls)...`);
  for (let i = 0; i < maxPolls; i++) {
    const interval = i < 10 ? 3000 : 5000;
    await new Promise((r) => setTimeout(r, interval));

    const result = await pollOnce(taskId);
    if (!result || result.code !== 200) continue;

    const state = (result.data?.state || '').toLowerCase();
    if (state === 'success') {
      console.log(`\nTask completed successfully!`);
      return result;
    }
    if (state === 'fail' || state === 'failed' || state === 'error') {
      console.log(`\nTask failed: ${result.data?.failMsg || 'unknown'}`);
      return result;
    }

    if (i % 5 === 0) {
      console.log(`   Poll ${i + 1}: state=${state}`);
    }
  }
  console.log(`\nTimeout after ${maxPolls} polls`);
  return null;
}

const TEST_PROMPT_BASE =
  'Ancient Roman soldier walking through a stone archway into a sunlit courtyard, cinematic composition, photorealistic detail';

async function main() {
  // Load .env first as direct fallback, then try GCP
  dotenv.config();
  await initializeSecretsWithFallback();

  console.log('=== Kling 3.0 Multi-Shot API Format Discovery ===');
  console.log(`Cost budget: 300 credits (3 × 5s clips @ 100 credits each)\n`);

  const results: Array<{ label: string; accepted: boolean; taskId?: string; error?: string; finalResult?: any }> = [];

  // ── Test 1: Simple flag toggle ──────────────────────────────────
  // Same payload as existing single-shot but with multi_shots: true
  const test1Payload = {
    model: 'kling-3.0/video',
    input: {
      prompt: `${TEST_PROMPT_BASE}. Avoid: blurry, low quality, distorted faces, watermark`,
      aspect_ratio: '9:16',
      duration: '5',
      sound: false,
      mode: 'std',
      multi_shots: true,
      image_urls: [],
    },
  };

  const test1 = await submitTask('Test 1: multi_shots=true (flag only, single prompt)', test1Payload);
  results.push({ label: 'Flag only', accepted: !!test1.taskId, taskId: test1.taskId, error: test1.error });

  // ── Test 2: Shot markers in prompt ──────────────────────────────
  // multi_shots: true with [Shot N] markers embedded in the prompt text
  const test2Prompt = [
    '[Shot 1] Ancient Roman soldier approaches a massive stone archway, medium shot, determined expression, morning light filtering through',
    '[Shot 2] Soldier walks through the archway into a sunlit courtyard, tracking shot following from behind, dust particles in light beams',
    '[Shot 3] Soldier stops in center of courtyard and looks up at towering marble columns, wide angle, golden hour lighting',
  ].join('. ');

  const test2Payload = {
    model: 'kling-3.0/video',
    input: {
      prompt: `${test2Prompt}. Avoid: blurry, low quality, distorted faces, watermark`,
      aspect_ratio: '9:16',
      duration: '5',
      sound: false,
      mode: 'std',
      multi_shots: true,
      image_urls: [],
    },
  };

  const test2 = await submitTask('Test 2: multi_shots=true + [Shot N] markers in prompt', test2Payload);
  results.push({ label: 'Shot markers in prompt', accepted: !!test2.taskId, taskId: test2.taskId, error: test2.error });

  // ── Test 3: Shots array in input ──────────────────────────────
  // multi_shots: true with a separate shots[] array in the input object
  const test3Payload = {
    model: 'kling-3.0/video',
    input: {
      prompt: 'Ancient Roman soldier walking through architecture, cinematic. Avoid: blurry, low quality',
      aspect_ratio: '9:16',
      duration: '5',
      sound: false,
      mode: 'std',
      multi_shots: true,
      shots: [
        { prompt: 'Ancient Roman soldier approaches a massive stone archway, medium shot, determined expression' },
        { prompt: 'Soldier walks through the archway into a sunlit courtyard, tracking shot, dust in light beams' },
        { prompt: 'Soldier stops in center of courtyard looking up at marble columns, wide angle, golden hour' },
      ],
      image_urls: [],
    },
  };

  const test3 = await submitTask('Test 3: multi_shots=true + shots[] array in input', test3Payload);
  results.push({ label: 'Shots array', accepted: !!test3.taskId, taskId: test3.taskId, error: test3.error });

  // ── Wait for accepted tasks to complete ──────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('WAITING FOR RESULTS');
  console.log(`${'='.repeat(60)}`);

  for (const result of results) {
    if (result.taskId) {
      console.log(`\n--- Waiting for: ${result.label} (${result.taskId}) ---`);
      result.finalResult = await waitForResult(result.taskId);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);

  for (const result of results) {
    const status = result.accepted
      ? result.finalResult?.data?.state === 'success'
        ? 'SUCCESS'
        : result.finalResult?.data?.state?.toUpperCase() || 'PENDING'
      : 'REJECTED';

    console.log(`\n  ${result.label}:`);
    console.log(`    Accepted: ${result.accepted ? 'YES' : 'NO'}`);
    console.log(`    Status: ${status}`);
    if (result.error) console.log(`    Error: ${result.error}`);
    if (result.finalResult?.data?.resultJson) {
      console.log(`    Result JSON: ${JSON.stringify(result.finalResult.data.resultJson).substring(0, 200)}`);
    }
    if (result.finalResult?.data?.failMsg) {
      console.log(`    Fail message: ${result.finalResult.data.failMsg}`);
    }
  }

  console.log(`\n\nDONE. Review results above to determine correct multi-shot payload format.`);
  console.log(`If multiple formats succeed, prefer the one with native scene transitions.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
