import { renameSync, copyFileSync, rmSync } from "node:fs";

/**
 * Move a file from `src` to `dest`, falling back to copy+delete when the
 * source and destination reside on different devices (`EXDEV`).
 */
export function moveFileSync(src: string, dest: string): void {
  try {
    renameSync(src, dest);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      copyFileSync(src, dest);
      rmSync(src, { force: true });
    } else {
      throw err;
    }
  }
}
