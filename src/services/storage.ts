import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

import { config } from "../config.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3Client = new S3Client({
  endpoint: config.b2.endpoint,
  region: config.b2.region,
  credentials: {
    accessKeyId: config.b2.keyId,
    secretAccessKey: config.b2.applicationKey
  },
  // B2 rejects the default CRC32 checksum query on presigned browser uploads.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED"
});

// Presigned PUT URL for direct browser-to-B2 upload (expires in 15 mins).
export async function generateSignedUploadUrl(
  fileName: string,
  contentType: string = "audio/mpeg"
): Promise<{ uploadUrl: string; audioPath: string }> {
  const audioPath = `meetings/${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: config.b2.bucketName,
    Key: audioPath,
    ContentType: contentType
  });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

  return { uploadUrl, audioPath };
}

// Downloads the uploaded audio from B2 as an in-memory buffer for transcription.
export async function downloadAudioFile(audioPath: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: config.b2.bucketName,
    Key: audioPath
  });
  const response = await s3Client.send(command);
  const byteArray = await response.Body?.transformToByteArray();
  return Buffer.from(byteArray || []);
}
