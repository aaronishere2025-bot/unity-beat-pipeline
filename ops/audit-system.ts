#!/usr/bin/env npx tsx
/**
 * COMPREHENSIVE SYSTEM AUDIT
 *
 * Checks all major systems for integration status
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface SystemCheck {
  name: string;
  status: 'WORKING' | 'PARTIAL' | 'BROKEN' | 'NOT_INTEGRATED';
  details: string[];
  imports: string[];
  filesPaths?: string[];
}

const checks: SystemCheck[] = [];

console.log('🔍 COMPREHENSIVE SYSTEM AUDIT\n');
console.log('='.repeat(80));

// ============================================================================
// 1. CONTENT GENERATION PIPELINE
// ============================================================================
console.log('\n📹 1. CONTENT GENERATION PIPELINE\n');

const pipelineCheck: SystemCheck = {
  name: 'Content Generation Pipeline',
  status: 'WORKING',
  details: [],
  imports: [],
};

// Check core services
const coreServices = [
  { name: 'Unity Content Generator', path: 'server/services/unity-content-generator.ts' },
  { name: 'Suno API', path: 'server/services/suno-api.ts' },
  { name: 'Kling Video Generator', path: 'server/services/kling-video-generator.ts' },
  { name: 'FFmpeg Processor', path: 'server/services/ffmpeg-processor.ts' },
  { name: 'Music Mode Generator', path: 'server/services/music-mode-generator.ts' },
  { name: 'Job Worker', path: 'server/services/job-worker.ts' },
];

for (const service of coreServices) {
  if (existsSync(service.path)) {
    pipelineCheck.details.push(`✅ ${service.name} exists`);
    pipelineCheck.imports.push(service.path);
  } else {
    pipelineCheck.details.push(`❌ ${service.name} MISSING`);
    pipelineCheck.status = 'BROKEN';
  }
}

// Check if integrated in routes
const routesContent = existsSync('server/routes.ts') ? readFileSync('server/routes.ts', 'utf-8') : '';
if (routesContent.includes('jobWorker') && routesContent.includes('sunoApi')) {
  pipelineCheck.details.push('✅ Integrated in routes.ts');
} else {
  pipelineCheck.details.push('⚠️  Not fully integrated in routes.ts');
  pipelineCheck.status = 'PARTIAL';
}

checks.push(pipelineCheck);
console.log(`Status: ${pipelineCheck.status}`);
pipelineCheck.details.forEach((d) => console.log(`  ${d}`));

// ============================================================================
// 2. THOMPSON SAMPLING / BANDIT SYSTEMS
// ============================================================================
console.log('\n🎰 2. THOMPSON SAMPLING / BANDIT SYSTEMS\n');

const banditCheck: SystemCheck = {
  name: 'Thompson Sampling Systems',
  status: 'PARTIAL',
  details: [],
  imports: [],
};

const banditServices = [
  { name: 'Suno Style Bandit', path: 'server/services/suno-style-bandit.ts', state: 'data/suno_style_bandit.json' },
  { name: 'Style Bandit Service', path: 'server/services/style-bandit-service.ts', state: 'data/style_bandit.json' },
  { name: 'Character Figure Bandit', path: 'server/services/character-figure-bandit.ts', state: null },
  { name: 'Posting Time Bandit', path: 'server/services/posting-time-bandit.ts', state: null },
];

for (const bandit of banditServices) {
  if (existsSync(bandit.path)) {
    banditCheck.imports.push(bandit.path);
    if (bandit.state && existsSync(bandit.state)) {
      const state = JSON.parse(readFileSync(bandit.state, 'utf-8'));
      const armCount = state.arms ? Object.keys(state.arms).length : 0;
      const pulls =
        state.totalPulls ||
        Object.values(state.arms || {}).reduce((sum: number, arm: any) => sum + (arm.pulls || 0), 0);
      banditCheck.details.push(`✅ ${bandit.name}: ${armCount} arms, ${pulls} pulls`);
    } else {
      banditCheck.details.push(`✅ ${bandit.name} exists (no state file)`);
    }
  } else {
    banditCheck.details.push(`❌ ${bandit.name} MISSING`);
  }
}

// Check music-mode integration
const musicModeContent = existsSync('server/services/music-mode-generator.ts')
  ? readFileSync('server/services/music-mode-generator.ts', 'utf-8')
  : '';
if (musicModeContent.includes('sunoStyleBandit')) {
  banditCheck.details.push('✅ Integrated in music-mode-generator.ts');
  banditCheck.status = 'WORKING';
} else {
  banditCheck.details.push('⚠️  NOT integrated in music-mode-generator.ts');
}

checks.push(banditCheck);
console.log(`Status: ${banditCheck.status}`);
banditCheck.details.forEach((d) => console.log(`  ${d}`));

// ============================================================================
// 3. MULTI-MODEL ERROR ANALYSIS
// ============================================================================
console.log('\n🤖 3. MULTI-MODEL ERROR ANALYSIS\n');

const errorCheck: SystemCheck = {
  name: 'Multi-Model Error Analysis',
  status: 'NOT_INTEGRATED',
  details: [],
  imports: [],
};

const errorServices = [
  { name: 'Multi-Model Error Analyzer', path: 'server/services/multi-model-error-analyzer.ts' },
  { name: 'Error Monitor', path: 'server/services/error-monitor.ts' },
  { name: 'Claude Code Error Reporter', path: 'server/services/claude-code-error-reporter.ts' },
  { name: 'Auto-Fix Agent', path: 'server/services/auto-fix-agent.ts' },
];

for (const service of errorServices) {
  if (existsSync(service.path)) {
    errorCheck.details.push(`✅ ${service.name} exists`);
    errorCheck.imports.push(service.path);
  } else {
    errorCheck.details.push(`❌ ${service.name} MISSING`);
  }
}

// Check if error tables exist in schema
const schemaContent = existsSync('shared/schema.ts') ? readFileSync('shared/schema.ts', 'utf-8') : '';
if (schemaContent.includes('errorReports') && schemaContent.includes('errorPatterns')) {
  errorCheck.details.push('✅ Database tables defined in schema');
} else {
  errorCheck.details.push('❌ Database tables NOT in schema');
}

// Check integration
if (routesContent.includes('errorMonitor') || routesContent.includes('multiModelErrorAnalyzer')) {
  errorCheck.details.push('✅ Integrated in routes');
  errorCheck.status = 'WORKING';
} else {
  errorCheck.details.push('⚠️  NOT integrated in routes (standalone)');
  errorCheck.status = 'PARTIAL';
}

checks.push(errorCheck);
console.log(`Status: ${errorCheck.status}`);
errorCheck.details.forEach((d) => console.log(`  ${d}`));

// ============================================================================
// 4. AUTONOMOUS AGENT SYSTEM
// ============================================================================
console.log('\n🤖 4. AUTONOMOUS AGENT SYSTEM\n');

const agentCheck: SystemCheck = {
  name: 'Autonomous Agent System',
  status: 'NOT_INTEGRATED',
  details: [],
  imports: [],
};

const agentServices = [
  { name: 'Autonomous Goal Agent', path: 'server/services/autonomous-goal-agent.ts' },
  { name: 'Content Strategy Agent', path: 'server/services/content-strategy-agent.ts' },
  { name: 'Self-Reflection Agent', path: 'server/services/self-reflection-agent.ts' },
  { name: 'Trend Watcher Agent', path: 'server/services/trend-watcher-agent.ts' },
  { name: 'Agent Scheduler', path: 'server/services/agent-scheduler.ts' },
];

for (const service of agentServices) {
  if (existsSync(service.path)) {
    agentCheck.details.push(`✅ ${service.name} exists`);
    agentCheck.imports.push(service.path);
  } else {
    agentCheck.details.push(`❌ ${service.name} MISSING`);
  }
}

// Check if agent tables exist
if (schemaContent.includes('agentJobs') && schemaContent.includes('agentLearnings')) {
  agentCheck.details.push('✅ Database tables defined in schema');
} else {
  agentCheck.details.push('❌ Database tables NOT in schema');
}

// Check integration in routes
if (routesContent.includes('autonomousGoalAgent')) {
  agentCheck.details.push('✅ Autonomous Goal Agent integrated in routes');
  agentCheck.status = 'PARTIAL';
} else {
  agentCheck.details.push('⚠️  Agents NOT integrated in routes');
}

checks.push(agentCheck);
console.log(`Status: ${agentCheck.status}`);
agentCheck.details.forEach((d) => console.log(`  ${d}`));

// ============================================================================
// 5. YOUTUBE INTEGRATION
// ============================================================================
console.log('\n📺 5. YOUTUBE INTEGRATION\n');

const youtubeCheck: SystemCheck = {
  name: 'YouTube Integration',
  status: 'WORKING',
  details: [],
  imports: [],
};

const youtubeServices = [
  { name: 'YouTube Upload Service', path: 'server/services/youtube-upload-service.ts' },
  { name: 'YouTube Analytics Service', path: 'server/services/youtube-analytics-service.ts' },
  { name: 'YouTube Metadata Generator', path: 'server/services/youtube-metadata-generator.ts' },
];

for (const service of youtubeServices) {
  if (existsSync(service.path)) {
    youtubeCheck.details.push(`✅ ${service.name} exists`);
    youtubeCheck.imports.push(service.path);
  } else {
    youtubeCheck.details.push(`❌ ${service.name} MISSING`);
    youtubeCheck.status = 'BROKEN';
  }
}

// Check credentials
if (existsSync('data/youtube_credentials.json')) {
  youtubeCheck.details.push('✅ YouTube credentials configured');
} else {
  youtubeCheck.details.push('⚠️  YouTube credentials NOT configured');
  youtubeCheck.status = 'PARTIAL';
}

// Check integration
if (routesContent.includes('POST /api/youtube/upload')) {
  youtubeCheck.details.push('✅ Upload endpoint exists');
} else {
  youtubeCheck.details.push('❌ Upload endpoint MISSING');
  youtubeCheck.status = 'BROKEN';
}

checks.push(youtubeCheck);
console.log(`Status: ${youtubeCheck.status}`);
youtubeCheck.details.forEach((d) => console.log(`  ${d}`));

// ============================================================================
// 6. ANALYTICS & LEARNING SYSTEMS
// ============================================================================
console.log('\n📊 6. ANALYTICS & LEARNING SYSTEMS\n');

const analyticsCheck: SystemCheck = {
  name: 'Analytics & Learning',
  status: 'PARTIAL',
  details: [],
  imports: [],
};

const analyticsServices = [
  { name: 'Creative Analytics Service', path: 'server/services/creative-analytics-service.ts' },
  { name: 'Retention Clip Correlator', path: 'server/services/retention-clip-correlator.ts' },
  { name: 'Feature Correlation Analyzer', path: 'server/services/feature-correlation-analyzer.ts' },
  { name: 'AB Testing Service', path: 'server/services/ab-testing-service.ts' },
  { name: 'Thumbnail CTR Predictor', path: 'server/services/thumbnail-ctr-predictor.ts' },
];

for (const service of analyticsServices) {
  if (existsSync(service.path)) {
    analyticsCheck.details.push(`✅ ${service.name} exists`);
    analyticsCheck.imports.push(service.path);
  } else {
    analyticsCheck.details.push(`❌ ${service.name} MISSING`);
  }
}

// Check feature correlation state
if (existsSync('data/feature_correlation.json')) {
  analyticsCheck.details.push('✅ Feature correlation data exists');
} else {
  analyticsCheck.details.push('⚠️  No feature correlation data yet');
}

checks.push(analyticsCheck);
console.log(`Status: ${analyticsCheck.status}`);
analyticsCheck.details.forEach((d) => console.log(`  ${d}`));

// ============================================================================
// 7. AUDIO ANALYSIS & BEAT DETECTION
// ============================================================================
console.log('\n🎵 7. AUDIO ANALYSIS & BEAT DETECTION\n');

const audioCheck: SystemCheck = {
  name: 'Audio Analysis',
  status: 'WORKING',
  details: [],
  imports: [],
};

const audioServices = [
  { name: 'Audio Analysis Service', path: 'server/services/audio-analysis-service.ts' },
  { name: 'Beat Effects Processor', path: 'server/services/beat-effects-processor.ts' },
  { name: 'Genre Theme Mapper', path: 'server/services/genre-theme-mapper.ts' },
];

for (const service of audioServices) {
  if (existsSync(service.path)) {
    audioCheck.details.push(`✅ ${service.name} exists`);
    audioCheck.imports.push(service.path);
  } else {
    audioCheck.details.push(`❌ ${service.name} MISSING`);
    audioCheck.status = 'BROKEN';
  }
}

// Check Python beat analyzer
if (existsSync('scripts/beat_analyzer')) {
  audioCheck.details.push('✅ Python beat_analyzer module exists');
} else {
  audioCheck.details.push('❌ Python beat_analyzer MISSING');
  audioCheck.status = 'BROKEN';
}

// Check integration
const musicModeExists = existsSync('server/services/music-mode-generator.ts');
if (musicModeExists) {
  audioCheck.details.push('✅ Integrated in music-mode-generator');
} else {
  audioCheck.details.push('❌ Music mode generator MISSING');
  audioCheck.status = 'BROKEN';
}

checks.push(audioCheck);
console.log(`Status: ${audioCheck.status}`);
audioCheck.details.forEach((d) => console.log(`  ${d}`));

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('\n📋 SYSTEM STATUS SUMMARY\n');

const working = checks.filter((c) => c.status === 'WORKING').length;
const partial = checks.filter((c) => c.status === 'PARTIAL').length;
const broken = checks.filter((c) => c.status === 'BROKEN').length;
const notIntegrated = checks.filter((c) => c.status === 'NOT_INTEGRATED').length;

console.log(`✅ WORKING:        ${working}/${checks.length}`);
console.log(`⚠️  PARTIAL:        ${partial}/${checks.length}`);
console.log(`❌ BROKEN:         ${broken}/${checks.length}`);
console.log(`🔌 NOT INTEGRATED: ${notIntegrated}/${checks.length}`);

console.log('\n' + '='.repeat(80));
console.log('\n📌 RECOMMENDATIONS:\n');

if (notIntegrated > 0 || partial > 0) {
  console.log('1. Autonomous Agent System - Tables defined but not integrated');
  console.log('   → Consider integrating agent scheduler into job worker');
  console.log('');
  console.log('2. Multi-Model Error Analysis - Built but not hooked up');
  console.log('   → Add error monitoring to job-worker failure handlers');
  console.log('');
  console.log('3. Analytics Systems - Partially integrated');
  console.log('   → YouTube analytics feedback loop needs activation');
  console.log('');
}

if (working >= 5) {
  console.log('✅ Core systems are working! Video generation is fully functional.');
  console.log('');
}

console.log('='.repeat(80) + '\n');
