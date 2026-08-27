export type ResolvedReturnGeography = {
  postcode: string;
  localAuthorityCode: string;
  localAuthorityName: string;
  returnAreaLabel: string;
};

type PostcodesIoResult = {
  query: string;
  result: null | {
    postcode: string;
    admin_district: string | null;
    codes: {
      admin_district: string | null;
    };
  };
};

type PostcodesIoResponse = {
  status: number;
  result: PostcodesIoResult[];
};

export function normaliseUkPostcode(value: string | null | undefined) {
  const compact = (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  if (compact.length < 5 || compact.length > 7) return "";

  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/*
  Postcodes.io exposes the ONS/administrative district name and GSS code used by
  UK postcode geography. We use it as the live resolver and persist the result
  so quarterly-return preparation does not depend on an API call every time.

  This is intentionally swappable: a future Waste X ONSPD import can implement
  the same return type without changing the rest of the return engine.
*/
export async function resolvePostcodes(
  rawPostcodes: string[],
): Promise<Map<string, ResolvedReturnGeography>> {
  const unique = Array.from(
    new Set(rawPostcodes.map(normaliseUkPostcode).filter(Boolean)),
  );

  const output = new Map<string, ResolvedReturnGeography>();

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
      throw new Error(`POSTCODE_LOOKUP_FAILED_${response.status}`);
    }

    const body = (await response.json()) as PostcodesIoResponse;

    for (const item of body.result ?? []) {
      const query = normaliseUkPostcode(item.query);
      const result = item.result;

      if (
        !query ||
        !result?.admin_district ||
        !result.codes?.admin_district
      ) {
        continue;
      }

      output.set(query, {
        postcode: normaliseUkPostcode(result.postcode) || query,
        localAuthorityCode: result.codes.admin_district,
        localAuthorityName: result.admin_district,
        returnAreaLabel: result.admin_district,
      });
    }
  }

  return output;
}
