/**
 * TEST: Drift Detection System
 *
 * Tests KL divergence tracking between channels to detect if
 * clustering results are channel-dependent.
 */

import { clusteringDriftDetector } from './server/services/clustering-drift-detector';

async function testDriftDetection() {
  console.log('🧪 TESTING DRIFT DETECTION SYSTEM\n');
  console.log('='.repeat(60));

  // Simulate cluster assignments for 3 channels
  console.log('\n📊 Simulating cluster assignments for 3 channels...\n');

  // Channel A: Heavily prefers Cluster 2 (chill lofi)
  console.log('Channel A: Lofi Chill Focus');
  for (let i = 0; i < 50; i++) {
    await clusteringDriftDetector.recordChannelCluster('channel_a', 'lofi', 2);
  }
  for (let i = 0; i < 15; i++) {
    await clusteringDriftDetector.recordChannelCluster('channel_a', 'lofi', 3);
  }
  for (let i = 0; i < 10; i++) {
    await clusteringDriftDetector.recordChannelCluster('channel_a', 'lofi', 1);
  }

  // Channel B: Prefers Cluster 3 (energetic lofi)
  console.log('Channel B: Energetic Lofi');
  for (let i = 0; i < 45; i++) {
    await clusteringDriftDetector.recordChannelCluster('channel_b', 'lofi', 3);
  }
  for (let i = 0; i < 20; i++) {
    await clusteringDriftDetector.recordChannelCluster('channel_b', 'lofi', 2);
  }
  for (let i = 0; i < 10; i++) {
    await clusteringDriftDetector.recordChannelCluster('channel_b', 'lofi', 4);
  }

  // Channel C: Similar to Channel A (should have low drift)
  console.log('Channel C: Also Chill Lofi');
  for (let i = 0; i < 48; i++) {
    await clusteringDriftDetector.recordChannelCluster('channel_c', 'lofi', 2);
  }
  for (let i = 0; i < 18; i++) {
    await clusteringDriftDetector.recordChannelCluster('channel_c', 'lofi', 3);
  }
  for (let i = 0; i < 9; i++) {
    await clusteringDriftDetector.recordChannelCluster('channel_c', 'lofi', 1);
  }

  console.log('\n✅ Simulated 225 videos across 3 channels\n');

  // Print distributions
  console.log('='.repeat(60));
  clusteringDriftDetector.printDistribution('channel_a', 'lofi');
  clusteringDriftDetector.printDistribution('channel_b', 'lofi');
  clusteringDriftDetector.printDistribution('channel_c', 'lofi');

  // Calculate drift between all pairs
  console.log('\n' + '='.repeat(60));
  console.log('🔍 CALCULATING KL DIVERGENCE BETWEEN CHANNELS\n');

  const driftAB = await clusteringDriftDetector.calculateDrift('channel_a', 'channel_b', 'lofi');
  const driftAC = await clusteringDriftDetector.calculateDrift('channel_a', 'channel_c', 'lofi');
  const driftBC = await clusteringDriftDetector.calculateDrift('channel_b', 'channel_c', 'lofi');

  if (driftAB) {
    console.log('\n📊 Channel A ↔ Channel B:');
    console.log(`   KL(A→B): ${driftAB.klDivergenceAtoB.toFixed(4)}`);
    console.log(`   KL(B→A): ${driftAB.klDivergenceBtoA.toFixed(4)}`);
    console.log(`   Symmetric KL: ${driftAB.symmetricKL.toFixed(4)}`);
    console.log(`   Severity: ${driftAB.severity.toUpperCase()}`);
    console.log(`   Drifting: ${driftAB.isDrifting ? '⚠️  YES' : '✅ NO'}`);
  }

  if (driftAC) {
    console.log('\n📊 Channel A ↔ Channel C:');
    console.log(`   KL(A→C): ${driftAC.klDivergenceAtoB.toFixed(4)}`);
    console.log(`   KL(C→A): ${driftAC.klDivergenceBtoA.toFixed(4)}`);
    console.log(`   Symmetric KL: ${driftAC.symmetricKL.toFixed(4)}`);
    console.log(`   Severity: ${driftAC.severity.toUpperCase()}`);
    console.log(`   Drifting: ${driftAC.isDrifting ? '⚠️  YES' : '✅ NO'}`);
  }

  if (driftBC) {
    console.log('\n📊 Channel B ↔ Channel C:');
    console.log(`   KL(B→C): ${driftBC.klDivergenceAtoB.toFixed(4)}`);
    console.log(`   KL(C→B): ${driftBC.klDivergenceBtoA.toFixed(4)}`);
    console.log(`   Symmetric KL: ${driftBC.symmetricKL.toFixed(4)}`);
    console.log(`   Severity: ${driftBC.severity.toUpperCase()}`);
    console.log(`   Drifting: ${driftBC.isDrifting ? '⚠️  YES' : '✅ NO'}`);
  }

  // Generate alerts
  console.log('\n' + '='.repeat(60));
  console.log('🚨 DRIFT ALERTS\n');

  const allDrift = [driftAB, driftAC, driftBC].filter((d) => d !== null) as any[];
  const alerts = await clusteringDriftDetector.generateAlerts(allDrift);

  if (alerts.length === 0) {
    console.log('✅ No critical drift detected. Clusters are channel-independent.');
  } else {
    for (const alert of alerts) {
      console.log(`⚠️  ${alert.reason}`);
      console.log(`   Recommendation: ${alert.recommendation}\n`);
    }
  }

  // Interpretation
  console.log('\n' + '='.repeat(60));
  console.log('💡 INTERPRETATION\n');
  console.log('Low KL (<0.1): Channels have similar winning strategies');
  console.log('   → Clusters are channel-independent (GOOD)');
  console.log('   → You found "Universal Bangers" that work anywhere\n');
  console.log('Moderate KL (0.1-0.3): Some divergence, acceptable');
  console.log('   → Channels may have slight audience differences\n');
  console.log('High KL (0.3-0.5): Significant drift');
  console.log('   → Different audiences prefer different content\n');
  console.log('Critical KL (>0.8): Completely different strategies');
  console.log('   → Clusters are channel-dependent (BAD)');
  console.log('   → Need separate clustering per channel\n');

  console.log('='.repeat(60));
  console.log('✅ Test complete!\n');
}

// Run test
testDriftDetection().catch(console.error);
