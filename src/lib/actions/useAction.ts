export function useAction() {
  return async function run<T>(action: () => Promise<T>): Promise<T | null> {
    try {
      return await action();
    } catch (error: any) {
      console.error("Action error:", error);

      // your global error handler already fires
      return null;
    }
  };
}
