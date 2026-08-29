import type {
  DesktopBootstrapV1,
  SyncPullRequestV1,
  SyncPullResponseV1,
  SyncPushRequestV1,
  SyncPushResponseV1,
} from "@waste-x/contracts";

export type AccessTokenProvider = () => Promise<string | null>;

export interface WasteXApiClientOptions {
  baseUrl: string;
  getAccessToken?: AccessTokenProvider;
  fetchImpl?: typeof fetch;
}

export class WasteXApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "WasteXApiError";
  }
}

export class WasteXApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: AccessTokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WasteXApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  health() {
    return this.request<{ status: "ok" }>("/api/desktop/v1/health");
  }

  bootstrap() {
    return this.request<DesktopBootstrapV1>("/api/desktop/v1/bootstrap");
  }

  pushSync(body: SyncPushRequestV1) {
    return this.request<SyncPushResponseV1>("/api/sync/v1/push", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  pullSync(body: SyncPullRequestV1) {
    return this.request<SyncPullResponseV1>("/api/sync/v1/pull", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken?.();

    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");

    if (init.body) {
      headers.set("Content-Type", "application/json");
    }

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      let code: string | undefined;

      try {
        const body = (await response.json()) as { code?: string };
        code = body.code;
      } catch {
        // Response did not contain a JSON error body.
      }

      throw new WasteXApiError(
        `Waste X API request failed with status ${response.status}.`,
        response.status,
        code,
      );
    }

    return (await response.json()) as T;
  }
}
