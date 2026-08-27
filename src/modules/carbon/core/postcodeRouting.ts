export type PostcodeCoordinate = {
  postcode: string;
  latitude: number;
  longitude: number;
};

export type PostcodeRoadRoute = {
  origin: PostcodeCoordinate;
  destination: PostcodeCoordinate;
  distanceKm: number;
  provider: string;
  profile: "driving";
};

type PostcodesIoResult = {
  query: string;
  result: null | {
    postcode: string;
    latitude: number | null;
    longitude: number | null;
  };
};

type PostcodesIoResponse = {
  status: number;
  result: PostcodesIoResult[];
};

type OsrmRouteResponse = {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
  }>;
};

export function normaliseUkPostcode(value: string | null | undefined) {
  const compact = (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  if (compact.length < 5 || compact.length > 7) return "";

  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function routePairKey(origin: string, destination: string) {
  return `${normaliseUkPostcode(origin)}|${normaliseUkPostcode(destination)}`;
}

export async function resolvePostcodeCoordinates(
  rawPostcodes: string[],
): Promise<Map<string, PostcodeCoordinate>> {
  const unique = Array.from(
    new Set(rawPostcodes.map(normaliseUkPostcode).filter(Boolean)),
  );

  const output = new Map<string, PostcodeCoordinate>();

  for (let index = 0; index < unique.length; index += 100) {
    const batch = unique.slice(index, index + 100);

    const response = await fetch("https://api.postcodes.io/postcodes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ postcodes: batch }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`POSTCODE_GEOCODE_FAILED_${response.status}`);
    }

    const body = (await response.json()) as PostcodesIoResponse;

    for (const item of body.result ?? []) {
      const query = normaliseUkPostcode(item.query);
      const result = item.result;

      if (
        !query ||
        !result ||
        typeof result.latitude !== "number" ||
        typeof result.longitude !== "number"
      ) {
        continue;
      }

      output.set(query, {
        postcode: normaliseUkPostcode(result.postcode) || query,
        latitude: result.latitude,
        longitude: result.longitude,
      });
    }
  }

  return output;
}

function routingBaseUrl() {
  return (
    process.env.WASTE_X_OSRM_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://router.project-osrm.org"
  );
}

export function routingProviderLabel() {
  return (
    process.env.WASTE_X_ROUTING_PROVIDER_LABEL?.trim() ||
    "OSRM / OpenStreetMap postcode-centroid road route"
  );
}

export async function getRoadDistance(params: {
  origin: PostcodeCoordinate;
  destination: PostcodeCoordinate;
}): Promise<PostcodeRoadRoute> {
  /*
    Same postcode means the two postcode centroids are identical. Waste X stores
    0 km rather than inventing a distance inside the postcode area.
  */
  if (params.origin.postcode === params.destination.postcode) {
    return {
      origin: params.origin,
      destination: params.destination,
      distanceKm: 0,
      provider: routingProviderLabel(),
      profile: "driving",
    };
  }

  const coordinates = [
    `${params.origin.longitude},${params.origin.latitude}`,
    `${params.destination.longitude},${params.destination.latitude}`,
  ].join(";");

  const url = new URL(
    `/route/v1/driving/${coordinates}`,
    routingBaseUrl(),
  );
  url.searchParams.set("overview", "false");
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("steps", "false");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`ROUTE_LOOKUP_FAILED_${response.status}`);
  }

  const body = (await response.json()) as OsrmRouteResponse;
  const metres = body.routes?.[0]?.distance;

  if (
    body.code !== "Ok" ||
    typeof metres !== "number" ||
    !Number.isFinite(metres) ||
    metres < 0
  ) {
    throw new Error("ROUTE_NOT_FOUND");
  }

  return {
    origin: params.origin,
    destination: params.destination,
    distanceKm: metres / 1000,
    provider: routingProviderLabel(),
    profile: "driving",
  };
}
