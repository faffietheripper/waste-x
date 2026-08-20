export type BatchQueueRow = {
  jobLoadId: string;
  receiptId: string;
  jobNumber: string;
  loadNumber: number;
  receivedAt: string | null;
  clientName: string;
  originName: string;
  ewcCode: string;
  wasteDescription: string;
  weightLabel: string;
  vehicleRegistration: string;
  previousSubmissionStatus: string | null;
  previousWasteTrackingId: string | null;
};

export type MissingDraftRow = Omit<BatchQueueRow, "receiptId"> & {
  receiptId: null;
};

export type SubmittedBatchRow = BatchQueueRow & {
  submittedAt: string | null;
  submissionStatus: "accepted" | "accepted_with_warnings" | "submitted";
};

export type BatchValidationIssue = {
  key: string;
  message: string;
  errorType?: string;
};

export type BatchValidationItem = {
  jobLoadId: string;
  ready: boolean;
  alreadySubmitted: boolean;
  errors: BatchValidationIssue[];
  warnings: BatchValidationIssue[];
};

export type BatchValidationResult = {
  success: boolean;
  items: BatchValidationItem[];
  globalErrors: string[];
};

export type BatchSubmissionItem = {
  jobLoadId: string;
  success: boolean;
  status: string | null;
  message: string;
  wasteTrackingId: string | null;
  warnings: BatchValidationIssue[];
  errors: BatchValidationIssue[];
};

export type BatchSubmissionResult = {
  success: boolean;
  requested: number;
  submitted: number;
  failed: number;
  items: BatchSubmissionItem[];
};
