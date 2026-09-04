import type {
  MobileFieldWorkflowEventTypeV1,
  MobileFieldWorkflowStepV1,
} from "./mobile-bootstrap";

export interface MobileFieldCertificationCloudV1 {
  ok: true;
  schemaVersion: 1;
  checkedAt: string;
  entityVersion: number;
  job: {
    id: string;
    jobNumber: string;
    status: string;
  };
  load: {
    id: string;
    loadNumber: number;
    status: string;
    netWeight: string | null;
    weightMetric: "Grams" | "Kilograms" | "Tonnes";
    notes: string | null;
  };
  fieldWorkflow: {
    step: MobileFieldWorkflowStepV1;
    updatedAt: string | null;
    lastEventType: MobileFieldWorkflowEventTypeV1 | null;
  } | null;
}
