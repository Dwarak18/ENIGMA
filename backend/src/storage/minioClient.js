import { createHash } from 'node:crypto';
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';

const endpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
const region = process.env.MINIO_REGION || 'us-east-1';
const bucket = process.env.MINIO_BUCKET || 'records';
const accessKeyId = process.env.MINIO_ACCESS_KEY;
const secretAccessKey = process.env.MINIO_SECRET_KEY;

if (!accessKeyId || !secretAccessKey) {
  throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required');
}

if (!bucket) {
  throw new Error('MINIO_BUCKET is required');
}

export const minioClient = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

let ensureBucketPromise;

function normalizeToBuffer(data) {
  if (data === undefined || data === null) {
    throw new Error('uploadAndHash requires non-null data');
  }
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  return Buffer.from(JSON.stringify(data), 'utf8');
}

function toBytes32Sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function ensureBucketExists() {
  if (ensureBucketPromise) {
    return ensureBucketPromise;
  }

  ensureBucketPromise = (async () => {
  try {
    await minioClient.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (err) {
    const code = err?.name || err?.Code;
    if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') {
      throw err;
    }
  }
  })();

  return ensureBucketPromise;
}

async function objectExists(objectKey) {
  try {
    await minioClient.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }));
    return true;
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchKey') {
      return false;
    }
    throw err;
  }
}

async function uploadWithRetry(objectKey, bodyBuffer, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await minioClient.send(new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: bodyBuffer,
        ContentType: 'application/octet-stream',
      }));
      return;
    } catch (err) {
      if (attempt === attempts) throw err;
      const delayMs = (200 * attempt) + Math.floor(Math.random() * 100);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function uploadAndHash(data) {
  const payload = normalizeToBuffer(data);
  const hashHex = toBytes32Sha256(payload);
  const objectKey = hashHex;
  const bytes32Hash = `0x${hashHex}`;

  await ensureBucketExists();

  const exists = await objectExists(objectKey);
  if (!exists) {
    await uploadWithRetry(objectKey, payload, Number(process.env.MINIO_UPLOAD_RETRIES || 3));
  }

  return bytes32Hash;
}
