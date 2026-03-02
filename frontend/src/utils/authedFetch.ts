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
    headers.set("X-Gemini-Key", geminiKey);
  }
  return fetch(input, { ...init, headers });
}
