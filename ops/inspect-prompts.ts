import { db } from './server/db.js';
import { unityContentPackages } from './shared/schema.js';
import { desc } from 'drizzle-orm';

async function inspectPrompts() {
  const packages = await db.select().from(unityContentPackages).orderBy(desc(unityContentPackages.createdAt)).limit(3);

  console.log('Detailed Prompt Inspection:');
  console.log('='.repeat(100));

  for (const pkg of packages) {
    console.log(`\n\nPackage: ${pkg.title?.substring(0, 60)}...`);
    console.log(`Topic: ${pkg.topic}`);

    const packageData = typeof pkg.packageData === 'string' ? JSON.parse(pkg.packageData) : pkg.packageData;

    if (packageData?.veoPrompts) {
      console.log(`\n📝 VEO PROMPTS (${packageData.veoPrompts.length} total):\n`);

      for (let i = 0; i < Math.min(5, packageData.veoPrompts.length); i++) {
        const prompt = packageData.veoPrompts[i];
        console.log(`Prompt ${i + 1}:`);
        console.log(`  Section: ${prompt.sectionName || 'N/A'}`);
        console.log(
          `  Text: ${prompt.text?.substring(0, 150) || prompt.prompt?.substring(0, 150) || JSON.stringify(prompt).substring(0, 150)}...`,
        );

        // Check for generic patterns
        const text = prompt.text || prompt.prompt || '';
        const isGeneric =
          text.includes('cinematic shot, high quality') ||
          text.includes('Slow motion tracking shot') ||
          text.includes('dramatic rim lighting');

        if (isGeneric) {
          console.log(`  ⚠️  WARNING: Generic/fallback pattern detected!`);
        }
        console.log('');
      }

      // Check for uniqueness
      const promptTexts = packageData.veoPrompts.map((p: any) => p.text || p.prompt || '');
      const unique = new Set(promptTexts);

      if (unique.size < promptTexts.length) {
        console.log(`⚠️  DUPLICATES: ${promptTexts.length - unique.size} duplicate prompts found!`);
      } else {
        console.log(`✅ All ${promptTexts.length} prompts are unique`);
      }

      // Check if they follow the 5W structure (who, what, when, where, why/how)
      console.log('\n📊 Analyzing prompt structure:');
      let withContext = 0;
      let withAction = 0;
      let generic = 0;

      for (const p of packageData.veoPrompts) {
        const text = (p.text || p.prompt || '').toLowerCase();

        // Check for context words (when/where)
        if (text.match(/\b(in|at|during|while|as|through|across)\b/)) withContext++;

        // Check for action verbs
        if (text.match(/\b(stands|walks|runs|fights|speaks|looks|moves|leads|commands)\b/)) withAction++;

        // Check for generic patterns
        if (text.includes('cinematic') || text.includes('high quality') || text.includes('dramatic lighting'))
          generic++;
      }

      console.log(`  Context (where/when): ${withContext}/${promptTexts.length} prompts`);
      console.log(`  Action verbs (what): ${withAction}/${promptTexts.length} prompts`);
      console.log(`  Generic fallback: ${generic}/${promptTexts.length} prompts`);

      if (generic > promptTexts.length * 0.3) {
        console.log('\n⚠️  HIGH GENERIC CONTENT: More than 30% of prompts are generic!');
      }
    }
  }
}

inspectPrompts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
