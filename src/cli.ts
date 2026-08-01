import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { ModelMessage } from "ai";
import pkg from "../package.json";
import { loadAgentsFile as loadAgentsFileReal } from "./agents/loadAgentsFile";
import { getConfigDir } from "./config/paths";
import { cycleMode } from "./gate/gate";
import { type ApprovalPrompt, type LoopEvent, runLoop as runLoopReal } from "./loop/loop";
import { getGroqModel as getGroqModelReal } from "./provider/groq";
import { toolDefinitions } from "./provider/tools";
import { findMostRecentSession, loadSession, saveSession, type SessionState } from "./session/session";

type CliDeps = {
  runLoop?: typeof runLoopReal;
  getGroqModel?: typeof getGroqModelReal;
  loadAgentsFile?: typeof loadAgentsFileReal;
  sessionsDir?: string;
};

function parseTaskArgs(argv: string[]): { resuming: boolean; resumeId: string | undefined; taskText: string } {
  const args = [...argv];
  const resumeIndex = args.indexOf("--resume");
  if (resumeIndex === -1) return { resuming: false, resumeId: undefined, taskText: args.join(" ").trim() };

  args.splice(resumeIndex, 1);
  const next = args[resumeIndex];
  const resumeId = next !== undefined && !next.startsWith("-") ? next : undefined;
  if (resumeId !== undefined) args.splice(resumeIndex, 1);

  return { resuming: true, resumeId, taskText: args.join(" ").trim() };
}

function loadOrCreateSession(
  resuming: boolean,
  resumeId: string | undefined,
  sessionsDir: string,
  loadAgentsFileFn: typeof loadAgentsFileReal,
): SessionState {
  if (resuming) {
    const id = resumeId ?? findMostRecentSession(sessionsDir);
    if (!id) throw new Error("No session to resume.");
    return loadSession(id, sessionsDir);
  }

  const agentsContent = loadAgentsFileFn(process.cwd());
  const systemMessage: ModelMessage = {
    role: "system",
    content: agentsContent ? `You are Vela, a coding agent.\n\n${agentsContent}` : "You are Vela, a coding agent.",
  };
  return {
    id: randomUUID(),
    cwd: process.cwd(),
    // Read-only is the safest default for a brand-new session: nothing in build-plan.md/
    // definitive-harness.md states an explicit default, so this errs on the side of never
    // writing/executing without the user opting in via --resume onto an existing session
    // or cycling the mode themselves.
    permissionMode: "read-only",
    messages: [systemMessage],
  };
}

// One readline prompt per approval, opened and closed on demand, so a task that never
// needs approval (read-only/auto modes) never touches stdin at all.
function makeApprovalPrompt(): ApprovalPrompt {
  return (toolName, args) =>
    new Promise<boolean>((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`Approve ${toolName}(${JSON.stringify(args)})? [y/N] `, (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      });
    });
}

function printEvent(event: LoopEvent): void {
  switch (event.type) {
    case "text-delta":
      process.stdout.write(event.text);
      break;
    case "tool-call":
      console.log(`\n→ ${event.name}(${JSON.stringify(event.args)})`);
      break;
    case "tool-result":
      console.log(`✓ ${event.name} done`);
      break;
    case "permission-denied":
      console.log(`✗ ${event.name} blocked`);
      break;
    case "done":
      console.log(`\n(done: ${event.reason})`);
      break;
    case "error":
      console.error(event.error);
      break;
  }
}

export async function run(argv: string[], deps: CliDeps = {}): Promise<number> {
  if (argv.length === 0 || argv.includes("--version") || argv.includes("-v")) {
    if (argv.includes("--version") || argv.includes("-v")) console.log(`vela ${pkg.version}`);
    return 0;
  }

  const { resuming, resumeId, taskText } = parseTaskArgs(argv);
  const sessionsDir = deps.sessionsDir ?? join(getConfigDir(), "sessions");
  const loadAgentsFileFn = deps.loadAgentsFile ?? loadAgentsFileReal;

  let session: SessionState;
  try {
    session = loadOrCreateSession(resuming, resumeId, sessionsDir, loadAgentsFileFn);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  // `/mode` is a mode-cycle command, not a task for the model: no runLoop.ts's own turn
  // boundary to hook a mid-session command into for a single-task-per-invocation CLI (see
  // round 5's judgment call notes), so it's handled here as its own invocation instead.
  if (taskText === "/mode") {
    session.permissionMode = cycleMode(session.permissionMode);
    saveSession(session, sessionsDir);
    console.log(`Permission mode is now: ${session.permissionMode}`);
    return 0;
  }

  if (!resuming || taskText) {
    (session.messages as ModelMessage[]).push({ role: "user", content: taskText });
  }

  const getGroqModelFn = deps.getGroqModel ?? getGroqModelReal;
  let model;
  try {
    model = getGroqModelFn();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  saveSession(session, sessionsDir);

  const runLoopFn = deps.runLoop ?? runLoopReal;
  const gen = runLoopFn({
    model,
    tools: toolDefinitions,
    messages: session.messages as ModelMessage[],
    permissionMode: session.permissionMode,
    approvalPrompt: makeApprovalPrompt(),
  });

  let finalMessages = session.messages as ModelMessage[];
  for (;;) {
    const step = await gen.next();
    if (step.done) {
      finalMessages = step.value;
      break;
    }
    printEvent(step.value);
  }

  saveSession({ ...session, messages: finalMessages }, sessionsDir);
  return 0;
}

if (import.meta.main) {
  run(process.argv.slice(2)).then((code) => process.exit(code));
}
