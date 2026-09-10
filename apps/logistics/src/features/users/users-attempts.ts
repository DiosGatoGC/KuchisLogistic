export type UserFailureKind = "ambiguous" | "other";

export type UserMutationResult<TWrite, TRead> =
  | { kind: "confirmed"; response: TWrite; authoritative: TRead }
  | { kind: "confirmed-refetch-failed"; response: TWrite; refetchError: unknown }
  | { kind: "ambiguous"; error: unknown; authoritative: TRead }
  | { kind: "unresolved"; error: unknown; refetchError: unknown };

export async function executeUserMutation<TWrite, TRead>({
  mutate,
  refetch,
  classifyFailure,
}: {
  mutate: () => Promise<TWrite>;
  refetch: () => Promise<TRead>;
  classifyFailure: (error: unknown) => UserFailureKind;
}): Promise<UserMutationResult<TWrite, TRead>> {
  let response: TWrite;
  try {
    response = await mutate();
  } catch (error) {
    if (classifyFailure(error) === "other") throw error;
    try {
      return { kind: "ambiguous", error, authoritative: await refetch() };
    } catch (refetchError) {
      return { kind: "unresolved", error, refetchError };
    }
  }
  try {
    return { kind: "confirmed", response, authoritative: await refetch() };
  } catch (refetchError) {
    return { kind: "confirmed-refetch-failed", response, refetchError };
  }
}

export type PasswordResetAttemptResult =
  | { kind: "confirmed" }
  | { kind: "ambiguous"; error: unknown };

export async function executePasswordReset({
  mutate,
  classifyFailure,
}: {
  mutate: () => Promise<unknown>;
  classifyFailure: (error: unknown) => UserFailureKind;
}): Promise<PasswordResetAttemptResult> {
  try {
    await mutate();
    return { kind: "confirmed" };
  } catch (error) {
    if (classifyFailure(error) === "other") throw error;
    return { kind: "ambiguous", error };
  }
}
