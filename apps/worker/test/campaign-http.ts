/** Test driver requests must not reuse a socket left idle during browser work.
 * Browser fetch/WebSocket transport remains real and unchanged. No retry. */
export const campaignHttp = { maxRetries: 0, headers: { Connection: "close" } } as const;

export function sanitizeCampaign(text: string, secrets: Iterable<string>): string {
  for (const secret of secrets) text = text.replaceAll(secret, "[credential omitted]")
    .replaceAll(secret.slice(0, 32), "[credential prefix omitted]");
  return text.replace(/((?:cookie|set-cookie|authorization|x-li4chess-connection|x-m3-06-key)\s*:\s*)[^\r\n]*/gi, "$1[credential omitted]")
    .replace(/env\.M3_06_KEY[^\r\n]*/g, "env.M3_06_KEY [omitted]");
}

export function campaignJson(value: unknown, secrets: Iterable<string>): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === "string" ? sanitizeCampaign(item, secrets) : item, 2);
}
