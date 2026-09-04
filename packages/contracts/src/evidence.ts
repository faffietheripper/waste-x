export interface EvidenceUploadRequestV1 {
  evidenceId: string;
  siteId?: string | null;
  entityType: "job" | "job_load";
  entityId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256: string;
}

export interface EvidenceUploadResponseV1 {
  evidenceId: string;
  upload?: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
    contentType: string;
    expiresInSeconds: number;
  };
  alreadyUploaded?: boolean;
  evidence?: unknown;
}

export interface EvidenceCompleteResponseV1 {
  evidence: unknown;
  alreadyUploaded?: boolean;
}
