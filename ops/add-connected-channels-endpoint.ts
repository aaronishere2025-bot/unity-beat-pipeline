#!/usr/bin/env tsx
/**
 * Quick script to add the connected channels endpoint
 */
import { readFileSync, writeFileSync } from 'fs';

const routesPath = './server/routes.ts';
let content = readFileSync(routesPath, 'utf-8');

const newEndpoint = `
  // Get connected YouTube channels
  app.get('/api/youtube/connected-channels', async (req, res) => {
    try {
      const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
      if (existsSync(channelsFile)) {
        const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));
        res.json(channels.filter((c: any) => c.status === 'active'));
      } else {
        res.json([]);
      }
    } catch (error: any) {
      console.error('Error loading connected channels:', error);
      res.json([]);
    }
  });

`;

// Find the YouTube status endpoint and add our endpoint before it
const statusEndpoint = '  // Update video privacy status';
const insertPoint = content.indexOf(statusEndpoint);

if (insertPoint !== -1) {
  content = content.slice(0, insertPoint) + newEndpoint + content.slice(insertPoint);
  writeFileSync(routesPath, content);
  console.log('✅ Added connected channels endpoint');
} else {
  console.log('❌ Could not find insertion point');
}
