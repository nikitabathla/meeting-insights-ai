import Groq from "groq-sdk";
import type { MeetingResult } from "../types/meeting.js";
import { config } from "../config.js";
import { z } from "zod";

const groq = new Groq({ apiKey: config.groq.apiKey });

const ActionItemSchema = z.object({
  task: z.string().min(1),
  assignee: z.string().nullable(),
});

const AnalysisSchema = z.object({
  summary: z.string().min(1),
  decisions: z.array(z.string()),
  actionItems: z.array(ActionItemSchema),
});

const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    decisions: { type: "array", items: { type: "string" } },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          task: { type: "string" },
          assignee: { type: ["string", "null"] },
        },
        required: ["task", "assignee"],
      },
    },
  },
  required: ["summary", "decisions", "actionItems"],
} as const;

// Extracts summary, decisions, and action items via Groq LLM using strict JSON schema.
export async function analyzeMeetingTranscript(
  transcript: string
): Promise<MeetingResult> {
  const completion = await groq.chat.completions.create({
    model: config.groq.chatModel,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "meeting_analysis",
        strict: true,
        schema: analysisJsonSchema,
      },
    },
    messages: [
      {
        role: "system",
        content: [
          "You extract structured insights from a meeting transcript.",
          "summary: a short paragraph of what was discussed.",
          "decisions: only decisions the participants actually agreed on. Use an empty array if none.",
          "actionItems: all tasks, follow-ups, or to-dos that need to be done, whether assigned to a specific person or left unassigned. Use an empty array if none.",
          "For each action item: set assignee to the person's name if someone is clearly assigned or committed to it. If the task is unassigned or no owner was agreed upon, set assignee to null.",
          "Do not invent people, decisions, or tasks.",
        ].join(" "),
      },
      {
        role: "user",
        content: transcript,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Groq returned an empty meeting analysis");
  }

  const parsed = AnalysisSchema.parse(JSON.parse(content));

  return {
    transcript,
    summary: parsed.summary,
    decisions: parsed.decisions,
    actionItems: parsed.actionItems.map((item) => ({
      task: item.task,
      ...(item.assignee ? { assignee: item.assignee } : {}),
    })),
  };
}
