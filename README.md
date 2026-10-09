# meeting-insights-ai

Upload a meeting recording and get a transcript, a short summary, the decisions that were agreed, and the follow-up tasks. An action item is assigned to a person only when the transcript clearly names them.

```text
Browser
  → sign up or log in (Supabase Auth)
  → presigned PUT to Backblaze B2
  → POST after the upload finishes
  → meeting row in Postgres, plus a BullMQ job
  → worker downloads the file, transcribes it, then analyzes it
  → UI polls until the result is ready and saved on the meeting
```

Redis stores the job and its progress. Postgres stores the meeting. Audio lives in a private B2 bucket.

## Requirements

- Node.js 22
- Redis
- A [Supabase](https://supabase.com) project
- A private Backblaze B2 bucket and an application key that can read and write objects under `meetings/`
- A [Groq](https://console.groq.com) API key

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, and `GROQ_API_KEY`. `B2_ENDPOINT` and `B2_REGION` must match the bucket. This project uses `eu-central-003`.

Run `supabase/migrations/20261009120000_create_meetings.sql` in the Supabase SQL editor. It creates `public.meetings` and row-level security so a signed-in user can only read and write their own rows. The server uses the service role key and sets `user_id` from the verified token.

The browser uploads straight to B2, so the bucket needs a CORS rule that allows `s3_put`, `s3_get`, and `s3_head` from the app origin. The B2 web presets only allow downloads. Authorize the [b2 CLI](https://www.backblaze.com/docs/cloud-storage-command-line-tools) for the bucket, then apply this rule:

```bash
b2 bucket update <bucket-name> --cors-rules '[{"corsRuleName":"upload","allowedOrigins":["http://localhost:8080"],"allowedOperations":["s3_put","s3_get","s3_head"],"allowedHeaders":["*"],"exposeHeaders":["etag"],"maxAgeSeconds":3600}]'
```

## Run

Start Redis, then in two terminals:

```bash
npm run dev
```

```bash
npm run worker
```

Run the app, create an account, and sign in. Choose an audio file of 25 MB or less, then click **Upload & Analyze**. The worker reports these stages:

| Stage             | Progress |
| ----------------- | -------- |
| Queued            | 10%      |
| Downloading audio | 25%      |
| Transcribing      | 60%      |
| Analyzing         | 85%      |
| Complete          | 100%     |

`npm run build` compiles TypeScript to `dist/`. Day-to-day development uses `tsx` and does not need a build.

## API

Auth routes are public. Meeting routes require `Authorization: Bearer <accessToken>`.

`POST /api/auth/signup` and `POST /api/auth/login` take `{ email, password }`. Signup requires a password of at least 6 characters. Both return `{ user, session }` with `session.accessToken` and `session.refreshToken`.

`POST /api/auth/refresh` takes `{ refreshToken }` and returns a new session. `GET /api/auth/me` returns the current user.

`POST /api/meetings/upload-url` with `{ fileName, contentType }` returns `{ uploadUrl, audioPath }`. `contentType` must start with `audio/`. The signed URL expires after 15 minutes.

The browser PUTs the file to `uploadUrl`, then `POST /api/meetings` with `{ audioPath }` creates the meeting, enqueues the job, and returns `{ jobId, meetingId }`.

`GET /api/meetings` lists the signed-in user's meetings. `GET /api/meetings/:meetingId` returns one meeting. `GET /api/meetings/jobs/:jobId` returns `{ status, progress, result }`. `result` is set when `status` is `completed` and contains `transcript`, `summary`, `decisions`, and `actionItems`.

## Models

Transcription uses Groq `whisper-large-v3-turbo`. Analysis uses Groq `openai/gpt-oss-20b` with a strict JSON schema. Groq’s free audio endpoint accepts files up to 25 MB.

## Project structure

```text
src/
  index.ts                    Express server and static files
  config.ts                   Environment
  middleware/requireAuth.ts   Bearer token check
  routes/auth.ts              Signup, login, refresh
  routes/meetings.ts          Upload URL, meetings, and job status
  queue/meetingQueue.ts       BullMQ queue
  queue/meetingWorker.ts      Download, transcribe, analyze, save
  services/supabase.ts        Supabase clients
  services/meetings.ts        Meetings table
  services/storage.ts         Presigned upload and download
  services/transcription.ts   Groq Whisper
  services/meetingAnalysis.ts Groq chat analysis
  types/                      Job, result, and auth types
public/                       Login and meeting UI
supabase/migrations/          Meetings table SQL
```
