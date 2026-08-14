// src/modules/digital-waste-tracking/core/dwtListingProfile.ts

export type DwtPhysicalForm =
  | ""
  | "Gas"
  | "Liquid"
  | "Solid"
  | "Powder"
  | "Sludge"
  | "Mixed";

export type DwtWeightMetric = "Grams" | "Kilograms" | "Tonnes";

export type DwtHazardAnswer = "" | "yes" | "no" | "unknown";

export type DwtListingProfile = {
  ewcCodes: string;
  wasteDescription: string;
  physicalForm: DwtPhysicalForm;

  typeOfContainers: string;
  numberOfContainers: string;

  weightMetric: DwtWeightMetric;
  weightAmount: string;
  weightIsEstimate: boolean;

  containsPops: DwtHazardAnswer;
  popsSourceOfComponents: string;
  popsComponentsJson: string;

  containsHazardous: DwtHazardAnswer;
  hazardousSourceOfComponents: string;
  hazardousHazCodes: string;
  hazardousComponentsJson: string;

  disposalOrRecoveryCode: string;
  specialHandlingRequirements: string;

  templateId?: string | null;
  templateVersion?: number | null;
  capturedAt?: string | null;
  capturedFrom?: string | null;
};

export type DwtListingReadiness = {
  label: string;
  tone: "muted" | "warning" | "success" | "danger";
  completedFields: number;
  totalFields: number;
  percentage: number;
  missing: string[];
  warnings: string[];
};

export function createBlankDwtListingProfile(): DwtListingProfile {
  return {
    ewcCodes: "",
    wasteDescription: "",
    physicalForm: "",

    typeOfContainers: "",
    numberOfContainers: "",

    weightMetric: "Tonnes",
    weightAmount: "",
    weightIsEstimate: true,

    containsPops: "",
    popsSourceOfComponents: "NOT_PROVIDED",
    popsComponentsJson: "",

    containsHazardous: "",
    hazardousSourceOfComponents: "NOT_PROVIDED",
    hazardousHazCodes: "",
    hazardousComponentsJson: "",

    disposalOrRecoveryCode: "",
    specialHandlingRequirements: "",

    templateId: null,
    templateVersion: null,
    capturedAt: null,
    capturedFrom: null,
  };
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim();
}

function cleanBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;

  return fallback;
}

function normaliseHazardAnswer(value: unknown): DwtHazardAnswer {
  if (value === "yes" || value === "no" || value === "unknown") {
    return value;
  }

  return "";
}

function normalisePhysicalForm(value: unknown): DwtPhysicalForm {
  if (
    value === "Gas" ||
    value === "Liquid" ||
    value === "Solid" ||
    value === "Powder" ||
    value === "Sludge" ||
    value === "Mixed"
  ) {
    return value;
  }

  return "";
}

function normaliseWeightMetric(value: unknown): DwtWeightMetric {
  if (value === "Grams" || value === "Kilograms" || value === "Tonnes") {
    return value;
  }

  return "Tonnes";
}

export function safeParseDwtListingProfile(
  value: string | DwtListingProfile | null | undefined,
): DwtListingProfile {
  if (!value) {
    return createBlankDwtListingProfile();
  }

  if (typeof value === "object") {
    return normaliseDwtListingProfile(value);
  }

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object") {
      return createBlankDwtListingProfile();
    }

    return normaliseDwtListingProfile(parsed as Partial<DwtListingProfile>);
  } catch {
    return createBlankDwtListingProfile();
  }
}

export function normaliseDwtListingProfile(
  input?: Partial<DwtListingProfile> | null,
): DwtListingProfile {
  const blank = createBlankDwtListingProfile();

  if (!input) return blank;

  return {
    ewcCodes: cleanString(input.ewcCodes),
    wasteDescription: cleanString(input.wasteDescription),
    physicalForm: normalisePhysicalForm(input.physicalForm),

    typeOfContainers: cleanString(input.typeOfContainers),
    numberOfContainers: cleanString(input.numberOfContainers),

    weightMetric: normaliseWeightMetric(input.weightMetric),
    weightAmount: cleanString(input.weightAmount),
    weightIsEstimate: cleanBoolean(input.weightIsEstimate, true),

    containsPops: normaliseHazardAnswer(input.containsPops),
    popsSourceOfComponents:
      cleanString(input.popsSourceOfComponents) || "NOT_PROVIDED",
    popsComponentsJson: cleanString(input.popsComponentsJson),

    containsHazardous: normaliseHazardAnswer(input.containsHazardous),
    hazardousSourceOfComponents:
      cleanString(input.hazardousSourceOfComponents) || "NOT_PROVIDED",
    hazardousHazCodes: cleanString(input.hazardousHazCodes),
    hazardousComponentsJson: cleanString(input.hazardousComponentsJson),

    disposalOrRecoveryCode: cleanString(input.disposalOrRecoveryCode),
    specialHandlingRequirements: cleanString(input.specialHandlingRequirements),

    templateId: input.templateId ?? null,
    templateVersion: input.templateVersion ?? null,
    capturedAt: input.capturedAt ?? null,
    capturedFrom: input.capturedFrom ?? null,
  };
}

