import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function testTopicDiscovery() {
  console.log('🔐 Loading secrets...');
  await initializeSecretsFromGCP();
  console.log('✅ Secrets loaded\n');

  const { topicDiscoveryAgent } = await import('./server/services/topic-discovery-agent');

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      TESTING TOPIC DISCOVERY WITH DEDUPLICATION           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('🔍 Discovering 5 fresh topics (90-day deduplication)...\n');

  try {
    const result = await topicDiscoveryAgent.discoverTopics(5, 90, false);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║      DISCOVERY RESULTS                                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`✅ Found ${result.topics.length} fresh topics`);
    console.log(`📊 Recent topics checked: ${result.recentTopicsCount}`);
    console.log(`⏭️  Topics filtered out: ${result.filteredCount}`);
    console.log(`⏱️  Execution time: ${result.executionTimeMs}ms\n`);

    console.log('📋 SELECTED TOPICS:\n');
    result.topics.forEach((topic, i) => {
      console.log(`${i + 1}. ${topic.figure} (${topic.era}, ${topic.intent})`);
      console.log(`   Hook: "${topic.hook}"`);
      console.log(`   Angle: ${topic.angle}`);
      console.log(`   Viral Score: ${topic.viralPotential}/10`);
      console.log(`   Reasoning: ${topic.reasoning}`);
      console.log();
    });

    console.log('✅ Topic discovery completed successfully!');
    console.log('\n💡 Note: "Genghis Khan" should NOT appear in the list above');
    console.log('   (used recently on 12/29/2025 and 1/1/2026)\n');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testTopicDiscovery();
