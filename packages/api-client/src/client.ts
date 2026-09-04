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
  MobileAssignmentBootstrapV1,
  MobileFieldCertificationCloudV1,
  MobileLoginRequestV1,
  MobileLoginResponseV1,
  MobileOfflineEntitlementResponseV1,
  MobileProvisionRequestV1,
  MobileProvisionResponseV1,
  MobileRefreshRequestV1,
  MobileRefreshResponseV1,
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

  refreshMobile(body: MobileRefreshRequestV1) {
    return this.request<MobileRefreshResponseV1>(
      "/api/mobile/v1/auth/refresh",
      { method: "POST", body: JSON.stringify(body) },
      false,
      true,
    );
  }

  offlineEntitlementMobile() {
    return this.request<MobileOfflineEntitlementResponseV1>(
      "/api/mobile/v1/auth/offline-entitlement",
    );
  }

  bootstrapMobile() {
    return this.request<MobileAssignmentBootstrapV1 & { ok: true }>(
      "/api/mobile/v1/bootstrap",
    );
  }

  certifyMobileLoad(loadId: string) {
    return this.request<MobileFieldCertificationCloudV1>(
      `/api/mobile/v1/certification/${encodeURIComponent(loadId)}`,
    );
  }

  pushMobileSync(body: SyncPushRequestV1) {
    return this.request<SyncPushResponseV1 & { batchId: string; ok: true }>(
      "/api/mobile/v1/sync/push",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
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
    deviceOnly = false,
  ): Promise<T> {
    const [token, deviceSecret] = await Promise.all([
      authenticated
        ? this.getAccessToken?.() ?? Promise.resolve(null)
        : Promise.resolve(null),
      authenticated || deviceOnly
        ? this.getDeviceSecret?.() ?? Promise.resolve(null)
        : Promise.resolve(null),
    ]);

    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");

    if (init.body) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (deviceSecret) headers.set("X-Waste-X-Device-Secret", deviceSecret);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers,
      });
    } catch (error) {
      if (error instanceof WasteXApiError) throw error;
      throw new WasteXApiError(
        "Waste X Cloud is unreachable. Check connectivity, or use offline access if this device is already authorised.",
        0,
        "CLOUD_UNREACHABLE",
      );
    }

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
