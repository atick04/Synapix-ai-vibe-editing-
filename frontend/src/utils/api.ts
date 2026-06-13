export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    // Return direct backend URL to avoid Next.js 1MB rewrite limit for videos
    return `http://${window.location.hostname}:8000`;
  }
  return "http://127.0.0.1:8000";
}
