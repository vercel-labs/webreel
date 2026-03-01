"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { List } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { docsNavigation, allDocsPages } from "@/lib/docs-navigation";

export function DocsMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const currentPage = useMemo(() => {
    const page = allDocsPages.find((page) => page.href === pathname);
    return page ?? allDocsPages[0];
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open table of contents"
        className="lg:hidden sticky top-[calc(3.5rem+1px)] z-40 w-full px-6 py-3 bg-background/80 backdrop-blur-sm border-b border-border flex items-center justify-between focus:outline-none"
      >
        <div className="text-sm font-medium">{currentPage?.title}</div>
        <div className="w-8 h-8 flex items-center justify-center">
          <List className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto p-6">
        <SheetTitle className="mb-6">Table of Contents</SheetTitle>
        <nav className="space-y-6">
          {docsNavigation.map((section) => (
            <div key={section.title}>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {section.title}
              </h4>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const isExternal = item.external;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        {...(isExternal && {
                          target: "_blank",
                          rel: "noopener noreferrer",
                        })}
                        className={`text-sm block py-2 transition-colors ${
                          pathname === item.href
                            ? "text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        } ${isExternal ? "inline-flex items-center gap-1" : ""}`}
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
      </SheetContent>
    </Sheet>
  );
}
