import CDP from "chrome-remote-interface";
import type { CDPClient } from "./types.js";

/**
 * Connects to Chrome over CDP and registers listeners for the client's
 * 'error' and 'disconnect' events so a Chrome crash or socket error never
 * surfaces as an unhandled EventEmitter 'error' (which would crash the
 * process outside our cleanup path). `onConnectionLost` is invoked at most
 * once, with a descriptive Error, regardless of which event fires first.
 */
export async function connectCDP(
  port: number,
  onConnectionLost?: (err: Error) => void,
): Promise<CDPClient> {
  const client = (await CDP({ port })) as unknown as CDPClient;

  let notified = false;
  const notify = (err: Error) => {
    if (notified) return;
    notified = true;
    onConnectionLost?.(err);
  };

  client.on("error", (err: unknown) => {
    notify(
      new Error(
        `CDP connection error: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  });
  client.on("disconnect", () => {
    notify(new Error("CDP connection lost (Chrome exited or crashed)"));
  });

  return client;
}
