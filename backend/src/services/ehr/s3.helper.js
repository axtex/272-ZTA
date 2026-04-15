const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Configured = !!process.env.AWS_ACCESS_KEY_ID;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function uploadFileToS3(buffer, filename, mimetype, patientId) {
  const Bucket = process.env.AWS_S3_BUCKET;
  const s3Key = `hospital-zt/${patientId}/${Date.now()}-${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: mimetype,
    }),
  );

  return { s3Key };
}

async function getPresignedUrl(s3Key) {
  const Bucket = process.env.AWS_S3_BUCKET;
  const command = new GetObjectCommand({ Bucket, Key: s3Key });
  return getSignedUrl(s3, command, { expiresIn: 900 });
}

async function deleteFileFromS3(s3Key) {
  const Bucket = process.env.AWS_S3_BUCKET;
  await s3.send(new DeleteObjectCommand({ Bucket, Key: s3Key }));
  return { success: true };
}

module.exports = {
  s3Configured,
  uploadFileToS3,
  getPresignedUrl,
  deleteFileFromS3,
};

