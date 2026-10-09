import Groq, { toFile } from "groq-sdk";

import { config } from "../config.js";

const groq = new Groq({ apiKey: config.groq.apiKey });

// Sends audio buffer to Groq's Whisper API and returns the raw transcript text.
export async function transcribeAudio(
  audioInput: Buffer,
  fileName: string = "meeting.mp3"
): Promise<string> {
  const file = await toFile(audioInput, fileName);

  const transcription = await groq.audio.transcriptions.create({
    file,
    model: config.groq.transcriptionModel,
    response_format: "json",
    language: "en",
    temperature: 0
  });

  return transcription.text;
}
