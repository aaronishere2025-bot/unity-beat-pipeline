import { topicDiscoveryAgent } from './server/services/topic-discovery-agent';
import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function testTopicDiscovery() {
  console.log('🔐 Loading secrets...\n');
  await initializeSecretsFromGCP();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TESTING TOPIC DISCOVERY AGENT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Discover 5 fresh topics with 90-day deduplication
    const result = await topicDiscoveryAgent.discoverTopics(5, 90);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    DISCOVERY RESULTS                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 Stats:`);
    console.log(`   - Topics found: ${result.topics.length}`);
    console.log(`   - Recent topics checked: ${result.recentTopicsCount}`);
    console.log(`   - Filtered duplicates: ${result.filteredCount}`);
    console.log(`   - Execution time: ${result.executionTimeMs}ms\n`);

    console.log('✨ Fresh Topics:\n');

    result.topics.forEach((topic, i) => {
      console.log(`━━━ ${i + 1}. ${topic.figure} ━━━`);
      console.log(`   Era: ${topic.era} | Intent: ${topic.intent}`);
      console.log(`   Viral Score: ${topic.viralPotential}/10`);
      console.log(`   Hook: "${topic.hook}"`);
      console.log(`   Angle: ${topic.angle}`);
      console.log(`   Keywords: ${topic.keywords.join(', ')}`);
      console.log(`   Why viral: ${topic.reasoning}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Topic discovery test complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

testTopicDiscovery();
