export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    // If running on local port 3001, connect to backend on port 8001, otherwise default to 8000
    const port = window.location.port === "3001" ? "8001" : "8000";
    return `http://${window.location.hostname}:${port}`;
  }
  return "http://127.0.0.1:8000";
}
