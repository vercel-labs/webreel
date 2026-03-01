"use client";

import { useState, useRef, useEffect } from "react";

interface ExpandableCodeProps {
  children: React.ReactNode;
  maxHeight?: number;
}

export function ExpandableCode({ children, maxHeight = 300 }: ExpandableCodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const check = () => setNeedsExpansion(el.scrollHeight > maxHeight);
    check();

    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxHeight]);

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height] duration-300"
        style={{
          maxHeight: isExpanded || !needsExpansion ? "none" : maxHeight,
        }}
      >
        {children}
      </div>
      {needsExpansion && !isExpanded && (
        <>
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-neutral-100 dark:from-[#0a0a0a] to-transparent pointer-events-none" />
          <button
            onClick={() => setIsExpanded(true)}
            aria-expanded={false}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded-md transition-colors"
          >
            Show all
          </button>
        </>
      )}
    </div>
  );
}
