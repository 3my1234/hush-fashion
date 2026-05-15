const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");

function getS3Client() {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey }
  });
}

async function createUploadUrl({ fileName, contentType }) {
  const bucket = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME;
  const client = getS3Client();
  if (!bucket || !client) return null;
  const key = `attachments/${Date.now()}-${uuidv4()}-${fileName}`;
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || "application/octet-stream"
  });
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 60 * 10 });
  return { uploadUrl, key };
}

async function createDownloadUrl(key) {
  const bucket = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME;
  const client = getS3Client();
  if (!bucket || !client || !key) return null;
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, cmd, { expiresIn: 60 * 30 });
}

module.exports = { createUploadUrl, createDownloadUrl };
