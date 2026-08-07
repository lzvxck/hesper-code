# Prompt routing by model family

**Status:** not built. Deferred to **Stage 7a**, which is when a model catalog exists to route on.
Recorded 2026-08-07 after measuring a failure that this is the field's answer to.

## The measurement that motivates it

Same seri binary, same prompt, same directory, fresh session per run, `read_file` task chosen so the
permission gate is not a confound:

| model | real tool-calls |
|---|---|
| `llama-3.3-70b-versatile` (current `DEFAULT_MODEL`) | **3/5** — two failed with Groq's `Failed to call a function` |
| `openai/gpt-oss-120b` | **5/5** |

The failure mode is the model emitting the call as assistant **text** — `<function/write_file({...})>`
— instead of a tool call, so the loop ends `done: no-tool-call` having done nothing.

## What the references actually do

**Neither ships one prompt.**

**OpenCode** keeps a directory of prompt files and selects by model family — 14 of them as of
2026-08-07: `anthropic.txt`, `beast.txt`, `build-switch.txt`, `codex.txt`, `copilot-gpt-5.txt`,
`default.txt`, `gemini.txt`, `gpt.txt`, `kimi.txt`, **`meta.txt`**, `plan-mode.txt`,
`plan-reminder-anthropic.txt`, `plan.txt`, `trinity.txt`. Claude gets `anthropic.txt`, GPT-5 gets
`beast.txt`, **Llama gets `meta.txt`**, and anything unmatched falls back to `default.txt`. The files
differ in substance, not tone: `meta.txt` spends most of its length on explicit tool-use discipline
(file-operation rules, parallelism rules, "never use placeholders or guess missing parameters in
tool calls") that `anthropic.txt` does not need to spell out.

**Hermes** composes rather than selects: its stable tier assembles identity + tool guidance +
model-operational guidance, and injects a **tool-use enforcement block only for GPT/Codex models**:

> "You MUST use your tools to take action — do not describe what you would do or plan to do without
> actually doing it."

That sentence targets exactly the failure measured above.

## Why this is Stage 7a and not earlier

Routing needs something to route on. Before the gateway there is one provider and one hardcoded
model, so a "router" would be an `if` with a single arm — the abstraction would be written before the
thing it abstracts exists. Stage 7a brings the catalog (`Catwalk`-style, curated rather than raw
`/models`) and mid-session switching; a prompt-per-family table is then one more column on data that
already exists, which is the same argument Stage 7a's own text makes about the routing table.

## What we do in the meantime

One prompt for everyone, containing the enforcement instruction that the measured failure calls for.
The content is the **stable tier** in `BUILD-PLAN.md`'s Stage B2 sense, so none of it is thrown away
when tiers land — B2 splits where it sits, not what it says.

One section will have no equivalent in either reference, because no other harness has it: seri's
`edit` is a **pure string transform with no disk access**, so the model must run
`read_file` → `edit` → `write_file` itself. `meta.txt`'s `edit` guidance assumes the tool writes.
Ours has to teach the three-step sequence explicitly — a documented live failure
(`.claude/loops/_archive/cli-manual-test-defects/`: *"Model passed hallucinated `content`, got
`✓ edit done`, nothing on disk changed"*).

## Open question for 7a

Whether family detection keys off the model id string (what OpenCode does, and it is brittle across
providers that rename — OpenRouter's `meta-llama/llama-3.3-70b-instruct` versus Groq's
`llama-3.3-70b-versatile`) or off a field in the catalog entry. The catalog is the better home; note
that this makes the curated manifest load-bearing for correctness, not just for presentation.
