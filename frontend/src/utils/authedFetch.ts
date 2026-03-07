/**
 * authedFetch — thin wrapper around fetch() that automatically attaches:
 *   - JWT Bearer token (from authStore)
 *   - X-Gemini-Key header when a user-provided Gemini API key is stored
 */
import { getToken } from "../stores/authStore";
import { getGeminiKey } from "../stores/geminiKeyStore";

export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = getToken();
  const geminiKey = getGeminiKey();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (geminiKey) {
    // Keep only printable ASCII (0x21–0x7E) to strip invisible characters
    // such as non-breaking spaces (\xa0), zero-width spaces, smart quotes, etc.
    // that are commonly introduced when copy-pasting API keys from a browser or PDF.
    const safeKey = geminiKey.replace(/[^\x21-\x7E]/g, "").trim();
    if (safeKey) {
      headers.set("X-Gemini-Key", safeKey);
    }
  }
  return fetch(input, { ...init, headers });
}
