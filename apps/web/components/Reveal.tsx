"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/*
 * Staggered scroll reveal — section 6 calls for fade-in on scroll using the 200–800ms
 * range and the brand easing.
 *
 * The server renders the hidden state so there is no flash of unstyled content, which
 * means the no-JS fallback lives in a <noscript> style block in the layout.
 *
 * `as` exists because list items have to reveal as the <li> itself: wrapping them in a
 * div would put an invalid node between <ul> and <li>, and would also break `last:`
 * variants, since every item would be an only child of its own wrapper.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li";
}) {
  // A callback ref rather than useRef: it types cleanly against both element types.
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return (
    <Tag
      ref={setNode}
      data-reveal={shown ? "shown" : "pending"}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
      className={cn(className)}
    >
      {children}
    </Tag>
  );
}
