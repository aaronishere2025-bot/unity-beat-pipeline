#!/usr/bin/env tsx
import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function checkActualJob() {
  // Load the actual Pope Stephen VI job
  const [job] = await db.select().from(jobs).where(eq(jobs.id, '772612e0-8160-4cce-9162-5227ffe41982')).limit(1);

  if (!job) {
    console.log('❌ Job not found');
    return;
  }

  console.log('\n🎬 ===== ACTUAL JOB DATA =====\n');
  console.log('Job ID:', job.id);
  console.log('Script Name:', job.scriptName);
  console.log('Status:', job.status);
  console.log('Mode:', job.mode);
  console.log('Created:', job.createdAt.toLocaleString());

  const metadata = job.unityMetadata as any;
  console.log('\n🎭 Unity Metadata:');
  console.log('   Package ID:', metadata?.packageId || 'none');
  console.log('   Topic:', metadata?.topic || 'none');
  console.log('   Hook:', metadata?.hook || 'none');

  console.log('\n📝 Prompts:');
  const promptsData = job.prompts as any;
  if (promptsData && Array.isArray(promptsData)) {
    console.log(`   Total prompts: ${promptsData.length}\n`);

    // Check first 3 prompts for impossible actions
    const impossiblePatterns = [
      { pattern: /diving into.*pool/i, name: 'diving into pool' },
      { pattern: /flying\b/i, name: 'flying' },
      { pattern: /teleport/i, name: 'teleporting' },
      { pattern: /levitat/i, name: 'levitating' },
    ];

    let foundIssues = 0;

    promptsData.slice(0, 5).forEach((p: any, i: number) => {
      const text = p.fullPrompt || p.prompt || p;
      console.log(`\n   Prompt ${i + 1}:`);
      console.log(`   ${text.substring(0, 200)}`);

      // Check for impossible actions
      for (const { pattern, name } of impossiblePatterns) {
        if (pattern.test(text)) {
          foundIssues++;
          console.log(`   ⚠️  FOUND: ${name}`);
        }
      }
    });

    console.log(`\n\n📊 Analysis:`);
    console.log(`   Prompts analyzed: ${Math.min(5, promptsData.length)}`);
    console.log(`   Impossible actions found: ${foundIssues}`);

    if (foundIssues > 0) {
      console.log(`\n   ❌ These issues would be caught by NEW validation system`);
      console.log(`   ✅ NEW SYSTEM: Would regenerate these prompts automatically`);
    }
  } else {
    console.log('   ⚠️  No prompts in job data');
  }

  // Check if prompts mention character types
  console.log('\n\n🔍 Character Type Analysis from Prompts:');
  if (promptsData && Array.isArray(promptsData)) {
    const allText = promptsData
      .map((p: any) => p.fullPrompt || p.prompt || p)
      .join(' ')
      .toLowerCase();

    const animalWords = ['guffaw', 'barkley', 'sprout', 'bird', 'dog', 'cat', 'creature', 'animal', 'anthropomorphic'];
    const humanWords = ['pope', 'man', 'woman', 'person', 'priest', 'cardinal'];

    console.log('   Animal/Creature mentions:');
    animalWords.forEach((word) => {
      if (allText.includes(word)) {
        console.log(`      - "${word}" found`);
      }
    });

    console.log('\n   Human mentions:');
    humanWords.forEach((word) => {
      if (allText.includes(word)) {
        console.log(`      - "${word}" found`);
      }
    });
  }

  console.log('\n✅ ===== CHECK COMPLETE =====\n');
}

checkActualJob().catch(console.error);
