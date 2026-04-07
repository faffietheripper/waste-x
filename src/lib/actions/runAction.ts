// /lib/actions/runAction.ts

import { parseActionError } from "@/lib/errors/parseError";

type ActionResult =
  | { success?: boolean; message?: string; errorId?: string }
  | undefined;

export async function runAction<T extends ActionResult>(
  action: () => Promise<T>,
  setError: (err: { message: string; errorId?: string }) => void,
): Promise<T> {
  try {
    const result = await action();

    if (result && result.success === false) {
      setError({
        message: result.message || "Something went wrong",
        errorId: result.errorId,
      });
    }

    return result;
  } catch (err) {
    const parsed = parseActionError(err);

    setError({
      message: parsed.message,
      errorId: parsed.errorId,
    });

    return undefined as T;
  }
}
