export function parseActionError(error: unknown) {
  if (error instanceof Error) {
    const parts = error.message.split(":");

    if (parts.length === 2) {
      return {
        message: "Something went wrong.",
        errorId: parts[1],
      };
    }
  }

  return {
    message: "Something went wrong.",
  };
}
