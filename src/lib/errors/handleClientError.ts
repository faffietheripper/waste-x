import { parseActionError } from "./parseError";

export function handleClientError(
  err: unknown,
  setError: (error: { message: string; errorId?: string }) => void,
) {
  const parsed = parseActionError(err);
  setError(parsed);
}