export function hasAnyDwtListingProfileValue(profile: DwtListingProfile) {
  return Boolean(
    profile.ewcCodes ||
      profile.wasteDescription ||
      profile.physicalForm ||
      profile.typeOfContainers ||
      profile.numberOfContainers ||
      profile.weightAmount ||
      profile.containsPops ||
      profile.containsHazardous ||
      profile.hazardousHazCodes ||
      profile.disposalOrRecoveryCode ||
      profile.specialHandlingRequirements,
  );
}

export function getDwtListingProfileReadiness(
  input?: Partial<DwtListingProfile> | null,
): DwtListingReadiness {
  const profile = normaliseDwtListingProfile(input);

  const checks = [
    {
      key: "ewcCodes",
      label: "EWC code",
      complete: Boolean(profile.ewcCodes),
    },
    {
      key: "wasteDescription",
      label: "DWT waste description",
      complete: Boolean(profile.wasteDescription),
    },
    {
      key: "physicalForm",
      label: "physical form",
      complete: Boolean(profile.physicalForm),
    },
    {
      key: "typeOfContainers",
      label: "container type",
      complete: Boolean(profile.typeOfContainers),
    },
    {
      key: "numberOfContainers",
      label: "number of containers",
      complete: Boolean(profile.numberOfContainers),
    },
    {
      key: "weightAmount",
      label: "estimated weight",
      complete: Boolean(profile.weightAmount),
    },
    {
      key: "containsPops",
      label: "POPs check",
      complete:
        profile.containsPops === "yes" ||
        profile.containsPops === "no" ||
        profile.containsPops === "unknown",
    },
    {
      key: "containsHazardous",
      label: "hazardous check",
      complete:
        profile.containsHazardous === "yes" ||
        profile.containsHazardous === "no" ||
        profile.containsHazardous === "unknown",
    },
    {
      key: "disposalOrRecoveryCode",
      label: "recovery/disposal route",
      complete: Boolean(profile.disposalOrRecoveryCode),
    },
  ];

  const completedFields = checks.filter((check) => check.complete).length;
  const totalFields = checks.length;

  const missing = checks
    .filter((check) => !check.complete)
    .map((check) => check.label);

  const warnings: string[] = [];

  if (profile.containsPops === "unknown") {
    warnings.push("POPs status needs review before submission.");
  }

  if (profile.containsHazardous === "unknown") {
    warnings.push("Hazardous status needs review before submission.");
  }

  if (profile.containsHazardous === "yes" && !profile.hazardousHazCodes) {
    warnings.push("Hazardous waste should include hazardous property codes.");
  }

  const percentage = Math.round((completedFields / totalFields) * 100);

  if (completedFields === 0) {
    return {
      label: "No DWT prefill",
      tone: "muted",
      completedFields,
      totalFields,
      percentage,
      missing,
      warnings,
    };
  }

  if (missing.length === 0 && warnings.length === 0) {
    return {
      label: "DWT ready",
      tone: "success",
      completedFields,
      totalFields,
      percentage,
      missing,
      warnings,
    };
  }

  if (warnings.length > 0 || missing.length <= 3) {
    return {
      label: `DWT ${percentage}% ready`,
      tone: "warning",
      completedFields,
      totalFields,
      percentage,
      missing,
      warnings,
    };
  }

  return {
    label: `DWT ${percentage}% ready`,
    tone: "muted",
    completedFields,
    totalFields,
    percentage,
    missing,
    warnings,
  };
}

export function formatDwtHazardAnswer(value: DwtHazardAnswer) {
  if (value === "yes") return "Yes";
  if (value === "no") return "No / not expected";
  if (value === "unknown") return "Not sure / review later";

  return "Not set";
}