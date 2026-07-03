import { REQUEST_DELAY_MS, USER_AGENT } from "../config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;

/** Polite fetch: global rate limit + jitter, browser UA, retries on 429/5xx. */
export async function fetchText(url: string, retries = 2): Promise<string> {
  const wait = lastRequestAt + REQUEST_DELAY_MS + Math.random() * 600 - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { permanent: true });
      }
      return await res.text();
    } catch (e) {
      const permanent = (e as { permanent?: boolean }).permanent;
      if (permanent || attempt >= retries) throw e;
      await sleep(3000 * (attempt + 1));
    }
  }
}
