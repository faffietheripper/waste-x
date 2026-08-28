#!/usr/bin/env node
"use strict";

/*
  Waste X — Own Carrier / Driver / DWT integration v1
  WASTE_X_OWN_CARRIER_DRIVER_DWT_V1

  IMPORTANT:
  - Built against the current `demo` branch structure reviewed on 28 Aug 2026.
  - Refuses to run on a non-demo branch unless --allow-non-demo is supplied.
  - Validates EVERY patch in memory before writing ANY existing target file.
  - Creates no database migration. The organisation-level own-carrier fields
    already exist in bb_waste_tracking_organisation_setting.
*/

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SENTINEL = "WASTE_X_OWN_CARRIER_DRIVER_DWT_V1";
const ROOT = process.cwd();
const ALLOW_NON_DEMO = process.argv.includes("--allow-non-demo");

const NEW_FILES = {
  "src/modules/digital-waste-tracking/data-access/saveOwnCarrierDwtSettings.ts": "/* WASTE_X_OWN_CARRIER_DRIVER_DWT_V1 */\n\nimport { database } from \"@/db/database\";\nimport { wasteTrackingOrganisationSettings } from \"@/db/schema\";\n\nimport {\n  isMeansOfTransport,\n  isReasonForNoRegistrationNumber,\n  type MeansOfTransport,\n  type ReasonForNoRegistrationNumber,\n} from \"../types/receiveMovement.types\";\n\nexport type OwnCarrierDwtSettingsInput = {\n  registrationNumber?: string | null;\n  reasonForNoRegistrationNumber?: string | null;\n  meansOfTransport?: string | null;\n};\n\nexport type NormalisedOwnCarrierDwtSettings = {\n  registrationNumber: string | null;\n  reasonForNoRegistrationNumber: ReasonForNoRegistrationNumber | null;\n  meansOfTransport: MeansOfTransport;\n};\n\nexport type SaveOwnCarrierDwtSettingsResult =\n  | {\n      ok: true;\n      settings: NormalisedOwnCarrierDwtSettings;\n    }\n  | {\n      ok: false;\n      code: \"invalid_reason\" | \"invalid_means\";\n      error: string;\n    };\n\nfunction clean(value: string | null | undefined) {\n  return typeof value === \"string\" ? value.trim() : \"\";\n}\n\nexport function canManageOwnCarrierDwtSettings(\n  role: string | null | undefined,\n) {\n  return (\n    role === \"administrator\" ||\n    role === \"seniorManagement\" ||\n    role === \"platform_admin\"\n  );\n}\n\nexport function normaliseOwnCarrierDwtSettings(\n  input: OwnCarrierDwtSettingsInput,\n): SaveOwnCarrierDwtSettingsResult {\n  const rawRegistration = clean(input.registrationNumber);\n  const registrationNumber = rawRegistration\n    ? rawRegistration.toUpperCase()\n    : null;\n\n  const rawReason = clean(input.reasonForNoRegistrationNumber);\n  const rawMeans = clean(input.meansOfTransport) || \"Road\";\n\n  if (rawReason && !isReasonForNoRegistrationNumber(rawReason)) {\n    return {\n      ok: false,\n      code: \"invalid_reason\",\n      error: \"Choose a valid reason for having no carrier registration number.\",\n    };\n  }\n\n  if (!isMeansOfTransport(rawMeans)) {\n    return {\n      ok: false,\n      code: \"invalid_means\",\n      error: \"Choose a valid means of transport.\",\n    };\n  }\n\n  return {\n    ok: true,\n    settings: {\n      registrationNumber,\n      reasonForNoRegistrationNumber:\n        !registrationNumber && rawReason\n          ? (rawReason as ReasonForNoRegistrationNumber)\n          : null,\n      meansOfTransport: rawMeans,\n    },\n  };\n}\n\nexport async function saveOwnCarrierDwtSettings(params: {\n  organisationId: string;\n  input: OwnCarrierDwtSettingsInput;\n}): Promise<SaveOwnCarrierDwtSettingsResult> {\n  const normalised = normaliseOwnCarrierDwtSettings(params.input);\n\n  if (!normalised.ok) return normalised;\n\n  await database\n    .insert(wasteTrackingOrganisationSettings)\n    .values({\n      organisationId: params.organisationId,\n      ownCarrierRegistrationNumber: normalised.settings.registrationNumber,\n      ownCarrierReasonForNoRegistrationNumber:\n        normalised.settings.reasonForNoRegistrationNumber,\n      ownCarrierMeansOfTransport: normalised.settings.meansOfTransport,\n      updatedAt: new Date(),\n    })\n    .onConflictDoUpdate({\n      target: wasteTrackingOrganisationSettings.organisationId,\n      set: {\n        ownCarrierRegistrationNumber: normalised.settings.registrationNumber,\n        ownCarrierReasonForNoRegistrationNumber:\n          normalised.settings.reasonForNoRegistrationNumber,\n        ownCarrierMeansOfTransport: normalised.settings.meansOfTransport,\n        updatedAt: new Date(),\n      },\n    });\n\n  return normalised;\n}\n",
  "src/modules/digital-waste-tracking/components/OwnCarrierDwtFields.tsx": "\"use client\";\n/* WASTE_X_OWN_CARRIER_DRIVER_DWT_V1 */\n\nimport { useState } from \"react\";\n\nimport {\n  MEANS_OF_TRANSPORT,\n  REASON_FOR_NO_REGISTRATION_NUMBER,\n  type MeansOfTransport,\n  type ReasonForNoRegistrationNumber,\n} from \"@/modules/digital-waste-tracking/types/receiveMovement.types\";\n\ntype Props = {\n  canEdit: boolean;\n  initial: {\n    registrationNumber: string;\n    reasonForNoRegistrationNumber: ReasonForNoRegistrationNumber | \"\";\n    meansOfTransport: MeansOfTransport;\n  };\n};\n\nconst inputClass =\n  \"h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/40\";\n\nfunction reasonLabel(value: ReasonForNoRegistrationNumber) {\n  const labels: Record<ReasonForNoRegistrationNumber, string> = {\n    ON_SITE: \"Movement within the same premises\",\n    HOUSEHOLD: \"Householder transporting own waste\",\n    ONE_OFF: \"One-off / infrequent waste transport\",\n    MARINE: \"Marine licence / exempt movement\",\n  };\n\n  return labels[value];\n}\n\nexport default function OwnCarrierDwtFields({ canEdit, initial }: Props) {\n  const [registrationNumber, setRegistrationNumber] = useState(\n    initial.registrationNumber,\n  );\n  const [reason, setReason] = useState<ReasonForNoRegistrationNumber | \"\">(\n    initial.reasonForNoRegistrationNumber,\n  );\n  const [meansOfTransport, setMeansOfTransport] = useState<MeansOfTransport>(\n    initial.meansOfTransport,\n  );\n\n  const hasRegistration = Boolean(registrationNumber.trim());\n\n  return (\n    <div className=\"space-y-4\">\n      {canEdit ? (\n        <input type=\"hidden\" name=\"ownCarrierDwtPresent\" value=\"1\" />\n      ) : null}\n\n      <div className=\"rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs leading-5 text-orange-950/75\">\n        This is your organisation&apos;s own-carrier identity, not a registration\n        belonging to the individual driver. Waste X reuses it for every own-fleet\n        DWT movement. External drivers continue to use the selected haulier&apos;s\n        carrier registration.\n      </div>\n\n      <div className=\"grid gap-4 md:grid-cols-2\">\n        <label className=\"block\">\n          <span className=\"mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40\">\n            Carrier registration number\n          </span>\n          <input\n            name=\"ownCarrierRegistrationNumber\"\n            value={registrationNumber}\n            disabled={!canEdit}\n            onChange={(event) => {\n              const next = event.target.value;\n              setRegistrationNumber(next);\n              if (next.trim()) setReason(\"\");\n            }}\n            placeholder=\"Example: CBDU123456\"\n            className={inputClass}\n          />\n          <span className=\"mt-2 block text-xs leading-5 text-black/35\">\n            For a recycling company using its own drivers on public-road waste\n            collections, this is normally the organisation&apos;s carrier registration.\n          </span>\n        </label>\n\n        <label className=\"block\">\n          <span className=\"mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40\">\n            Reason if no registration applies\n          </span>\n          <select\n            name=\"ownCarrierReasonForNoRegistrationNumber\"\n            value={hasRegistration ? \"\" : reason}\n            disabled={!canEdit || hasRegistration}\n            onChange={(event) =>\n              setReason(\n                event.target.value as ReasonForNoRegistrationNumber | \"\",\n              )\n            }\n            className={inputClass}\n          >\n            <option value=\"\">Choose only when genuinely applicable</option>\n            {REASON_FOR_NO_REGISTRATION_NUMBER.map((value) => (\n              <option key={value} value={value}>\n                {reasonLabel(value)}\n              </option>\n            ))}\n          </select>\n          <span className=\"mt-2 block text-xs leading-5 text-black/35\">\n            Do not use an exception just because the organisation&apos;s registration\n            has not been entered yet.\n          </span>\n        </label>\n\n        <label className=\"block md:col-span-2\">\n          <span className=\"mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40\">\n            Default means of transport\n          </span>\n          <select\n            name=\"ownCarrierMeansOfTransport\"\n            value={meansOfTransport}\n            disabled={!canEdit}\n            onChange={(event) =>\n              setMeansOfTransport(event.target.value as MeansOfTransport)\n            }\n            className={inputClass}\n          >\n            {MEANS_OF_TRANSPORT.map((value) => (\n              <option key={value} value={value}>\n                {value}\n              </option>\n            ))}\n          </select>\n        </label>\n      </div>\n\n      {!canEdit ? (\n        <p className=\"text-xs leading-5 text-black/40\">\n          Only organisation administrators or senior management can change this\n          organisation-level DWT identity. You can still create or edit the driver.\n        </p>\n      ) : null}\n    </div>\n  );\n}\n"
};
const PATCHES = [
  {
    "path": "src/app/home/transport/actions.ts",
    "operations": [
      {
        "label": "import own carrier helper",
        "old": "import {\n  counterparties,\n  counterpartyRoles,\n  drivers,\n  users,\n  vehicles,\n} from \"@/db/schema\";",
        "new": "import {\n  counterparties,\n  counterpartyRoles,\n  drivers,\n  users,\n  vehicles,\n} from \"@/db/schema\";\nimport {\n  canManageOwnCarrierDwtSettings,\n  saveOwnCarrierDwtSettings,\n} from \"@/modules/digital-waste-tracking/data-access/saveOwnCarrierDwtSettings\";"
      },
      {
        "label": "add role to organisation context",
        "old": "type OrganisationContext = {\n  userId: string;\n  organisationId: string;\n};",
        "new": "type OrganisationContext = {\n  userId: string;\n  organisationId: string;\n  role: string | null;\n};"
      },
      {
        "label": "read member role",
        "old": "      organisationId: true,\n      isActive: true,\n      isSuspended: true,\n    },",
        "new": "      organisationId: true,\n      role: true,\n      isActive: true,\n      isSuspended: true,\n    },"
      },
      {
        "label": "return member role",
        "old": "  return {\n    userId: currentUser.id,\n    organisationId: currentUser.organisationId,\n  };\n}",
        "new": "  return {\n    userId: currentUser.id,\n    organisationId: currentUser.organisationId,\n    role: currentUser.role,\n  };\n}"
      },
      {
        "label": "add own carrier driver-form persistence",
        "old": "function normaliseTare(value: FormDataEntryValue | null) {\n  const cleaned = cleanString(value);\n  if (!cleaned) return null;\n\n  const parsed = Number(cleaned);\n  if (!Number.isFinite(parsed) || parsed < 0) return \"INVALID\" as const;\n\n  return parsed.toFixed(3);\n}",
        "new": "function normaliseTare(value: FormDataEntryValue | null) {\n  const cleaned = cleanString(value);\n  if (!cleaned) return null;\n\n  const parsed = Number(cleaned);\n  if (!Number.isFinite(parsed) || parsed < 0) return \"INVALID\" as const;\n\n  return parsed.toFixed(3);\n}\n\nasync function saveOwnCarrierDwtFromDriverForm(\n  formData: FormData,\n  context: OrganisationContext,\n  haulierId: string | null,\n) {\n  if (haulierId) return null;\n  if (cleanString(formData.get(\"ownCarrierDwtPresent\")) !== \"1\") return null;\n  if (!canManageOwnCarrierDwtSettings(context.role)) return null;\n\n  const result = await saveOwnCarrierDwtSettings({\n    organisationId: context.organisationId,\n    input: {\n      registrationNumber: cleanString(\n        formData.get(\"ownCarrierRegistrationNumber\"),\n      ),\n      reasonForNoRegistrationNumber: cleanString(\n        formData.get(\"ownCarrierReasonForNoRegistrationNumber\"),\n      ),\n      meansOfTransport: cleanString(\n        formData.get(\"ownCarrierMeansOfTransport\"),\n      ),\n    },\n  });\n\n  if (!result.ok) {\n    return `own_carrier_${result.code}`;\n  }\n\n  revalidatePath(\"/home/settings/digital-waste-tracking\");\n  revalidatePath(\"/home/dwt\");\n  revalidatePath(\"/home/dwt/batch\");\n\n  return null;\n}"
      },
      {
        "label": "save own carrier settings on driver create",
        "old": "  const [created] = await database\n    .insert(drivers)",
        "new": "  const ownCarrierError = await saveOwnCarrierDwtFromDriverForm(\n    formData,\n    context,\n    haulierId,\n  );\n\n  if (ownCarrierError) {\n    redirect(`/home/transport/drivers/new?error=${ownCarrierError}`);\n  }\n\n  const [created] = await database\n    .insert(drivers)"
      },
      {
        "label": "save own carrier settings on driver update",
        "old": "  await database\n    .update(drivers)\n    .set({\n      name,\n      telephone,\n      email,\n      haulierCounterpartyId: haulierId,\n      defaultVehicleId,\n      notes,\n      updatedAt: new Date(),\n    })",
        "new": "  const ownCarrierError = await saveOwnCarrierDwtFromDriverForm(\n    formData,\n    context,\n    haulierId,\n  );\n\n  if (ownCarrierError) {\n    driverError(driverId, ownCarrierError);\n  }\n\n  await database\n    .update(drivers)\n    .set({\n      name,\n      telephone,\n      email,\n      haulierCounterpartyId: haulierId,\n      defaultVehicleId,\n      notes,\n      updatedAt: new Date(),\n    })"
      }
    ],
    "sentinelAfter": "\"use server\";"
  },
  {
    "path": "src/app/home/transport/drivers/new/page.tsx",
    "operations": [
      {
        "label": "import DWT own carrier UI",
        "old": "import {\n  counterparties,\n  counterpartyRoles,\n  users,\n  vehicles,\n} from \"@/db/schema\";\nimport { createDriverAction } from \"../../actions\";",
        "new": "import {\n  counterparties,\n  counterpartyRoles,\n  users,\n  vehicles,\n} from \"@/db/schema\";\nimport OwnCarrierDwtFields from \"@/modules/digital-waste-tracking/components/OwnCarrierDwtFields\";\nimport {\n  canManageOwnCarrierDwtSettings,\n} from \"@/modules/digital-waste-tracking/data-access/saveOwnCarrierDwtSettings\";\nimport { getWasteTrackingOrganisationSettings } from \"@/modules/digital-waste-tracking/data-access/getWasteTrackingOrganisationSettings\";\nimport { createDriverAction } from \"../../actions\";"
      },
      {
        "label": "add own carrier error messages",
        "old": "    vehicle_haulier_mismatch: \"The default vehicle belongs to a different haulier.\",\n    create_failed: \"Waste X could not create the driver.\",",
        "new": "    vehicle_haulier_mismatch: \"The default vehicle belongs to a different haulier.\",\n    own_carrier_invalid_reason: \"Choose a valid reason for having no carrier registration.\",\n    own_carrier_invalid_means: \"Choose a valid means of transport.\",\n    create_failed: \"Waste X could not create the driver.\","
      },
      {
        "label": "read role for own carrier permissions",
        "old": "    columns: { organisationId: true },\n  });",
        "new": "    columns: { organisationId: true, role: true },\n  });"
      },
      {
        "label": "load own carrier DWT settings",
        "old": "  const organisationId = currentUser.organisationId;\n  const selectedHaulierId = firstParam(searchParams.haulierId);\n  const error = firstParam(searchParams.error);\n\n  const [hauliers, vehicleRows] = await Promise.all([",
        "new": "  const organisationId = currentUser.organisationId;\n  const selectedHaulierId = firstParam(searchParams.haulierId);\n  const error = firstParam(searchParams.error);\n\n  const dwtSettings = await getWasteTrackingOrganisationSettings({\n    organisationId,\n  });\n  const canEditOwnCarrierDwt = canManageOwnCarrierDwtSettings(\n    currentUser.role,\n  );\n\n  const [hauliers, vehicleRows] = await Promise.all(["
      },
      {
        "label": "add own carrier fields to new driver form",
        "old": "          <Card title=\"Usual Vehicle\">\n            <Select label=\"Default vehicle\" name=\"defaultVehicleId\" defaultValue=\"\">",
        "new": "          <Card title=\"Own Carrier DWT\">\n            <p className=\"mb-5 text-sm leading-6 text-black/50\">\n              When this driver is saved as <span className=\"font-semibold text-black\">Own / unassigned</span>,\n              Waste X can also save your organisation&apos;s carrier identity here. This is\n              the same organisation-level information used automatically on own-fleet DWT\n              submissions; it is not stored separately on each driver.\n            </p>\n            <OwnCarrierDwtFields\n              canEdit={canEditOwnCarrierDwt}\n              initial={{\n                registrationNumber:\n                  dwtSettings?.ownCarrierRegistrationNumber ?? \"\",\n                reasonForNoRegistrationNumber:\n                  dwtSettings?.ownCarrierReasonForNoRegistrationNumber ?? \"\",\n                meansOfTransport:\n                  dwtSettings?.ownCarrierMeansOfTransport ?? \"Road\",\n              }}\n            />\n          </Card>\n\n          <Card title=\"Usual Vehicle\">\n            <Select label=\"Default vehicle\" name=\"defaultVehicleId\" defaultValue=\"\">"
      }
    ],
    "sentinelAfter": "import Link from \"next/link\";"
  },
  {
    "path": "src/app/home/transport/drivers/[driverId]/page.tsx",
    "operations": [
      {
        "label": "import DWT own carrier UI",
        "old": "import {\n  counterparties,\n  counterpartyRoles,\n  drivers,\n  users,\n  vehicles,\n} from \"@/db/schema\";\nimport {\n  archiveDriverAction,",
        "new": "import {\n  counterparties,\n  counterpartyRoles,\n  drivers,\n  users,\n  vehicles,\n} from \"@/db/schema\";\nimport OwnCarrierDwtFields from \"@/modules/digital-waste-tracking/components/OwnCarrierDwtFields\";\nimport {\n  canManageOwnCarrierDwtSettings,\n} from \"@/modules/digital-waste-tracking/data-access/saveOwnCarrierDwtSettings\";\nimport { getWasteTrackingOrganisationSettings } from \"@/modules/digital-waste-tracking/data-access/getWasteTrackingOrganisationSettings\";\nimport {\n  archiveDriverAction,"
      },
      {
        "label": "add own carrier error messages",
        "old": "    vehicle_haulier_mismatch: \"The default vehicle belongs to a different haulier.\",\n  };",
        "new": "    vehicle_haulier_mismatch: \"The default vehicle belongs to a different haulier.\",\n    own_carrier_invalid_reason: \"Choose a valid reason for having no carrier registration.\",\n    own_carrier_invalid_means: \"Choose a valid means of transport.\",\n  };"
      },
      {
        "label": "read role for own carrier permissions",
        "old": "    columns: { organisationId: true },\n  });",
        "new": "    columns: { organisationId: true, role: true },\n  });"
      },
      {
        "label": "load own carrier DWT settings",
        "old": "  if (!driver) notFound();\n\n  const [hauliers, vehicleRows] = await Promise.all([",
        "new": "  if (!driver) notFound();\n\n  const dwtSettings = await getWasteTrackingOrganisationSettings({\n    organisationId,\n  });\n  const canEditOwnCarrierDwt = canManageOwnCarrierDwtSettings(\n    currentUser.role,\n  );\n\n  const [hauliers, vehicleRows] = await Promise.all(["
      },
      {
        "label": "add own carrier fields to driver edit form",
        "old": "            <Field label=\"Internal notes\" name=\"notes\" defaultValue={driver.notes ?? \"\"} />\n            {driver.isActive && (",
        "new": "            <Field label=\"Internal notes\" name=\"notes\" defaultValue={driver.notes ?? \"\"} />\n\n            <div className=\"md:col-span-2 rounded-3xl border border-black/10 bg-[#faf8f4] p-5\">\n              <p className=\"text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-700\">\n                Own Carrier DWT\n              </p>\n              <h3 className=\"mt-2 text-lg font-semibold text-black\">\n                Organisation carrier identity\n              </h3>\n              <p className=\"mt-2 mb-5 text-sm leading-6 text-black/50\">\n                These values apply only when the driver is saved as\n                <span className=\"font-semibold text-black\"> Own / unassigned</span>.\n                If the driver belongs to an external haulier, Waste X uses that\n                haulier&apos;s carrier registration instead.\n              </p>\n              <OwnCarrierDwtFields\n                canEdit={canEditOwnCarrierDwt && driver.isActive}\n                initial={{\n                  registrationNumber:\n                    dwtSettings?.ownCarrierRegistrationNumber ?? \"\",\n                  reasonForNoRegistrationNumber:\n                    dwtSettings?.ownCarrierReasonForNoRegistrationNumber ?? \"\",\n                  meansOfTransport:\n                    dwtSettings?.ownCarrierMeansOfTransport ?? \"Road\",\n                }}\n              />\n            </div>\n\n            {driver.isActive && ("
      }
    ],
    "sentinelAfter": "import Link from \"next/link\";"
  },
  {
    "path": "src/app/home/jobs/new/lib/types.ts",
    "operations": [
      {
        "label": "import DWT carrier types",
        "old": "export type BookJobClient = {",
        "new": "import type {\n  MeansOfTransport,\n  ReasonForNoRegistrationNumber,\n} from \"@/modules/digital-waste-tracking/types/receiveMovement.types\";\n\n/* WASTE_X_OWN_CARRIER_DRIVER_DWT_V1 */\n\nexport type BookJobClient = {"
      },
      {
        "label": "add booking own carrier DWT type",
        "old": "export type BookJobVehicle = {\n  id: string;\n  registrationNumber: string;\n  vehicleType: string | null;\n  haulierCounterpartyId: string | null;\n};\n\nexport type BookJobMaterial = {",
        "new": "export type BookJobVehicle = {\n  id: string;\n  registrationNumber: string;\n  vehicleType: string | null;\n  haulierCounterpartyId: string | null;\n};\n\nexport type BookJobOwnCarrierDwt = {\n  registrationNumber: string;\n  reasonForNoRegistrationNumber: ReasonForNoRegistrationNumber | \"\";\n  meansOfTransport: MeansOfTransport;\n  canEdit: boolean;\n};\n\nexport type BookJobMaterial = {"
      },
      {
        "label": "add own carrier DWT to booking data",
        "old": "  permittedEwcCodeIds: string[];\n  permittedEwcCodes: BookJobPermittedEwc[];\n  clients: BookJobClient[];",
        "new": "  permittedEwcCodeIds: string[];\n  permittedEwcCodes: BookJobPermittedEwc[];\n  ownCarrierDwt: BookJobOwnCarrierDwt;\n  clients: BookJobClient[];"
      }
    ],
    "sentinelAfter": null
  },
  {
    "path": "src/app/home/jobs/new/page.tsx",
    "operations": [
      {
        "label": "import own carrier DWT settings",
        "old": "import { getSoloMasterData } from \"@/modules/master-data/core/getSoloMasterData\";\nimport { getStage2Readiness } from \"@/modules/master-data/core/getStage2Readiness\";",
        "new": "import { getSoloMasterData } from \"@/modules/master-data/core/getSoloMasterData\";\nimport { getStage2Readiness } from \"@/modules/master-data/core/getStage2Readiness\";\nimport {\n  canManageOwnCarrierDwtSettings,\n} from \"@/modules/digital-waste-tracking/data-access/saveOwnCarrierDwtSettings\";\nimport { getWasteTrackingOrganisationSettings } from \"@/modules/digital-waste-tracking/data-access/getWasteTrackingOrganisationSettings\";"
      },
      {
        "label": "load booking own carrier DWT defaults",
        "old": "  const masterData = await getSoloMasterData(currentUser.organisationId);\n  const readiness = getStage2Readiness(masterData);",
        "new": "  const masterData = await getSoloMasterData(currentUser.organisationId);\n  const dwtSettings = await getWasteTrackingOrganisationSettings({\n    organisationId: currentUser.organisationId,\n  });\n  const canEditOwnCarrierDwt = canManageOwnCarrierDwtSettings(\n    currentUser.role,\n  );\n  const readiness = getStage2Readiness(masterData);"
      },
      {
        "label": "pass own carrier DWT defaults into booking form",
        "old": "    permittedEwcCodes: masterData.permittedEwcCodes.map((item) => ({\n      id: item.id,\n      code: item.code,\n      description: item.description,\n      isHazardous: item.isHazardous,\n    })),\n    clients: masterData.clients.map((client) => ({",
        "new": "    permittedEwcCodes: masterData.permittedEwcCodes.map((item) => ({\n      id: item.id,\n      code: item.code,\n      description: item.description,\n      isHazardous: item.isHazardous,\n    })),\n    ownCarrierDwt: {\n      registrationNumber:\n        dwtSettings?.ownCarrierRegistrationNumber ?? \"\",\n      reasonForNoRegistrationNumber:\n        dwtSettings?.ownCarrierReasonForNoRegistrationNumber ?? \"\",\n      meansOfTransport:\n        dwtSettings?.ownCarrierMeansOfTransport ?? \"Road\",\n      canEdit: canEditOwnCarrierDwt,\n    },\n    clients: masterData.clients.map((client) => ({"
      }
    ],
    "sentinelAfter": "import Link from \"next/link\";"
  },
  {
    "path": "src/app/home/jobs/new/quick-create-actions.ts",
    "operations": [
      {
        "label": "import booking own carrier type",
        "old": "  BookJobHaulier,\n  BookJobMaterial,\n  BookJobVehicle,\n  QuickCreateResult,\n} from \"./lib/types\";",
        "new": "  BookJobHaulier,\n  BookJobMaterial,\n  BookJobOwnCarrierDwt,\n  BookJobVehicle,\n  QuickCreateResult,\n} from \"./lib/types\";"
      },
      {
        "label": "import own carrier save helper",
        "old": "} from \"@/db/schema\";\n\nimport type {",
        "new": "} from \"@/db/schema\";\nimport {\n  canManageOwnCarrierDwtSettings,\n  saveOwnCarrierDwtSettings,\n} from \"@/modules/digital-waste-tracking/data-access/saveOwnCarrierDwtSettings\";\n\nimport type {"
      },
      {
        "label": "add role to quick create context",
        "old": "type QuickCreateContext = {\n  userId: string;\n  organisationId: string;\n};",
        "new": "type QuickCreateContext = {\n  userId: string;\n  organisationId: string;\n  role: string | null;\n};"
      },
      {
        "label": "return role from quick create access",
        "old": "    data: {\n      userId: currentUser.id,\n      organisationId: currentUser.organisationId,\n    },",
        "new": "    data: {\n      userId: currentUser.id,\n      organisationId: currentUser.organisationId,\n      role: currentUser.role,\n    },"
      },
      {
        "label": "extend quick driver result and role",
        "old": "export async function quickCreateDriverAction(\n  formData: FormData,\n): Promise<QuickCreateResult<BookJobDriver>> {\n  const contextResult = await requireQuickCreateAccess();\n  if (!contextResult.ok) return contextResult;\n\n  const { organisationId } = contextResult.data;",
        "new": "export async function quickCreateDriverAction(\n  formData: FormData,\n): Promise<\n  QuickCreateResult<{\n    driver: BookJobDriver;\n    ownCarrierDwt: BookJobOwnCarrierDwt | null;\n  }>\n> {\n  const contextResult = await requireQuickCreateAccess();\n  if (!contextResult.ok) return contextResult;\n\n  const { organisationId, role } = contextResult.data;"
      },
      {
        "label": "save own carrier settings during quick own-driver create",
        "old": "  if (haulierId) {\n    const haulier = await activeCounterpartyRole(organisationId, haulierId, \"haulier\");\n    if (!haulier) return { ok: false, error: \"That haulier is no longer available.\" };\n  }\n\n  const [created] = await database",
        "new": "  if (haulierId) {\n    const haulier = await activeCounterpartyRole(organisationId, haulierId, \"haulier\");\n    if (!haulier) return { ok: false, error: \"That haulier is no longer available.\" };\n  }\n\n  let ownCarrierDwt: BookJobOwnCarrierDwt | null = null;\n\n  if (\n    ownerMode === \"own\" &&\n    cleanString(formData.get(\"ownCarrierDwtPresent\")) === \"1\" &&\n    canManageOwnCarrierDwtSettings(role)\n  ) {\n    const ownCarrierResult = await saveOwnCarrierDwtSettings({\n      organisationId,\n      input: {\n        registrationNumber: cleanString(\n          formData.get(\"ownCarrierRegistrationNumber\"),\n        ),\n        reasonForNoRegistrationNumber: cleanString(\n          formData.get(\"ownCarrierReasonForNoRegistrationNumber\"),\n        ),\n        meansOfTransport: cleanString(\n          formData.get(\"ownCarrierMeansOfTransport\"),\n        ),\n      },\n    });\n\n    if (!ownCarrierResult.ok) {\n      return { ok: false, error: ownCarrierResult.error };\n    }\n\n    ownCarrierDwt = {\n      registrationNumber:\n        ownCarrierResult.settings.registrationNumber ?? \"\",\n      reasonForNoRegistrationNumber:\n        ownCarrierResult.settings.reasonForNoRegistrationNumber ?? \"\",\n      meansOfTransport:\n        ownCarrierResult.settings.meansOfTransport,\n      canEdit: true,\n    };\n\n    revalidatePath(\"/home/settings/digital-waste-tracking\");\n    revalidatePath(\"/home/dwt\");\n    revalidatePath(\"/home/dwt/batch\");\n  }\n\n  const [created] = await database"
      },
      {
        "label": "return driver plus own carrier DWT state",
        "old": "  revalidatePath(\"/home/transport\");\n  if (haulierId) revalidatePath(`/home/hauliers/${haulierId}`);\n  refreshQuickCreatePaths();\n\n  return { ok: true, data: created };\n}\n\nexport async function quickCreateVehicleAction(",
        "new": "  revalidatePath(\"/home/transport\");\n  if (haulierId) revalidatePath(`/home/hauliers/${haulierId}`);\n  refreshQuickCreatePaths();\n\n  return {\n    ok: true,\n    data: {\n      driver: created,\n      ownCarrierDwt,\n    },\n  };\n}\n\nexport async function quickCreateVehicleAction("
      }
    ],
    "sentinelAfter": "\"use server\";"
  },
  {
    "path": "src/app/home/jobs/new/components/BookJobForm.tsx",
    "operations": [
      {
        "label": "import own carrier fields component",
        "old": "import { matchCommercialRate } from \"../lib/matchCommercialRate\";\nimport type { BookJobFormData, BookJobInitialValues } from \"../lib/types\";",
        "new": "import { matchCommercialRate } from \"../lib/matchCommercialRate\";\nimport OwnCarrierDwtFields from \"@/modules/digital-waste-tracking/components/OwnCarrierDwtFields\";\nimport type { BookJobFormData, BookJobInitialValues } from \"../lib/types\";"
      },
      {
        "label": "add own carrier DWT client state",
        "old": "  const [materials, setMaterials] = useState(data.materials);\n  const [quickCreateKind, setQuickCreateKind] = useState<",
        "new": "  const [materials, setMaterials] = useState(data.materials);\n  const [ownCarrierDwt, setOwnCarrierDwt] = useState(data.ownCarrierDwt);\n  const [quickCreateKind, setQuickCreateKind] = useState<"
      },
      {
        "label": "handle enhanced quick driver result",
        "old": "      if (quickCreateKind === \"driver\") {\n        const result = await quickCreateDriverAction(formData);\n        if (!result.ok) {\n          setQuickCreateError(result.error);\n          return;\n        }\n\n        setDrivers((current) => [...current, result.data]);\n        setDriverId(result.data.id);\n        setQuickCreateKind(null);\n        return;\n      }",
        "new": "      if (quickCreateKind === \"driver\") {\n        const result = await quickCreateDriverAction(formData);\n        if (!result.ok) {\n          setQuickCreateError(result.error);\n          return;\n        }\n\n        setDrivers((current) => [...current, result.data.driver]);\n        setDriverId(result.data.driver.id);\n\n        if (result.data.ownCarrierDwt) {\n          setOwnCarrierDwt(result.data.ownCarrierDwt);\n        }\n\n        setQuickCreateKind(null);\n        return;\n      }"
      },
      {
        "label": "pass own carrier state into quick create modal",
        "old": "          haulierId={haulierId}\n          haulierName={selectedHaulier?.name ?? null}\n          permittedEwcCodes={data.permittedEwcCodes}",
        "new": "          haulierId={haulierId}\n          haulierName={selectedHaulier?.name ?? null}\n          ownCarrierDwt={ownCarrierDwt}\n          permittedEwcCodes={data.permittedEwcCodes}"
      },
      {
        "label": "destructure own carrier modal prop",
        "old": "  haulierId,\n  haulierName,\n  permittedEwcCodes,\n  error,",
        "new": "  haulierId,\n  haulierName,\n  ownCarrierDwt,\n  permittedEwcCodes,\n  error,"
      },
      {
        "label": "type own carrier modal prop",
        "old": "  haulierId: string;\n  haulierName: string | null;\n  permittedEwcCodes: BookJobFormData[\"permittedEwcCodes\"];",
        "new": "  haulierId: string;\n  haulierName: string | null;\n  ownCarrierDwt: BookJobFormData[\"ownCarrierDwt\"];\n  permittedEwcCodes: BookJobFormData[\"permittedEwcCodes\"];"
      },
      {
        "label": "add own carrier fields to quick own-driver modal",
        "old": "              <div className=\"grid gap-4 md:grid-cols-2\">\n                <Field label=\"Driver name\" required>\n                  <input name=\"name\" required autoFocus className={inputClass} />\n                </Field>\n                <Field label=\"Telephone\">\n                  <input name=\"telephone\" className={inputClass} />\n                </Field>\n                <div className=\"md:col-span-2\">\n                  <Field label=\"Email\">\n                    <input type=\"email\" name=\"email\" className={inputClass} />\n                  </Field>\n                </div>\n              </div>\n            </>\n          )}",
        "new": "              <div className=\"grid gap-4 md:grid-cols-2\">\n                <Field label=\"Driver name\" required>\n                  <input name=\"name\" required autoFocus className={inputClass} />\n                </Field>\n                <Field label=\"Telephone\">\n                  <input name=\"telephone\" className={inputClass} />\n                </Field>\n                <div className=\"md:col-span-2\">\n                  <Field label=\"Email\">\n                    <input type=\"email\" name=\"email\" className={inputClass} />\n                  </Field>\n                </div>\n              </div>\n\n              {transportMode === \"own\" ? (\n                <div className=\"rounded-3xl border border-black/10 bg-white p-5\">\n                  <p className=\"mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-orange-700\">\n                    Own carrier DWT identity\n                  </p>\n                  <OwnCarrierDwtFields\n                    canEdit={ownCarrierDwt.canEdit}\n                    initial={ownCarrierDwt}\n                  />\n                </div>\n              ) : null}\n            </>\n          )}"
      }
    ],
    "sentinelAfter": "\"use client\";"
  },
  {
    "path": "src/modules/digital-waste-tracking/core/getJobLoadReceiveMovementDraft.ts",
    "operations": [
      {
        "label": "add carrier string cleaner",
        "old": "function parseJson<T>(value: string | null | undefined, fallback: T): T {",
        "new": "function cleanString(value: string | null | undefined) {\n  return typeof value === \"string\" ? value.trim() : \"\";\n}\n\nfunction parseJson<T>(value: string | null | undefined, fallback: T): T {"
      },
      {
        "label": "resolve missing own carrier identity from current settings",
        "old": "  const settings = await getWasteTrackingOrganisationSettings({\n    organisationId: params.organisationId,\n  });\n\n  const sourceOfComponents = (",
        "new": "  const settings = await getWasteTrackingOrganisationSettings({\n    organisationId: params.organisationId,\n  });\n\n  /*\n    Existing DWT drafts are snapshots and are deliberately not overwritten when\n    master data changes. The exception here is an OWN-CARRIER draft that has no\n    registration and no legitimate no-registration reason at all. In that case,\n    use the organisation's current own-carrier defaults so adding the carrier\n    registration later fixes both new drafts and already-prepared drafts.\n\n    External-haulier receipts never use this fallback.\n  */\n  const isOwnCarrierReceipt =\n    receipt.carrierOrganisationId === params.organisationId &&\n    !receipt.carrierCounterpartyId;\n\n  const storedCarrierRegistration =\n    cleanString(receipt.carrierRegistrationNumber) || null;\n  const storedCarrierReason =\n    receipt.carrierReasonForNoRegistrationNumber ?? null;\n\n  const useCurrentOwnCarrierDefaults =\n    isOwnCarrierReceipt &&\n    !storedCarrierRegistration &&\n    !storedCarrierReason;\n\n  const resolvedCarrierRegistration = useCurrentOwnCarrierDefaults\n    ? cleanString(settings?.ownCarrierRegistrationNumber) || null\n    : storedCarrierRegistration;\n\n  const resolvedCarrierReason = resolvedCarrierRegistration\n    ? null\n    : useCurrentOwnCarrierDefaults\n      ? settings?.ownCarrierReasonForNoRegistrationNumber ?? null\n      : storedCarrierReason;\n\n  const resolvedCarrierMeans = useCurrentOwnCarrierDefaults\n    ? settings?.ownCarrierMeansOfTransport ??\n      receipt.carrierMeansOfTransport ??\n      \"Road\"\n    : receipt.carrierMeansOfTransport ?? \"Road\";\n\n  const sourceOfComponents = ("
      },
      {
        "label": "use resolved own carrier registration in DWT input",
        "old": "    carrier: {\n      registrationNumber: receipt.carrierRegistrationNumber ?? null,\n      reasonForNoRegistrationNumber:\n        receipt.carrierReasonForNoRegistrationNumber ?? null,\n      organisationName: receipt.carrierOrganisationName ?? \"\",",
        "new": "    carrier: {\n      registrationNumber: resolvedCarrierRegistration,\n      reasonForNoRegistrationNumber: resolvedCarrierReason,\n      organisationName: receipt.carrierOrganisationName ?? \"\","
      },
      {
        "label": "use resolved own carrier means in DWT input",
        "old": "      vehicleRegistration: receipt.carrierVehicleRegistration ?? null,\n      meansOfTransport: receipt.carrierMeansOfTransport ?? \"Road\",",
        "new": "      vehicleRegistration: receipt.carrierVehicleRegistration ?? null,\n      meansOfTransport: resolvedCarrierMeans,"
      }
    ],
    "sentinelAfter": "import { and, eq } from \"drizzle-orm\";"
  },
  {
    "path": "src/modules/digital-waste-tracking/actions/submitJobLoadReceiveMovementAction.ts",
    "operations": [
      {
        "label": "snapshot final own/external carrier identity on successful DWT submit",
        "old": "    await database\n      .update(wasteReceipts)\n      .set({ status: \"submitted\", updatedAt: new Date() })",
        "new": "    await database\n      .update(wasteReceipts)\n      .set({\n        status: \"submitted\",\n        carrierRegistrationNumber:\n          cleanString(receiveMovementInput.carrier.registrationNumber) ?? null,\n        carrierReasonForNoRegistrationNumber:\n          cleanString(receiveMovementInput.carrier.registrationNumber)\n            ? null\n            : receiveMovementInput.carrier.reasonForNoRegistrationNumber ?? null,\n        carrierMeansOfTransport:\n          receiveMovementInput.carrier.meansOfTransport,\n        updatedAt: new Date(),\n      })"
      }
    ],
    "sentinelAfter": "\"use server\";"
  },
  {
    "path": "src/app/home/settings/digital-waste-tracking/OwnCarrierDwtSettingsForm.tsx",
    "operations": [
      {
        "label": "clarify DEFRA no-registration reason labels",
        "old": "    ON_SITE: \"Moved on site\",\n    HOUSEHOLD: \"Household waste\",\n    ONE_OFF: \"One-off movement\",\n    MARINE: \"Marine movement\",",
        "new": "    ON_SITE: \"Movement within the same premises\",\n    HOUSEHOLD: \"Householder transporting own waste\",\n    ONE_OFF: \"One-off / infrequent waste transport\",\n    MARINE: \"Marine licence / exempt movement\","
      }
    ],
    "sentinelAfter": "\"use client\";"
  },
  {
    "path": "src/app/home/dwt/intake/[jobLoadId]/JobLoadReceiveMovementForm.tsx",
    "operations": [
      {
        "label": "clarify DEFRA carrier reason labels",
        "old": "    ON_SITE: \"Moved on site\",\n    HOUSEHOLD: \"Household waste\",\n    ONE_OFF: \"One-off movement\",\n    MARINE: \"Marine movement\",",
        "new": "    ON_SITE: \"Movement within the same premises\",\n    HOUSEHOLD: \"Householder transporting own waste\",\n    ONE_OFF: \"One-off / infrequent waste transport\",\n    MARINE: \"Marine licence / exempt movement\","
      }
    ],
    "sentinelAfter": "\"use client\";"
  },
  {
    "path": "src/app/home/dwt/batch/fix/[jobLoadId]/page.tsx",
    "operations": [
      {
        "label": "clarify quick-fix carrier reason label 1",
        "old": "<option value=\"ON_SITE\">Moved on site</option>",
        "new": "<option value=\"ON_SITE\">Movement within the same premises</option>"
      },
      {
        "label": "clarify quick-fix carrier reason label 2",
        "old": "<option value=\"HOUSEHOLD\">Household waste</option>",
        "new": "<option value=\"HOUSEHOLD\">Householder transporting own waste</option>"
      },
      {
        "label": "clarify quick-fix carrier reason label 3",
        "old": "<option value=\"ONE_OFF\">One-off movement</option>",
        "new": "<option value=\"ONE_OFF\">One-off / infrequent waste transport</option>"
      },
      {
        "label": "clarify quick-fix carrier reason label 4",
        "old": "<option value=\"MARINE\">Marine movement</option>",
        "new": "<option value=\"MARINE\">Marine licence / exempt movement</option>"
      }
    ],
    "sentinelAfter": "import type { ReactNode } from \"react\";"
  }
];

