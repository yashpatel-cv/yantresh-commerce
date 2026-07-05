export type CommerceClientConfig = {
  baseUrl: string;
  publishableKey: string;
};

type StoreRequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export function createCommerceClient({ baseUrl, publishableKey }: CommerceClientConfig) {
  const storeBase = `${baseUrl.replace(/\/$/, "")}/store`;

  async function request<T>(path: string, options: StoreRequestOptions = {}): Promise<T> {
    const { method = "GET", body, signal } = options;
    const res = await fetch(`${storeBase}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": publishableKey
      },
      ...(body != null ? { body: JSON.stringify(body) } : {}),
      signal
    });

    if (!res.ok) {
      throw new Error(`Medusa Store API ${method} ${path}: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  return { request };
}
