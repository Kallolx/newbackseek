import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from './config.mjs';
export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
export const images = new Queue('images', { connection: redis, defaultJobOptions: {
 attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 200,
} });
