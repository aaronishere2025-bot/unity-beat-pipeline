#!/usr/bin/env tsx
import { db } from './server/db';
import { jobs } from './shared/schema';
import { eq } from 'drizzle-orm';

const jobId = '4f9b6119-b75e-408e-b287-70fb16d5fe03';

const result = await db.select().from(jobs).where(eq(jobs.id, jobId));
const job = result[0];

console.log('Job mode:', job.mode);
console.log('Job unityMetadata type:', typeof job.unityMetadata);
console.log('Job unityMetadata value:');
console.log(JSON.stringify(job.unityMetadata, null, 2));

// Parse it
const jobMeta = typeof job.unityMetadata === 'string' ? JSON.parse(job.unityMetadata) : job.unityMetadata;
console.log('\nParsed metadata:');
console.log(JSON.stringify(jobMeta, null, 2));

console.log('\nHas youtubeTitle?', !!jobMeta?.youtubeTitle);
console.log('Has youtubeDescription?', !!jobMeta?.youtubeDescription);
console.log('Has youtubeTags?', !!jobMeta?.youtubeTags);

process.exit(0);
