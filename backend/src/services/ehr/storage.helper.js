const { createClient } = require('@supabase/supabase-js');

/**
 * Supabase Storage for EHR attachments (private bucket; signed URLs for reads).
 * Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: SUPABASE_STORAGE_BUCKET (defaults to bucket name "272")
 */

const DEFAULT_STORAGE_BUCKET = '272';

function getBucket() {
  const fromEnv = String(process.env.SUPABASE_STORAGE_BUCKET ?? '').trim();
  return fromEnv || DEFAULT_STORAGE_BUCKET;
}

function storageConfigured() {
  return Boolean(
    String(process.env.SUPABASE_URL ?? '').trim() &&
      String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
  );
}

let adminClient;
function getAdminClient() {
  if (!storageConfigured()) return null;
  if (!adminClient) {
    adminClient = createClient(
      String(process.env.SUPABASE_URL).trim(),
      String(process.env.SUPABASE_SERVICE_ROLE_KEY).trim(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }
  return adminClient;
}

/**
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} mimetype
 * @param {string} patientId
 * @returns {Promise<{ fileKey: string }>} object path inside the bucket (stored in DB column `s3_file_key`)
 */
async function uploadEhrFile(buffer, filename, mimetype, patientId) {
  const client = getAdminClient();
  if (!client) {
    const err = new Error('Supabase Storage is not configured');
    err.statusCode = 503;
    throw err;
  }
  const bucket = getBucket();
  const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectPath = `hospital-zt/${patientId}/${Date.now()}-${safeName}`;

  const { error } = await client.storage.from(bucket).upload(objectPath, buffer, {
    contentType: mimetype || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    const err = new Error(error.message || 'Upload failed');
    err.statusCode = 502;
    throw err;
  }
  return { fileKey: objectPath };
}

/**
 * @param {string} fileKey object path in bucket
 * @returns {Promise<string>} signed URL
 */
async function getStorageSignedUrl(fileKey) {
  const client = getAdminClient();
  if (!client) {
    const err = new Error('Supabase Storage is not configured');
    err.statusCode = 503;
    throw err;
  }
  const bucket = getBucket();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(fileKey, 900);
  if (error || !data?.signedUrl) {
    const err = new Error(error?.message || 'Could not create signed URL');
    err.statusCode = 502;
    throw err;
  }
  return data.signedUrl;
}

async function deleteEhrObject(fileKey) {
  const client = getAdminClient();
  if (!client) {
    const err = new Error('Supabase Storage is not configured');
    err.statusCode = 503;
    throw err;
  }
  const bucket = getBucket();
  const { error } = await client.storage.from(bucket).remove([fileKey]);
  if (error) {
    const err = new Error(error.message || 'Delete failed');
    err.statusCode = 502;
    throw err;
  }
  return { success: true };
}

module.exports = {
  storageConfigured,
  uploadEhrFile,
  getStorageSignedUrl,
  deleteEhrObject,
};
