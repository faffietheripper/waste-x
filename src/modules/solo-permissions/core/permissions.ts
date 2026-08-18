export const SOLO_PERMISSIONS = [
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
  "team:invite",
  "team:manage",
  "permissions:manage",
] as const;

export type SoloPermission = (typeof SOLO_PERMISSIONS)[number];

export type SoloPermissionEffect = "allow" | "deny";

export type SoloAccessPreset =
  | "administrator"
  | "management"
  | "operations"
  | "compliance"
  | "accounts"
  | "read_only"
  | "custom";

export type SoloPermissionGroup = {
  id: string;
  label: string;
  description: string;
  permissions: Array<{
    permission: SoloPermission;
    label: string;
    description: string;
  }>;
};

export const SOLO_PERMISSION_GROUPS: SoloPermissionGroup[] = [
  {
    id: "operations",
    label: "Operations",
    description: "Jobs, worksheet and physical load handling.",
    permissions: [
      {
        permission: "jobs:view",
        label: "View jobs",
        description: "Open the Jobs register and job detail pages.",
      },
      {
        permission: "jobs:create",
        label: "Book jobs",
        description: "Create new jobs, repeats and jobs from templates.",
      },
      {
        permission: "jobs:edit",
        label: "Edit jobs",
        description: "Change editable job planning and booking information.",
      },
      {
        permission: "jobs:cancel",
        label: "Cancel jobs",
        description: "Cancel jobs that have not been completed.",
      },
      {
        permission: "worksheet:view",
        label: "View Daily Worksheet",
        description: "See the live operational worksheet.",
      },
      {
        permission: "worksheet:operate",
        label: "Operate Daily Worksheet",
        description: "Move loads through arrival, acceptance and completion.",
      },
      {
        permission: "loads:receive",
        label: "Receive loads",
        description: "Record actual receipt details, weights and tickets.",
      },
      {
        permission: "loads:reject",
        label: "Reject loads",
        description: "Reject an incoming load with a recorded reason.",
      },
    ],
  },
  {
    id: "business-data",
    label: "Business Data",
    description: "Customers, transport, materials and commercial rate books.",
    permissions: [
      {
        permission: "clients:view",
        label: "View clients",
        description: "View clients and their job/origin sites.",
      },
      {
        permission: "clients:manage",
        label: "Manage clients",
        description: "Create and edit clients and client sites.",
      },
      {
        permission: "transport:view",
        label: "View transport",
        description: "View hauliers, drivers and vehicles.",
      },
      {
        permission: "transport:manage",
        label: "Manage transport",
        description: "Create and edit hauliers, drivers and vehicles.",
      },
      {
        permission: "materials:view",
        label: "View materials",
        description: "View Material Profiles, EWC and D/R information.",
      },
      {
        permission: "materials:manage",
        label: "Manage materials",
        description: "Create and edit reusable Material Profiles.",
      },
      {
        permission: "rates:view",
        label: "View rates",
        description: "View customer charges and recorded direct-cost rates.",
      },
      {
        permission: "rates:manage",
        label: "Manage rates",
        description: "Create, edit and archive commercial rates.",
      },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    description: "Receiving authorisation, DWT and regulatory returns.",
    permissions: [
      {
        permission: "site_permit:view",
        label: "View Receiving Site & Permit",
        description: "View receiving-site and environmental-permit setup.",
      },
      {
        permission: "site_permit:manage",
        label: "Manage Receiving Site & Permit",
        description: "Edit permit details and configured permitted EWC codes.",
      },
      {
        permission: "dwt:view",
        label: "View DWT Centre",
        description: "View receipt drafts, statuses and submission history.",
      },
      {
        permission: "dwt:review",
        label: "Review / edit DWT",
        description: "Open and edit prepared Receipt of Waste drafts.",
      },
      {
        permission: "dwt:submit",
        label: "Submit / update DWT",
        description: "Explicitly submit or update a Receipt of Waste movement.",
      },
      {
        permission: "returns:view",
        label: "View quarterly returns",
        description: "View return-preparation totals and exceptions.",
      },
      {
        permission: "returns:prepare",
        label: "Prepare quarterly returns",
        description: "Work through regulatory return preparation and exceptions.",
      },
      {
        permission: "returns:export",
        label: "Export quarterly returns",
        description: "Download return-preparation CSV / Excel outputs.",
      },
    ],
  },
  {
    id: "commercial",
    label: "Accounts & Reporting",
    description: "Billing administration, commercial data and exports.",
    permissions: [
      {
        permission: "accounts:view",
        label: "View accounts",
        description: "See revenue, direct costs and unbilled completed work.",
      },
      {
        permission: "accounts:manage_billing",
        label: "Manage billing status",
        description: "Mark completed jobs billed or undo billing markers.",
      },
      {
        permission: "accounts:export",
        label: "Accountant exports",
        description: "Download accountant-friendly CSV / Excel outputs.",
      },
      {
        permission: "reports:view",
        label: "View reports",
        description: "Open operational and compliance reporting.",
      },
      {
        permission: "reports:financial",
        label: "View financial reports",
        description: "See revenue, cost, margin and other financial reporting.",
      },
    ],
  },
  {
    id: "governance",
    label: "Activity & Governance",
    description: "Organisation activity history and audit exports.",
    permissions: [
      {
        permission: "activity:view",
        label: "View activity",
        description: "See organisation operational and audit activity.",
      },
      {
        permission: "activity:export",
        label: "Export activity",
        description: "Download organisation audit/activity records.",
      },
    ],
  },
  {
    id: "team",
    label: "Team",
    description: "Organisation member management and access control.",
    permissions: [
      {
        permission: "team:view",
        label: "View team",
        description: "View active, invited and suspended members.",
      },
      {
        permission: "team:invite",
        label: "Invite members",
        description: "Invite new members into this organisation.",
      },
      {
        permission: "team:manage",
        label: "Manage members",
        description: "Suspend, reactivate and cancel invitations.",
      },
      {
        permission: "permissions:manage",
        label: "Manage permissions",
        description: "Change access presets and custom user permissions.",
      },
    ],
  },
];

export function isSoloPermission(value: string): value is SoloPermission {
  return (SOLO_PERMISSIONS as readonly string[]).includes(value);
}

export function isSoloAccessPreset(value: string): value is SoloAccessPreset {
  return [
    "administrator",
    "management",
    "operations",
    "compliance",
    "accounts",
    "read_only",
    "custom",
  ].includes(value);
}
