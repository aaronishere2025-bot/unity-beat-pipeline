/**
 * Test Beat Visual Learning System
 *
 * Shows how the system learns from YouTube analytics to improve
 * Kling video generation for beat videos.
 */

import { beatVisualOptimizer } from './server/services/beat-visual-optimizer.js';

async function demo() {
  console.log('🎨 BEAT VISUAL LEARNING SYSTEM\n');
  console.log('This system learns from YouTube analytics to generate better Kling videos.\n');
  console.log('==========================================\n');

  // Step 1: Record the failed lofi video performance
  console.log('📊 STEP 1: Record Performance Data');
  console.log('------------------------------------------');
  console.log('Recording your failed lofi video:');
  console.log('  - 184 impressions');
  console.log('  - 1 click (0.5% CTR) ❌');
  console.log('  - 5 second watch time ❌');
  console.log('');

  // Note: This would actually record to database
  await beatVisualOptimizer.recordVideoPerformance(
    'd920a422-ccc9-4eea-b165-90ad485cd121',
    'YOUR_YOUTUBE_VIDEO_ID', // Replace with actual
    {
      impressions: 184,
      clicks: 1,
      avgViewDuration: 5,
      views: 2,
    },
  );

  // Step 2: Analyze what visual styles work best
  console.log('\n📈 STEP 2: Analyze Visual Performance');
  console.log('------------------------------------------');
  const performance = await beatVisualOptimizer.analyzeVisualPerformance();

  if (performance.length === 0) {
    console.log('No performance data yet (first video)');
  }

  // Step 3: Generate optimized prompt for next beat
  console.log('\n🎯 STEP 3: Generate Optimized Kling Prompt');
  console.log('------------------------------------------');
  console.log('Generating prompt for new lofi beat (85 BPM)...\n');

  const optimized = await beatVisualOptimizer.generateOptimizedPrompt('lofi', 85);

  console.log('✅ OPTIMIZED PROMPT:');
  console.log(`\n"${optimized.prompt}"\n`);
  console.log(`📊 Expected CTR: ${optimized.expectedCTR.toFixed(1)}%`);
  console.log(`🎨 Visual Style: ${optimized.style}`);
  console.log(`💡 Reasoning: ${optimized.reasoning}`);
  console.log(`📈 Based on ${optimized.basedOnSamples} videos\n`);

  // Step 4: Show the learning loop
  console.log('🔄 STEP 4: The Learning Loop');
  console.log('------------------------------------------');
  console.log('1. Generate beat with Kling video (using optimized prompt)');
  console.log('2. Upload to YouTube');
  console.log('3. Collect analytics after 24 hours');
  console.log('4. Record performance (CTR, retention, watch time)');
  console.log('5. System learns which visuals work best');
  console.log('6. Next video uses improved prompt');
  console.log('7. Repeat → System gets smarter over time\n');

  // Step 5: Show what to test
  console.log('🧪 STEP 5: Recommended Visual Tests');
  console.log('------------------------------------------');
  console.log('Test these visual themes for lofi beats:\n');

  const themes = [
    {
      theme: 'Rain + Window',
      prompt:
        'Rain droplets sliding down window, cozy bedroom interior visible through glass, warm lamp glow, vinyl player spinning, aesthetic lofi vibe, 4K cinematic, seamless loop',
      hypothesis: 'Rain visuals are calming and popular in lofi community',
    },
    {
      theme: 'Coffee Shop',
      prompt:
        'Coffee shop interior, steam rising from cup, people working on laptops blurred in background, warm lighting, aesthetic cafe vibe, 4K cinematic, seamless loop',
      hypothesis: 'Study/work setting resonates with target audience',
    },
    {
      theme: 'City Night',
      prompt:
        'City lights bokeh effect from high window, nighttime urban landscape, warm interior with plants, cozy aesthetic, lofi vibe, 4K cinematic, seamless loop',
      hypothesis: 'Urban night aesthetic is trendy and visually striking',
    },
    {
      theme: 'Nature Zen',
      prompt:
        'Peaceful nature scene, gentle river flowing, cherry blossoms falling, warm sunset lighting, serene atmosphere, aesthetic lofi vibe, 4K cinematic, seamless loop',
      hypothesis: 'Nature visuals maximize relaxation and retention',
    },
  ];

  themes.forEach((t, i) => {
    console.log(`${i + 1}. ${t.theme}`);
    console.log(`   Prompt: "${t.prompt}"`);
    console.log(`   Hypothesis: ${t.hypothesis}\n`);
  });

  console.log('💡 TIP: Generate 1 beat with each theme, track which gets:');
  console.log('   - Highest CTR (thumbnail appeal)');
  console.log('   - Longest watch time (engagement)');
  console.log('   - Most views (overall performance)\n');

  console.log('🎯 NEXT STEPS:');
  console.log('------------------------------------------');
  console.log('1. Upload your failed lofi video to YouTube (if not already)');
  console.log('2. Wait 24 hours for analytics data');
  console.log('3. Run: npm run jobs:check-analytics-loop');
  console.log('4. Generate 4 new beats with different visual themes');
  console.log('5. Compare performance after 48 hours');
  console.log('6. System automatically learns which works best\n');

  console.log('✅ The system will remember:');
  console.log('   - "Rain + Window" got 8% CTR → Use more rain visuals');
  console.log('   - "Coffee Shop" got 2% CTR → Avoid coffee themes');
  console.log('   - "City Night" had 65s watch time → Prioritize this style');
  console.log('');
}

demo().catch(console.error);
