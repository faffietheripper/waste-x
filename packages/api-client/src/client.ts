import type {
  DesktopBootstrapV1,
  DesktopLoginRequestV1,
  DesktopLoginResponseV1,
  DesktopOfflineEntitlementResponseV1,
  DesktopProvisionRequestV1,
  DesktopProvisionResponseV1,
  EvidenceCompleteResponseV1,
  EvidenceUploadRequestV1,
  EvidenceUploadResponseV1,
  MobileLoginRequestV1,
  MobileLoginResponseV1,
  MobileOfflineEntitlementResponseV1,
  MobileProvisionRequestV1,
  MobileProvisionResponseV1,
  SyncPullRequestV1,
  SyncPullResponseV1,
  SyncPushRequestV1,
  SyncPushResponseV1,
} from "@waste-x/contracts";

export type AccessTokenProvider = () => Promise<string | null>;
export type DeviceSecretProvider = () => Promise<string | null>;

export interface WasteXApiClientOptions {
  baseUrl: string;
  getAccessToken?: AccessTokenProvider;
  getDeviceSecret?: DeviceSecretProvider;
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
  private readonly getDeviceSecret?: DeviceSecretProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WasteXApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.getAccessToken = options.getAccessToken;
    this.getDeviceSecret = options.getDeviceSecret;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  health() {
    return this.request<{ status: "ok" }>("/api/desktop/v1/health", {}, false);
  }

  provisionDesktop(body: DesktopProvisionRequestV1) {
    return this.request<DesktopProvisionResponseV1>(
      "/api/desktop/v1/auth/provision",
      { method: "POST", body: JSON.stringify(body) },
      false,
    );
  }

  loginDesktop(body: DesktopLoginRequestV1) {
    return this.request<DesktopLoginResponseV1>(
      "/api/desktop/v1/auth/login",
      { method: "POST", body: JSON.stringify(body) },
      false,
    );
  }

  offlineEntitlementDesktop() {
    return this.request<DesktopOfflineEntitlementResponseV1>(
      "/api/desktop/v1/auth/offline-entitlement",
    );
  }

  logoutDesktop() {
    return this.request<{ loggedOut: true }>("/api/desktop/v1/auth/logout", {
      method: "POST",
    });
  }

  provisionMobile(body: MobileProvisionRequestV1) {
    return this.request<MobileProvisionResponseV1>(
      "/api/mobile/v1/auth/provision",
      { method: "POST", body: JSON.stringify(body) },
      false,
    );
  }

  loginMobile(body: MobileLoginRequestV1) {
    return this.request<MobileLoginResponseV1>(
      "/api/mobile/v1/auth/login",
      { method: "POST", body: JSON.stringify(body) },
      false,
    );
  }

  offlineEntitlementMobile() {
    return this.request<MobileOfflineEntitlementResponseV1>(
      "/api/mobile/v1/auth/offline-entitlement",
    );
  }

  logoutMobile() {
    return this.request<{ loggedOut: true }>("/api/mobile/v1/auth/logout", {
      method: "POST",
    });
  }

  revokeCurrentDevice() {
    return this.request<{ revoked: true; deviceId: string }>(
      "/api/desktop/v1/auth/device",
      { method: "DELETE" },
    );
  }

  bootstrap() {
    return this.request<DesktopBootstrapV1>("/api/desktop/v1/bootstrap");
  }

  pushSync(body: SyncPushRequestV1) {
    return this.request<SyncPushResponseV1>("/api/desktop/v1/sync/push", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  pullSync(body: SyncPullRequestV1) {
    return this.request<SyncPullResponseV1>("/api/desktop/v1/sync/pull", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  initiateEvidence(body: EvidenceUploadRequestV1) {
    return this.request<EvidenceUploadResponseV1>("/api/desktop/v1/evidence", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  completeEvidence(evidenceId: string) {
    return this.request<EvidenceCompleteResponseV1>(
      "/api/desktop/v1/evidence",
      {
        method: "PATCH",
        body: JSON.stringify({ evidenceId }),
      },
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    authenticated = true,
  ): Promise<T> {
    const [token, deviceSecret] = authenticated
      ? await Promise.all([
          this.getAccessToken?.() ?? Promise.resolve(null),
          this.getDeviceSecret?.() ?? Promise.resolve(null),
        ])
      : [null, null];

    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");

    if (init.body) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (deviceSecret) headers.set("X-Waste-X-Device-Secret", deviceSecret);

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    const responseBody = (await response.json().catch(() => null)) as
      | ({ error?: { code?: string; message?: string } } & T)
      | null;

    if (!response.ok) {
      throw new WasteXApiError(
        responseBody?.error?.message ??
          `Waste X API request failed with status ${response.status}.`,
        response.status,
        responseBody?.error?.code,
      );
    }

    return responseBody as T;
  }
}
