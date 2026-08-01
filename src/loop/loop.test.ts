import { describe, expect, test } from "bun:test";
import { simulateReadableStream, tool, type ModelMessage, type ToolSet } from "ai";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { runLoop, type LoopEvent } from "./loop";

function usage(inputTotal: number, outputTotal: number) {
  return {
    inputTokens: { total: inputTotal, noCache: inputTotal, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: outputTotal, text: outputTotal, reasoning: undefined },
  };
}

function textOnlyChunks(text: string): LanguageModelV4StreamPart[] {
  return [
    { type: "text-start", id: "1" },
    { type: "text-delta", id: "1", delta: text },
    { type: "text-end", id: "1" },
    { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: usage(5, 5) },
  ];
}

function toolCallChunks(toolCallId: string, toolName: string, input: unknown): LanguageModelV4StreamPart[] {
  return [
    { type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) },
    { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage: usage(5, 5) },
  ];
}

function streamResult(chunks: LanguageModelV4StreamPart[]) {
  return { stream: simulateReadableStream({ chunks }) };
}

async function collect(events: AsyncGenerator<LoopEvent>): Promise<LoopEvent[]> {
  const out: LoopEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

function makeTools(execute: (input: { path: string }) => Promise<string>): ToolSet {
  return {
    write_file: tool({
      description: "write a file",
      inputSchema: z.object({ path: z.string() }),
      execute,
    }),
  };
}

const baseMessages: ModelMessage[] = [{ role: "user", content: "do the task" }];

describe("runLoop", () => {
  test("terminates on no-tool-call", async () => {
    const model = new MockLanguageModelV4({ doStream: async () => streamResult(textOnlyChunks("Hello")) });
    const events = await collect(
      runLoop({ model, tools: {}, messages: baseMessages, permissionMode: "auto" }),
    );
    expect(events).toContainEqual({ type: "text-delta", text: "Hello" });
    expect(events.at(-1)).toEqual({ type: "done", reason: "no-tool-call" });
  });

  test("executes a tool call and appends the result to the next turn", async () => {
    const executed: unknown[] = [];
    const tools = makeTools(async (input) => {
      executed.push(input);
      return "ok";
    });
    const model = new MockLanguageModelV4({
      doStream: [
        streamResult(toolCallChunks("call-1", "write_file", { path: "a.txt" })),
        streamResult(textOnlyChunks("Done")),
      ],
    });
    const events = await collect(
      runLoop({ model, tools, messages: baseMessages, permissionMode: "auto" }),
    );

    expect(events).toContainEqual({ type: "tool-call", name: "write_file", args: { path: "a.txt" } });
    expect(events).toContainEqual({ type: "tool-result", name: "write_file", result: "ok" });
    expect(events.at(-1)).toEqual({ type: "done", reason: "no-tool-call" });
    expect(executed).toEqual([{ path: "a.txt" }]);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain("ok");
  });

  test("read-only mode blocks a write tool instead of executing it", async () => {
    const executed: unknown[] = [];
    const tools = makeTools(async (input) => {
      executed.push(input);
      return "ok";
    });
    const model = new MockLanguageModelV4({
      doStream: [
        streamResult(toolCallChunks("call-1", "write_file", { path: "a.txt" })),
        streamResult(textOnlyChunks("Done")),
      ],
    });
    const events = await collect(
      runLoop({ model, tools, messages: baseMessages, permissionMode: "read-only" }),
    );

    expect(events).toContainEqual({ type: "permission-denied", name: "write_file" });
    expect(events.find((e) => e.type === "tool-result")).toBeUndefined();
    expect(executed).toEqual([]);
    expect(events.at(-1)).toEqual({ type: "done", reason: "no-tool-call" });
  });

  test("max-iterations backstop trips after exactly the configured number of iterations", async () => {
    const tools = makeTools(async () => "ok");
    const model = new MockLanguageModelV4({
      doStream: async () => streamResult(toolCallChunks("call-1", "write_file", { path: "a.txt" })),
    });
    const events = await collect(
      runLoop({ model, tools, messages: baseMessages, permissionMode: "auto", maxIterations: 3 }),
    );

    expect(model.doStreamCalls).toHaveLength(3);
    expect(events.at(-1)).toEqual({ type: "done", reason: "max-iterations" });
  });

  describe("approve-each", () => {
    test("executes the tool when the approval prompt approves", async () => {
      const executed: unknown[] = [];
      const tools = makeTools(async (input) => {
        executed.push(input);
        return "ok";
      });
      const model = new MockLanguageModelV4({
        doStream: [
          streamResult(toolCallChunks("call-1", "write_file", { path: "a.txt" })),
          streamResult(textOnlyChunks("Done")),
        ],
      });
      const events = await collect(
        runLoop({
          model,
          tools,
          messages: baseMessages,
          permissionMode: "approve-each",
          approvalPrompt: async () => true,
        }),
      );

      expect(events).toContainEqual({ type: "tool-result", name: "write_file", result: "ok" });
      expect(executed).toEqual([{ path: "a.txt" }]);
    });

    test("denies the tool when the approval prompt rejects", async () => {
      const executed: unknown[] = [];
      const tools = makeTools(async (input) => {
        executed.push(input);
        return "ok";
      });
      const model = new MockLanguageModelV4({
        doStream: [
          streamResult(toolCallChunks("call-1", "write_file", { path: "a.txt" })),
          streamResult(textOnlyChunks("Done")),
        ],
      });
      const events = await collect(
        runLoop({
          model,
          tools,
          messages: baseMessages,
          permissionMode: "approve-each",
          approvalPrompt: async () => false,
        }),
      );

      expect(events).toContainEqual({ type: "permission-denied", name: "write_file" });
      expect(events.find((e) => e.type === "tool-result")).toBeUndefined();
      expect(executed).toEqual([]);
    });

    test("treats approve-each with no approvalPrompt as denied", async () => {
      const executed: unknown[] = [];
      const tools = makeTools(async (input) => {
        executed.push(input);
        return "ok";
      });
      const model = new MockLanguageModelV4({
        doStream: [
          streamResult(toolCallChunks("call-1", "write_file", { path: "a.txt" })),
          streamResult(textOnlyChunks("Done")),
        ],
      });
      const events = await collect(
        runLoop({ model, tools, messages: baseMessages, permissionMode: "approve-each" }),
      );

      expect(events).toContainEqual({ type: "permission-denied", name: "write_file" });
      expect(executed).toEqual([]);
    });
  });
});
