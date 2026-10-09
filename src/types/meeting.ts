export type ActionItem = {
  assignee?: string;
  task: string;
};

export type MeetingResult = {
  transcript: string;
  summary: string;
  decisions: string[];
  actionItems: ActionItem[];
};

export enum MeetingJobStage {
  QUEUED = "QUEUED",
  DOWNLOADING_AUDIO = "DOWNLOADING_AUDIO",
  TRANSCRIBING = "TRANSCRIBING",
  ANALYZING = "ANALYZING",
  COMPLETE = "COMPLETE",
}

export type MeetingJobProgress = {
  percentage: number;
  stage: MeetingJobStage;
};

export type MeetingJobData = {
  audioPath: string;
  meetingId: string;
};
