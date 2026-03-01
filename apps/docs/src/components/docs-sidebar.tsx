"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { docsNavigation } from "@/lib/docs-navigation";

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation" className="space-y-6 pb-8">
      {docsNavigation.map((section) => (
        <div key={section.title}>
          <h4 className="text-xs font-normal text-muted-foreground/50 uppercase tracking-wider mb-2">
            {section.title}
          </h4>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const isActive = pathname === item.href;
              const isExternal = item.external;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    {...(isExternal && {
                      target: "_blank",
                      rel: "noopener noreferrer",
                    })}
                    className={cn(
                      "text-sm transition-colors block py-1",
                      isActive
                        ? "text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground",
                      isExternal && "inline-flex items-center gap-1",
                    )}
                  >
                    {item.title}
                    {isExternal && (
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
