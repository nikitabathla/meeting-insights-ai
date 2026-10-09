import { Worker, type Job } from "bullmq";
import { config } from "../config.js";
import { analyzeMeetingTranscript } from "../services/meetingAnalysis.js";
import { completeMeeting, failMeeting } from "../services/meetings.js";
import { downloadAudioFile } from "../services/storage.js";
import { transcribeAudio } from "../services/transcription.js";
import {
  MeetingJobStage,
  type MeetingJobData,
  type MeetingResult,
} from "../types/meeting.js";
import { MEETING_QUEUE_NAME } from "./meetingQueue.js";

// Sequential worker pipeline: B2 download -> Groq Whisper -> Groq LLM analysis.
export async function processMeetingJob(
  job: Job<MeetingJobData, MeetingResult>
): Promise<MeetingResult> {
  console.log(
    `[Worker] Received job ${job.id} for audio: ${job.data.audioPath}`
  );

  await job.updateProgress({
    percentage: 10,
    stage: MeetingJobStage.QUEUED,
  });

  await job.updateProgress({
    percentage: 25,
    stage: MeetingJobStage.DOWNLOADING_AUDIO,
  });
  const audioBuffer = await downloadAudioFile(job.data.audioPath);
  console.log(`[Worker] Downloaded ${audioBuffer.length} bytes`);

  await job.updateProgress({
    percentage: 60,
    stage: MeetingJobStage.TRANSCRIBING,
  });
  const fileName = job.data.audioPath.split("/").pop() || "meeting.mp3";
  const transcript = await transcribeAudio(audioBuffer, fileName);

  await job.updateProgress({
    percentage: 85,
    stage: MeetingJobStage.ANALYZING,
  });
  const analysis = await analyzeMeetingTranscript(transcript);

  await job.updateProgress({
    percentage: 100,
    stage: MeetingJobStage.COMPLETE,
  });

  return analysis;
}

export const meetingWorker = new Worker<MeetingJobData, MeetingResult>(
  MEETING_QUEUE_NAME,
  processMeetingJob,
  {
    connection: {
      host: config.redis.host,
      port: config.redis.port
    }
  }
);

meetingWorker.on("completed", async (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully.`);
  if (!job.data.meetingId || !job.returnvalue) return;
  try {
    await completeMeeting(job.data.meetingId, job.returnvalue);
  } catch (err) {
    console.error(`[Worker] Could not save meeting ${job.data.meetingId}:`, err);
  }
});

meetingWorker.on("failed", async (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err);
  if (!job?.data.meetingId) return;
  try {
    await failMeeting(job.data.meetingId);
  } catch (saveErr) {
    console.error(`[Worker] Could not mark meeting ${job.data.meetingId} failed:`, saveErr);
  }
});

console.log(
  `[Worker] Meeting worker started, listening on queue: ${MEETING_QUEUE_NAME}`
);
