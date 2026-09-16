export function isBlockedUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (!["http:", "https:"].includes(parsed.protocol)) return true;
    const hostname = parsed.hostname;
    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("127.") ||
      hostname === "[::1]" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname === "169.254.169.254" ||
      hostname === "100.100.100.200" ||
      hostname.endsWith(".internal") ||
      hostname === "metadata.google.internal" ||
      /^\[f[cd]/.test(hostname) ||
      /^\[fe8/.test(hostname)
    )
      return true;
    return false;
  } catch {
    return true;
  }
}
