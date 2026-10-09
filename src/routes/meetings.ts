import { Router } from "express";
import { z } from "zod";
import { meetingQueue } from "../queue/meetingQueue.js";
import { createMeeting, getMeeting, listMeetings } from "../services/meetings.js";
import { generateSignedUploadUrl } from "../services/storage.js";
import { MeetingJobStage } from "../types/meeting.js";

export const meetingsRouter = Router();

// Returns a presigned B2 upload URL. Does not start processing.
meetingsRouter.post("/upload-url", async (req, res) => {
  try {
    const fileName = (req.body?.fileName as string) || `audio-${Date.now()}.mp3`;
    const rawContentType = (req.body?.contentType as string) || "audio/mpeg";

    if (!rawContentType.startsWith("audio/")) {
      return res.status(400).json({
        error: `Unsupported content type: ${rawContentType}. Only audio files are allowed.`
      });
    }

    const uploadData = await generateSignedUploadUrl(fileName, rawContentType);
    res.json(uploadData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// Enqueues the processing job after the browser finishes uploading to B2.
meetingsRouter.post("/", async (req, res) => {
  try {
    const { audioPath } = req.body;
    if (!audioPath) {
      return res.status(400).json({ error: "audioPath is required" });
    }
    if (!req.user) {
      return res.status(401).json({ error: "Missing access token." });
    }

    const meeting = await createMeeting({
      userId: req.user.id,
      audioPath,
    });
    const job = await meetingQueue.add("process-meeting", {
      audioPath,
      meetingId: meeting.id,
    });
    res.status(202).json({ jobId: job.id, meetingId: meeting.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create meeting job" });
  }
});

meetingsRouter.get("/", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Missing access token." });
    }

    const meetings = await listMeetings(req.user.id);
    res.json({ meetings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load meetings" });
  }
});

meetingsRouter.get("/jobs/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await meetingQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const status = await job.getState();
    const progress = job.progress;
    const result = job.returnvalue ?? null;

    res.json({
      status,
      progress: progress || { percentage: 0, stage: MeetingJobStage.QUEUED },
      result,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to retrieve job status" });
  }
});

meetingsRouter.get("/:meetingId", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Missing access token." });
    }

    const parsedId = z.string().uuid().safeParse(req.params.meetingId);
    if (!parsedId.success) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    const meeting = await getMeeting(req.user.id, parsedId.data);
    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    res.json({ meeting });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load meeting" });
  }
});
