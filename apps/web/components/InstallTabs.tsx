"use client";

import { Apple, AppWindow, Check, Copy, Terminal } from "lucide-react";
import { useEffect, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const INSTALL_SH = "curl -fsSL https://raw.githubusercontent.com/lzvxck/hesper-code/main/install.sh | bash";

/*
 * macOS and Linux run the identical script — it detects OS and CPU architecture and
 * pulls the matching binary. They're still split into two tabs because that's the
 * convention users scan for.
 */
const PLATFORMS = [
  {
    id: "macos",
    label: "macOS",
    icon: Apple,
    shell: "sh",
    command: INSTALL_SH,
    note: "Intel (x64) and Apple Silicon (arm64).",
  },
  {
    id: "linux",
    label: "Linux",
    icon: Terminal,
    shell: "sh",
    command: INSTALL_SH,
    note: "x64 and arm64. Same script as macOS.",
  },
  {
    id: "windows",
    label: "Windows",
    icon: AppWindow,
    shell: "powershell",
    command: "irm https://raw.githubusercontent.com/lzvxck/hesper-code/main/install.ps1 | iex",
    note: "x64, via PowerShell.",
  },
] as const;

function CommandBlock({ command, shell }: { command: string; shell: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div
      data-surface="ink"
      className="flex items-stretch gap-4 rounded-md bg-ink p-4 shadow-elevated md:gap-8 md:p-6"
    >
      <div className="flex min-w-0 flex-1 items-center overflow-x-auto px-8 py-8">
        <code className="font-mono text-mono whitespace-pre text-on-ink">
          <span aria-hidden="true" className="select-none text-on-ink-subtle">
            {shell === "powershell" ? "PS> " : "$ "}
          </span>
          {command}
        </code>
      </div>

      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(command);
          setCopied(true);
        }}
        // aria-live announces the state flip to screen readers, since the only other
        // signal that the copy worked is the icon swap.
        aria-live="polite"
        className="flex size-22 shrink-0 cursor-pointer items-center justify-center self-center rounded-sm text-on-ink-subtle transition-colors duration-100 ease-brand hover:bg-on-ink/12 hover:text-on-ink"
      >
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        <span className="sr-only">{copied ? "Copied to clipboard" : "Copy install command"}</span>
      </button>
    </div>
  );
}

export function InstallTabs() {
  return (
    <Tabs defaultValue="macos" className="w-full">
      <TabsList aria-label="Choose your operating system" className="gap-2">
        {PLATFORMS.map((platform) => (
          <TabsTrigger key={platform.id} value={platform.id}>
            <platform.icon size={14} aria-hidden="true" />
            {platform.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {PLATFORMS.map((platform) => (
        <TabsContent key={platform.id} value={platform.id} className="flex flex-col gap-6">
          <CommandBlock command={platform.command} shell={platform.shell} />
          <p className="text-ink-subtle">{platform.note}</p>
        </TabsContent>
      ))}
    </Tabs>
  );
}
