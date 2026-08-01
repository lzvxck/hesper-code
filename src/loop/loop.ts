import { streamText } from "ai";
import type { AssistantContent, JSONValue, LanguageModel, ModelMessage, ToolContent, ToolSet } from "ai";
import { checkPermission, type PermissionMode } from "../gate/gate";

export type LoopEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; name: string; args: unknown }
  | { type: "tool-result"; name: string; result: unknown }
  | { type: "permission-denied"; name: string }
  | { type: "messages-updated"; messages: ModelMessage[] }
  | { type: "done"; reason: "no-tool-call" | "max-iterations" | "token-budget" }
  | { type: "error"; error: string };

export type ApprovalPrompt = (toolName: string, args: unknown) => Promise<boolean>;

const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_TOKEN_BUDGET = 100_000;

export async function* runLoop(opts: {
  model: LanguageModel;
  tools: ToolSet;
  messages: ModelMessage[];
  permissionMode: PermissionMode;
  approvalPrompt?: ApprovalPrompt;
  maxIterations?: number;
  tokenBudget?: number;
  system?: string;
}): AsyncGenerator<LoopEvent> {
  const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tokenBudget = opts.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const messages: ModelMessage[] = [...opts.messages];

  // The AI SDK auto-runs a tool's `execute` while streaming. Strip it so every
  // tool call is surfaced as an event instead, and runs only after the gate below.
  const schemaOnlyTools = Object.fromEntries(
    Object.entries(opts.tools).map(([name, def]) => {
      const { execute: _execute, ...rest } = def;
      return [name, rest];
    }),
  ) as ToolSet;

  let totalTokens = 0;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let text = "";
    const toolCalls: { toolCallId: string; toolName: string; input: unknown }[] = [];

    try {
      const result = streamText({ model: opts.model, tools: schemaOnlyTools, messages, system: opts.system });
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          text += part.text;
          yield { type: "text-delta", text: part.text };
        } else if (part.type === "tool-call") {
          toolCalls.push({ toolCallId: part.toolCallId, toolName: part.toolName, input: part.input });
        } else if (part.type === "error") {
          yield { type: "error", error: String(part.error) };
          return;
        }
      }
      totalTokens += (await result.usage).totalTokens ?? 0;
    } catch (err) {
      yield { type: "error", error: String(err) };
      return;
    }

    if (toolCalls.length === 0) {
      if (text) {
        messages.push({ role: "assistant", content: [{ type: "text", text }] });
        yield { type: "messages-updated", messages: [...messages] };
      }
      yield { type: "done", reason: "no-tool-call" };
      return;
    }

    const assistantContent: AssistantContent = [];
    if (text) assistantContent.push({ type: "text", text });
    for (const call of toolCalls) {
      assistantContent.push({ type: "tool-call", toolCallId: call.toolCallId, toolName: call.toolName, input: call.input });
    }
    messages.push({ role: "assistant", content: assistantContent });
    yield { type: "messages-updated", messages: [...messages] };

    const toolResults: ToolContent = [];
    for (const call of toolCalls) {
      const permission = checkPermission(call.toolName, opts.permissionMode);
      const approved =
        permission === "allow" ||
        (permission === "needs-approval" && opts.approvalPrompt !== undefined && (await opts.approvalPrompt(call.toolName, call.input)));
      // approve-each with no approvalPrompt given, or an explicit denial, is treated as blocked.

      if (!approved) {
        yield { type: "permission-denied", name: call.toolName };
        toolResults.push({
          type: "tool-result",
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: { type: "execution-denied", reason: `Tool "${call.toolName}" was not permitted to run.` },
        });
        continue;
      }

      const toolDef = opts.tools[call.toolName];
      if (!toolDef?.execute) {
        const error = `Unknown tool "${call.toolName}": no matching tool definition.`;
        yield { type: "error", error };
        toolResults.push({
          type: "tool-result",
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: { type: "error-text", value: error },
        });
        continue;
      }

      yield { type: "tool-call", name: call.toolName, args: call.input };
      let toolResult: unknown;
      try {
        toolResult = await toolDef.execute(call.input, {
          toolCallId: call.toolCallId,
          messages,
          context: {},
        });
      } catch (err) {
        const error = `Tool "${call.toolName}" threw during execution: ${String(err)}`;
        yield { type: "error", error };
        toolResults.push({
          type: "tool-result",
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: { type: "error-text", value: error },
        });
        continue;
      }
      yield { type: "tool-result", name: call.toolName, result: toolResult };
      toolResults.push({
        type: "tool-result",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: { type: "json", value: (toolResult ?? null) as JSONValue },
      });
    }
    messages.push({ role: "tool", content: toolResults });
    yield { type: "messages-updated", messages: [...messages] };

    if (totalTokens > tokenBudget) {
      yield { type: "done", reason: "token-budget" };
      return;
    }
  }

  yield { type: "done", reason: "max-iterations" };
}