function relative(file) {
  return path.relative(ROOT, file) || ".";
}

function gitBranch() {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function assertRepo() {
  if (!fs.existsSync(path.join(ROOT, "package.json"))) {
    throw new Error("Run this from the Waste X repository root (package.json not found).");
  }

  const branch = gitBranch();
  if (branch && branch !== "demo" && !ALLOW_NON_DEMO) {
    throw new Error(
      `Refusing to patch branch "${branch}". Switch to demo first, or rerun with --allow-non-demo if this is intentional.`
    );
  }

  if (branch) console.log(`Branch: ${branch}`);
}

function readTarget(relPath) {
  const file = path.join(ROOT, relPath);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing expected file: ${relPath}`);
  }
  return fs.readFileSync(file, "utf8");
}

function replaceOnce(text, oldText, newText, label, relPath) {
  const index = text.indexOf(oldText);
  if (index === -1) {
    if (text.includes(newText)) return text;
    throw new Error(
      `Could not patch ${label} in ${relPath}. Expected block not found. No files have been written.`
    );
  }

  const second = text.indexOf(oldText, index + oldText.length);
  if (second !== -1) {
    throw new Error(
      `Refusing ambiguous patch for ${label} in ${relPath}: expected block occurs more than once. No files have been written.`
    );
  }

  return text.slice(0, index) + newText + text.slice(index + oldText.length);
}

function addSentinel(text, anchor, relPath) {
  if (text.includes(SENTINEL)) return text;
  if (!anchor) return text;

  const index = text.indexOf(anchor);
  if (index === -1) {
    throw new Error(
      `Could not place integration sentinel in ${relPath}. No files have been written.`
    );
  }

  const insertAt = index + anchor.length;
  return text.slice(0, insertAt) + `\n/* ${SENTINEL} */` + text.slice(insertAt);
}

function stageExistingPatches() {
  const staged = new Map();

  for (const spec of PATCHES) {
    const original = readTarget(spec.path);

    // A sentinel means this file was already fully processed by this bundle.
    if (original.includes(SENTINEL)) {
      staged.set(spec.path, original);
      console.log(`= ${spec.path} (already integrated)`);
      continue;
    }

    let next = original;
    for (const op of spec.operations) {
      next = replaceOnce(next, op.old, op.new, op.label, spec.path);
    }
    next = addSentinel(next, spec.sentinelAfter, spec.path);
    staged.set(spec.path, next);
    console.log(`✓ validated ${spec.path}`);
  }

  return staged;
}

function stageNewFiles() {
  const staged = new Map();

  for (const [relPath, content] of Object.entries(NEW_FILES)) {
    const file = path.join(ROOT, relPath);

    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, "utf8");
      if (!existing.includes(SENTINEL)) {
        throw new Error(
          `Refusing to replace existing unrecognised file: ${relPath}. No files have been written.`
        );
      }
      staged.set(relPath, existing);
      console.log(`= ${relPath} (already exists)`);
      continue;
    }

    staged.set(relPath, content);
    console.log(`✓ validated new file ${relPath}`);
  }

  return staged;
}

function writeAll(existing, created) {
  const combined = new Map([...existing, ...created]);

  for (const [relPath, content] of combined) {
    const file = path.join(ROOT, relPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    console.log(`✓ wrote ${relPath}`);
  }
}

function checkArchitecture() {
  const schema = readTarget("src/db/schema.ts");
  for (const marker of [
    "ownCarrierRegistrationNumber",
    "ownCarrierReasonForNoRegistrationNumber",
    "ownCarrierMeansOfTransport",
  ]) {
    if (!schema.includes(marker)) {
      throw new Error(
        `Schema is missing ${marker}. This bundle intentionally does not create a migration.`
      );
    }
  }

  const prepare = readTarget(
    "src/modules/digital-waste-tracking/data-access/prepareJobLoadWasteReceipt.ts"
  );
  for (const marker of [
    "settings?.ownCarrierRegistrationNumber",
    "settings?.ownCarrierReasonForNoRegistrationNumber",
    "settings?.ownCarrierMeansOfTransport",
  ]) {
    if (!prepare.includes(marker)) {
      throw new Error(
        `Current DWT receipt preparation no longer contains expected own-carrier mapping: ${marker}`
      );
    }
  }
}

function main() {
  assertRepo();
  checkArchitecture();

  console.log("\nValidating every target before writing...");
  const existing = stageExistingPatches();
  const created = stageNewFiles();

  console.log("\nAll patch preconditions passed. Writing files...");
  writeAll(existing, created);

  console.log(`
Waste X own-carrier / driver / DWT integration applied.

Next:
  npm run build
  node scripts/verify-own-carrier-driver-dwt-v1.cjs

No database migration is required for this bundle.
`);
}

try {
  main();
} catch (error) {
  console.error("\nPATCH ABORTED");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
