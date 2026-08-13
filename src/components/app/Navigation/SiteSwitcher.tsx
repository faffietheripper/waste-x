// src/components/app/Navigation/SiteSwitcher.tsx

import type {
  OrganisationModeInput,
} from "@/modules/organisations/core/operatingModes";
import { shouldShowSiteSwitcher } from "@/modules/organisations/core/operatingModes";
import { getActiveSitesForOrganisation } from "@/modules/sites/data-access/getActiveSitesForOrganisation";

import SiteSwitcherClient from "./SiteSwitcherClient";

export default async function SiteSwitcher({
  organisationId,
  organisation,
}: {
  organisationId: string;
  organisation: OrganisationModeInput | null;
}) {
  const activeSites = await getActiveSitesForOrganisation({
    organisationId,
    createDefaultIfMissing: true,
  });

  const shouldShow = shouldShowSiteSwitcher({
    ...organisation,
    siteCount: activeSites.length,
  });

  if (!shouldShow) {
    return null;
  }

  return <SiteSwitcherClient sites={activeSites} />;
}