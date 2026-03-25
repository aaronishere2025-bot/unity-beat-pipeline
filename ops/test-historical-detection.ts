import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function testHistoricalDetection() {
  console.log('🧪 Testing historical figure detection fixes...\n');

  await initializeSecretsFromGCP();

  const { isHistoricalContent, detectHistoricalFigure } = await import('./server/services/unity-content-generator');
  const { UnityContentGenerator } = await import('./server/services/unity-content-generator');

  const generator = new UnityContentGenerator();

  const testCases = [
    'Khutulun, Mongol Princess',
    'Prince Vlad the Impaler',
    'Empress Wu Zetian',
    'Duke of Wellington',
    'Samurai Miyamoto Musashi',
    'Viking Ragnar Lothbrok',
    'Gladiator Spartacus',
    'Khan Genghis',
  ];

  console.log('📋 Testing historical keyword detection:\n');

  for (const testCase of testCases) {
    const isHistorical = isHistoricalContent(testCase);
    const figureData = detectHistoricalFigure(testCase);

    console.log(`   ${testCase}:`);
    console.log(`      isHistoricalContent: ${isHistorical ? '✅ YES' : '❌ NO'}`);
    console.log(
      `      detectHistoricalFigure: ${figureData ? '✅ Found in database' : '⚠️  Not in database (will use AI)'}`,
    );

    // Test character analysis
    const analysis = await generator.analyzeContentCharacters(testCase);
    console.log(`      Character type: ${analysis.characterType}`);
    console.log(`      Reasoning: ${analysis.reasoning.substring(0, 80)}...`);
    console.log('');
  }

  console.log('✅ Test complete!');
  process.exit(0);
}

testHistoricalDetection();
