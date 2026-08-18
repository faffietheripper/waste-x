import {
  SOLO_PERMISSIONS,
  type SoloAccessPreset,
  type SoloPermission,
} from "./permissions";

/* =========================================================
   USER ROLE TYPE
========================================================= */

export type SoloUnderlyingUserRole =
  | "administrator"
  | "operations"
  | "accounts"
  | "read_only"
  | "employee"
  | "seniorManagement"
  | "platform_admin";

/* =========================================================
   PRESET HELPERS
========================================================= */

/*
  Explicitly typing the Set prevents TypeScript from
  widening permission literals such as "jobs:view"
  into generic string values.
*/
function permissionSet(
  permissions: readonly SoloPermission[],
): Set<SoloPermission> {
  return new Set<SoloPermission>(permissions);
}

/* =========================================================
   PRESET DEFINITIONS
========================================================= */

const PRESETS: Record<
  Exclude<SoloAccessPreset, "custom">,
  Set<SoloPermission>
> = {
  administrator: permissionSet(
    SOLO_PERMISSIONS,
  ),

  management: permissionSet([
    "dashboard:view",

    "jobs:view",
    "jobs:create",
    "jobs:edit",
    "jobs:cancel",

    "worksheet:view",
    "worksheet:operate",
    "loads:receive",
    "loads:reject",

    "clients:view",
    "clients:manage",

    "transport:view",
    "transport:manage",

    "materials:view",
    "materials:manage",

    "rates:view",
    "rates:manage",

    "site_permit:view",
    "site_permit:manage",

    "dwt:view",
    "dwt:review",
    "dwt:submit",

    "returns:view",
    "returns:prepare",
    "returns:export",

    "accounts:view",
    "accounts:manage_billing",
    "accounts:export",

    "reports:view",
    "reports:financial",

    "activity:view",
    "activity:export",

    "team:view",
  ]),

  operations: permissionSet([
    "dashboard:view",

    "jobs:view",
    "jobs:create",
    "jobs:edit",
    "jobs:cancel",

    "worksheet:view",
    "worksheet:operate",
    "loads:receive",
    "loads:reject",

    "clients:view",
    "clients:manage",

    "transport:view",
    "transport:manage",

    "materials:view",
    "materials:manage",

    "rates:view",

    "site_permit:view",

    "dwt:view",

    "returns:view",

    "reports:view",

    "activity:view",

    "team:view",
  ]),

  compliance: permissionSet([
    "dashboard:view",

    "jobs:view",

    "worksheet:view",

    "clients:view",

    "transport:view",

    "materials:view",

    "rates:view",

    "site_permit:view",
    "site_permit:manage",

    "dwt:view",
    "dwt:review",
    "dwt:submit",

    "returns:view",
    "returns:prepare",
    "returns:export",

    "reports:view",

    "activity:view",
    "activity:export",

    "team:view",
  ]),

  accounts: permissionSet([
    "dashboard:view",

    "jobs:view",

    "clients:view",

    "rates:view",

    "dwt:view",

    "returns:view",

    "accounts:view",
    "accounts:manage_billing",
    "accounts:export",

    "reports:view",
    "reports:financial",

    "activity:view",
    "activity:export",

    "team:view",
  ]),

  read_only: permissionSet([
    "dashboard:view",

    "jobs:view",

    "worksheet:view",

    "clients:view",

    "transport:view",

    "materials:view",

    "rates:view",

    "site_permit:view",

    "dwt:view",

    "returns:view",

    "reports:view",

    "activity:view",

    "team:view",
  ]),
};

/* =========================================================
   PRESET UI OPTIONS
========================================================= */

export const SOLO_ACCESS_PRESET_OPTIONS: Array<{
  value: Exclude<SoloAccessPreset, "custom">;
  label: string;
  description: string;
}> = [
  {
    value: "administrator",
    label: "Administrator",
    description:
      "Full Solo Workspace access including team and permissions.",
  },
  {
    value: "management",
    label: "Management",
    description:
      "Broad operational, compliance and financial access without team administration.",
  },
  {
    value: "operations",
    label: "Operations",
    description:
      "Jobs, worksheet, loads and reusable operational master data.",
  },
  {
    value: "compliance",
    label: "Compliance",
    description:
      "Receiving permit, DWT, quarterly returns and audit activity.",
  },
  {
    value: "accounts",
    label: "Accounts",
    description:
      "Billing, accountant exports and financial reporting.",
  },
  {
    value: "read_only",
    label: "Read-only",
    description:
      "View operational/compliance information without making changes.",
  },
];

/* =========================================================
   GET PRESET PERMISSIONS
========================================================= */

export function getPresetPermissions(
  preset: SoloAccessPreset,
): Set<SoloPermission> {
  if (preset === "custom") {
    return new Set<SoloPermission>();
  }

  /*
    Return a new Set so callers can safely modify their
    local effective permissions without mutating PRESETS.
  */
  return new Set<SoloPermission>(
    PRESETS[preset],
  );
}

/* =========================================================
   DEFAULT PRESET FOR UNDERLYING ROLE
========================================================= */

export function getDefaultPresetForRole(
  role: SoloUnderlyingUserRole | string,
): Exclude<SoloAccessPreset, "custom"> {
  if (
    role === "platform_admin" ||
    role === "administrator"
  ) {
    return "administrator";
  }

  if (role === "accounts") {
    return "accounts";
  }

  if (role === "read_only") {
    return "read_only";
  }

  if (role === "seniorManagement") {
    return "management";
  }

  /*
    employee and operations both default to
    the Operations Solo preset.

    Compliance is stored through soloAccessPreset
    rather than as a legacy users.role value.
  */
  return "operations";
}

/* =========================================================
   UNDERLYING ROLE FOR PRESET
========================================================= */

export function getRoleForPreset({
  preset,
  currentRole,
}: {
  preset: SoloAccessPreset;
  currentRole: SoloUnderlyingUserRole;
}): SoloUnderlyingUserRole {
  /*
    Custom changes effective permissions without
    changing the underlying application role.
  */
  if (preset === "custom") {
    return currentRole;
  }

  if (preset === "administrator") {
    return "administrator";
  }

  if (preset === "management") {
    return "seniorManagement";
  }

  if (preset === "accounts") {
    return "accounts";
  }

  if (preset === "read_only") {
    return "read_only";
  }

  /*
    Operations and Compliance are both represented
    by the operational legacy role underneath.

    Solo permissions remain the authority.
  */
  if (
    preset === "operations" ||
    preset === "compliance"
  ) {
    return "operations";
  }

  return currentRole;
}