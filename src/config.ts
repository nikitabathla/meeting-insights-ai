import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "8080", 10),
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10)
  },
  b2: {
    endpoint:
      process.env.B2_ENDPOINT || "https://s3.eu-central-003.backblazeb2.com",
    region: process.env.B2_REGION || "eu-central-003",
    bucketName: process.env.B2_BUCKET_NAME || "",
    keyId: process.env.B2_KEY_ID || "",
    applicationKey: process.env.B2_APPLICATION_KEY || ""
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    transcriptionModel: "whisper-large-v3-turbo",
    chatModel: "openai/gpt-oss-20b",
  },
  supabase: {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  },
} as const;
