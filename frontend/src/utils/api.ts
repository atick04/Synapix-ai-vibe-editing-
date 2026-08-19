export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const port = (window.location.port === "3001" || window.location.port === "3000") ? "8001" : "8000";
    return `http://${window.location.hostname}:${port}`;
  }
  return "http://127.0.0.1:8001";
}

function headerRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...(extra || {}) };
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = /^https?:\/\//i.test(path)
    ? path
    : `${getApiUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    credentials: "include",
    headers: authHeaders(headerRecord(init.headers)),
  });
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture: string;
  auth: string;
  login?: string;
  brand_id?: string;
  company?: string;
  bio?: string;
  has_password?: boolean;
  registered_at?: string;
  plan?: string;
  plan_status?: string;
  plan_renews_at?: string;
  has_subscription?: boolean;
  free_project_id?: string;
  free_reel_available?: boolean;
};
