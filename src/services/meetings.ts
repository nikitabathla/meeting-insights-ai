import { supabaseAdmin } from "./supabase.js";
import type { ActionItem, MeetingResult } from "../types/meeting.js";

export type MeetingSummary = {
  id: string;
  audioPath: string;
  status: string;
  summary: string | null;
  createdAt: string;
};

export type MeetingDetail = MeetingSummary & {
  transcript: string | null;
  decisions: string[];
  actionItems: ActionItem[];
};

export async function createMeeting(input: { userId: string; audioPath: string }) {
  const { data, error } = await supabaseAdmin
    .from("meetings")
    .insert({
      user_id: input.userId,
      audio_path: input.audioPath,
      status: "queued",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not save the meeting.");
  }

  return { id: data.id as string };
}

export async function completeMeeting(meetingId: string, result: MeetingResult) {
  const { error } = await supabaseAdmin
    .from("meetings")
    .update({
      status: "complete",
      transcript: result.transcript,
      summary: result.summary,
      decisions: result.decisions,
      action_items: result.actionItems,
    })
    .eq("id", meetingId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function listMeetings(userId: string): Promise<MeetingSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("meetings")
    .select("id, audio_path, status, summary, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    audioPath: row.audio_path,
    status: row.status,
    summary: row.summary,
    createdAt: row.created_at,
  }));
}

export async function getMeeting(userId: string, meetingId: string): Promise<MeetingDetail | null> {
  const { data, error } = await supabaseAdmin
    .from("meetings")
    .select("id, audio_path, status, summary, transcript, decisions, action_items, created_at")
    .eq("user_id", userId)
    .eq("id", meetingId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  return {
    id: data.id,
    audioPath: data.audio_path,
    status: data.status,
    summary: data.summary,
    transcript: data.transcript,
    decisions: data.decisions ?? [],
    actionItems: data.action_items ?? [],
    createdAt: data.created_at,
  };
}

export async function failMeeting(meetingId: string) {
  const { error } = await supabaseAdmin
    .from("meetings")
    .update({ status: "failed" })
    .eq("id", meetingId);

  if (error) {
    throw new Error(error.message);
  }
}
