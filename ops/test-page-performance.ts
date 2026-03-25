import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface PageMetrics {
  page: string;
  url: string;
  responseTime: number;
  dataTransferred: number;
  status: number;
}

async function measurePageLoad(url: string, pageName: string): Promise<PageMetrics> {
  const start = Date.now();

  try {
    const { stdout } = await execAsync(`curl -s -o /dev/null -w "%{http_code}|%{size_download}|%{time_total}" ${url}`, {
      timeout: 10000,
    });

    const [status, size, time] = stdout.trim().split('|');
    const responseTime = Date.now() - start;

    return {
      page: pageName,
      url,
      responseTime,
      dataTransferred: parseInt(size),
      status: parseInt(status),
    };
  } catch (error) {
    return {
      page: pageName,
      url,
      responseTime: -1,
      dataTransferred: 0,
      status: 0,
    };
  }
}

async function runPerformanceTests() {
  console.log('⚡ Performance Testing - New Pages\n');
  console.log('Testing against: http://localhost:8080\n');

  const pages = [
    { name: 'Dashboard (baseline)', url: 'http://localhost:8080/' },
    { name: 'Beat Hub', url: 'http://localhost:8080/beat-hub' },
    { name: 'Upload & Analytics', url: 'http://localhost:8080/upload-analytics' },
    { name: 'Admin Panel', url: 'http://localhost:8080/admin-panel' },
    { name: 'Jobs Page (baseline)', url: 'http://localhost:8080/jobs' },
  ];

  const results: PageMetrics[] = [];

  for (const page of pages) {
    process.stdout.write(`Testing ${page.name}...`);
    const metrics = await measurePageLoad(page.url, page.name);
    results.push(metrics);

    if (metrics.status === 200) {
      console.log(` ✓ (${metrics.responseTime}ms, ${(metrics.dataTransferred / 1024).toFixed(1)}KB)`);
    } else {
      console.log(` ✗ (${metrics.status})`);
    }
  }

  console.log('\n📊 Performance Summary:\n');
  console.log('┌─────────────────────────────┬──────────┬──────────┬────────┐');
  console.log('│ Page                        │ Time (ms)│ Size (KB)│ Status │');
  console.log('├─────────────────────────────┼──────────┼──────────┼────────┤');

  results.forEach((r) => {
    const pageName = r.page.padEnd(27);
    const time = r.responseTime.toString().padStart(8);
    const size = (r.dataTransferred / 1024).toFixed(1).padStart(8);
    const status = r.status.toString().padStart(6);
    console.log(`│ ${pageName} │ ${time} │ ${size} │ ${status} │`);
  });

  console.log('└─────────────────────────────┴──────────┴──────────┴────────┘');

  // Performance analysis
  const avgTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
  const maxTime = Math.max(...results.map((r) => r.responseTime));
  const slowPage = results.find((r) => r.responseTime === maxTime);

  console.log('\n🔍 Analysis:');
  console.log(`  Average load time: ${avgTime.toFixed(0)}ms`);
  console.log(`  Slowest page: ${slowPage?.page} (${maxTime}ms)`);

  if (maxTime > 1000) {
    console.log(`  ⚠️  WARNING: ${slowPage?.page} takes over 1 second to load`);
  } else if (maxTime > 500) {
    console.log(`  ⚠️  Note: ${slowPage?.page} is slightly slow (>500ms)`);
  } else {
    console.log(`  ✓ All pages load in under 500ms - Excellent!`);
  }

  // Check for large pages
  const largePage = results.reduce((max, r) => (r.dataTransferred > max.dataTransferred ? r : max));
  if (largePage.dataTransferred > 500 * 1024) {
    console.log(
      `  ⚠️  ${largePage.page} is large (${(largePage.dataTransferred / 1024).toFixed(1)}KB) - consider code splitting`,
    );
  }

  process.exit(0);
}

runPerformanceTests().catch(console.error);
