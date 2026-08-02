import { generateObject } from "ai";
import type { LanguageModel, LanguageModelUsage, ModelMessage } from "ai";
import { z } from "zod";

export const CompactionSummarySchema = z.object({
  goal: z.string(),
  progress: z.string(),
  blockers: z.string(),
  nextSteps: z.string(),
});

export type CompactionSummary = z.infer<typeof CompactionSummarySchema>;

const DEFAULT_MIN_EVICTABLE = 4;

// A cut is only safe immediately before a "user"/"assistant" message, never before a
// "tool" message — a `role:"tool"` message is always the second half of an adjacent
// {assistant tool-call, tool result} pair pushed by loop.ts, and evicting one half while
// keeping the other reproduces the AI_MissingToolResultsError class of bug (fixed in
// 24c2aa1).
export function findSafeEvictionBoundary(
  messages: ModelMessage[],
  preserveRecentMessages: number,
  minEvictable = DEFAULT_MIN_EVICTABLE,
): number | null {
  let boundary = messages.length - preserveRecentMessages;
  while (boundary > 0 && messages[boundary]?.role === "tool") {
    boundary++;
  }
  if (boundary < minEvictable) return null;
  return boundary;
}

export async function compactMessages(
  messages: ModelMessage[],
  model: LanguageModel,
  evictBoundary: number,
): Promise<{ messages: ModelMessage[]; summary: CompactionSummary; evictedCount: number; usage: LanguageModelUsage }> {
  const evicted = messages.slice(0, evictBoundary);
  const { object: summary, usage } = await generateObject({
    model,
    schema: CompactionSummarySchema,
    system:
      "You are summarizing the older portion of an in-progress coding agent session so it can be replaced with a compact recap.",
    prompt: `Summarize this JSON-encoded transcript of earlier conversation turns into a structured recap with four fields: goal, progress, blockers, nextSteps.\n\nTranscript:\n${JSON.stringify(evicted)}`,
  });

  const summaryMessage: ModelMessage = {
    role: "user",
    content: `[Compacted history — ${evictBoundary} earlier messages condensed]\nGoal: ${summary.goal}\nProgress: ${summary.progress}\nBlockers: ${summary.blockers}\nNext steps: ${summary.nextSteps}`,
  };

  return {
    messages: [summaryMessage, ...messages.slice(evictBoundary)],
    summary,
    evictedCount: evictBoundary,
    usage,
  };
}
