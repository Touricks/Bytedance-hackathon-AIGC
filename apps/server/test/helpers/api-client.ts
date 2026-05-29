import { loadIntegrationEnv } from "./provider-env.js";

const env = loadIntegrationEnv();

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${env.TEST_API_BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`${options.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  return body as T;
}
