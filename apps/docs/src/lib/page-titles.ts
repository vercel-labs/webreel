/**
 * Single source of truth for page titles.
 * Used by both page metadata exports and the OG image route.
 *
 * Keys mirror the page's URL path (e.g. "commands" -> /og/commands).
 * Values are display titles (without the "| webreel" suffix; the layout template adds that).
 */
export const PAGE_TITLES: Record<string, string> = {
  "": "Introduction",
  "quick-start": "Quick Start",
  commands: "Commands",
  actions: "Actions",
  configuration: "Configuration",
  examples: "Examples",
};

/**
 * Get the page title for a given slug.
 * Returns null if the slug is not in the whitelist.
 */
export function getPageTitle(slug: string): string | null {
  return PAGE_TITLES[slug] ?? null;
}
