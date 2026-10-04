import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function getAccessToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  return token;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is missing");
  }

  const token = await getAccessToken();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 240000);

  try {
    return await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
      signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted && !init?.signal?.aborted) {
      throw new Error("The request took too long. Check saved results before retrying.");
    }
    if (!init?.signal?.aborted && error instanceof TypeError) {
      throw new Error("Could not reach the learning API. The connection may have been interrupted. Check saved results, then try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    const text = await response.text();
    try {
      const body = JSON.parse(text);
      message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail || body);
    } catch { if (text) message = text; }
    const reference = response.headers.get("X-Request-ID");
    if (response.status >= 500 && reference && !message.includes(reference)) {
      message += ` Reference: ${reference}`;
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

