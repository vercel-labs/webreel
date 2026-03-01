import CDP from "chrome-remote-interface";
import type { CDPClient } from "./types.js";

export async function connectCDP(port: number): Promise<CDPClient> {
  return (await CDP({ port })) as unknown as CDPClient;
}
