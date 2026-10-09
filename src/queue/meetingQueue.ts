import { Queue } from "bullmq";
import { config } from "../config.js";
import type { MeetingJobData, MeetingResult } from "../types/meeting.js";

export const MEETING_QUEUE_NAME = "meeting-processing";

export const meetingQueue = new Queue<MeetingJobData, MeetingResult>(
  MEETING_QUEUE_NAME,
  {
    connection: {
      host: config.redis.host,
      port: config.redis.port,
    },
  }
);
