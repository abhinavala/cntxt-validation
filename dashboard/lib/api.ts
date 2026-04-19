const BASE_URL =
  process.env.NEXT_PUBLIC_WARDEN_API_URL ?? "http://localhost:3000";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export type WardenApi = {
  fetchJson: typeof fetchJson;
};

export const wardenApi: WardenApi = {
  fetchJson,
};
