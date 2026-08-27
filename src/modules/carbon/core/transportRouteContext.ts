import { normaliseUkPostcode } from "./postcodeRouting";

export type RouteEndpoint = {
  kind: "own_site" | "counterparty_site" | "missing";
  id: string | null;
  name: string;
  postcode: string;
};

export type TransportRouteContext = {
  direction: "incoming" | "outgoing";
  origin: RouteEndpoint;
  destination: RouteEndpoint;
};

type SiteLike = {
  id: string;
  name: string;
  postcode: string | null;
} | null | undefined;

type LoadRouteInput = {
  direction: string;
  clientSite?: SiteLike;
  ownSite?: SiteLike;
  thirdPartyDestinationSite?: SiteLike;
  defaultOwnSite?: SiteLike;
  originPostcodeOverride?: string | null;
  destinationPostcodeOverride?: string | null;
  originOverrideEnabled?: boolean;
  destinationOverrideEnabled?: boolean;
};

function endpoint(
  kind: RouteEndpoint["kind"],
  site: SiteLike,
  postcodeOverride?: string | null,
  overrideEnabled = false,
): RouteEndpoint {
  const postcode = normaliseUkPostcode(
    overrideEnabled ? postcodeOverride : site?.postcode,
  );

  return {
    kind: site ? kind : "missing",
    id: site?.id ?? null,
    name: site?.name ?? "Site not recorded",
    postcode,
  };
}

export function deriveTransportRouteContext(
  input: LoadRouteInput,
): TransportRouteContext {
  const ownSite = input.ownSite ?? input.defaultOwnSite;

  if (input.direction === "outgoing") {
    return {
      direction: "outgoing",
      origin: endpoint(
        "own_site",
        ownSite,
        input.originPostcodeOverride,
        input.originOverrideEnabled,
      ),
      destination: endpoint(
        "counterparty_site",
        input.thirdPartyDestinationSite,
        input.destinationPostcodeOverride,
        input.destinationOverrideEnabled,
      ),
    };
  }

  return {
    direction: "incoming",
    origin: endpoint(
      "counterparty_site",
      input.clientSite,
      input.originPostcodeOverride,
      input.originOverrideEnabled,
    ),
    destination: endpoint(
      "own_site",
      ownSite,
      input.destinationPostcodeOverride,
      input.destinationOverrideEnabled,
    ),
  };
}
