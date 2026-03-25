import { autonomousGoalAgent } from './server/services/autonomous-goal-agent';

const REMAINING = [
  { figure: 'Joan of Arc', intent: 'inspirational' as const },
  { figure: 'Sun Tzu', intent: 'educational' as const },
  { figure: 'Ramses II', intent: 'dramatic' as const },
  { figure: 'Leonardo da Vinci', intent: 'viral' as const, isLong: true },
];

async function createPackages() {
  console.log('Creating 4 remaining packages for tomorrow...\n');

  for (const config of REMAINING) {
    console.log(`\n━━━ ${config.figure} ━━━`);
    try {
      const result = await autonomousGoalAgent.createPackageFromGoal({
        figure: config.figure,
        intent: config.intent,
        constraints: {
          maxDuration: config.isLong ? 180 : 60,
          aspectRatio: config.isLong ? '16:9' : '9:16',
        },
      });
      console.log(`✅ ${result.packageId}`);
    } catch (e: any) {
      console.log(`❌ ${e.message.substring(0, 60)}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('\n✅ Done!');
}

createPackages()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
