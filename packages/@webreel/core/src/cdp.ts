import CDP from "chrome-remote-interface";
import type { CDPClient } from "./types.js";

export async function connectCDP(port: number): Promise<CDPClient> {
  return (await CDP({ port })) as unknown as CDPClient;
}

export interface CDPConnectionResult {
  client: CDPClient;
  hasBeginFrameControl: boolean;
}

export async function connectCDPForRecording(port: number): Promise<CDPConnectionResult> {
  try {
    const version = await (
      CDP as unknown as {
        Version: (opts: { port: number }) => Promise<{ webSocketDebuggerUrl: string }>;
      }
    ).Version({ port });
    const browserWsUrl = version.webSocketDebuggerUrl;

    const browser = (await CDP({ target: browserWsUrl })) as unknown as CDPClient;

    const result = (await browser.send("Target.createTarget", {
      url: "about:blank",
      enableBeginFrameControl: true,
    })) as { targetId: string };

    await browser.close();

    const client = (await CDP({ port, target: result.targetId })) as unknown as CDPClient;
    return { client, hasBeginFrameControl: true };
  } catch {
    const client = (await CDP({ port })) as unknown as CDPClient;
    return { client, hasBeginFrameControl: false };
  }
}
