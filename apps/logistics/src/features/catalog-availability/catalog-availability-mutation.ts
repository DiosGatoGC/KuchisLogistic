import type { CatalogProductsResult } from "../ordering/ordering-types.ts";
import type { SetProductAvailabilityResult } from "./catalog-availability-types.ts";

export type AvailabilityFailureKind = "ambiguous" | "other";

export type AvailabilityAttemptResult =
  | {
      kind: "confirmed";
      response: SetProductAvailabilityResult;
      catalog: CatalogProductsResult;
    }
  | {
      kind: "confirmed-refetch-failed";
      response: SetProductAvailabilityResult;
      refetchError: unknown;
    }
  | { kind: "ambiguous"; error: unknown; catalog: CatalogProductsResult }
  | { kind: "unresolved"; error: unknown; refetchError: unknown };

export async function executeAvailabilityAttempt({
  mutate,
  refetch,
  classifyFailure,
}: {
  mutate: () => Promise<SetProductAvailabilityResult>;
  refetch: () => Promise<CatalogProductsResult>;
  classifyFailure: (error: unknown) => AvailabilityFailureKind;
}): Promise<AvailabilityAttemptResult> {
  let response: SetProductAvailabilityResult;
  try {
    response = await mutate();
  } catch (error) {
    if (classifyFailure(error) === "other") throw error;
    try {
      return { kind: "ambiguous", error, catalog: await refetch() };
    } catch (refetchError) {
      return { kind: "unresolved", error, refetchError };
    }
  }
  try {
    return { kind: "confirmed", response, catalog: await refetch() };
  } catch (refetchError) {
    return { kind: "confirmed-refetch-failed", response, refetchError };
  }
}
