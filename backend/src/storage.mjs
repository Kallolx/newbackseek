import { S3Client } from '@aws-sdk/client-s3';
import { config } from './config.mjs';
export const storageReady = () => Boolean(config.R2_ENDPOINT && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY && config.R2_BUCKET && config.R2_PUBLIC_BUCKET && config.R2_BUCKET !== config.R2_PUBLIC_BUCKET && config.MEDIA_PUBLIC_URL);
export const s3 = new S3Client({ region: 'auto', endpoint: config.R2_ENDPOINT,
 credentials: { accessKeyId: config.R2_ACCESS_KEY_ID || '', secretAccessKey: config.R2_SECRET_ACCESS_KEY || '' } });
