import { getErrorsAction } from "./actions";
import ErrorsClient from "./ErrorsClient";

type Severity = "low" | "medium" | "high" | "critical";

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams?: { severity?: string; code?: string };
}) {
  const severity =
    searchParams?.severity === "low" ||
    searchParams?.severity === "medium" ||
    searchParams?.severity === "high" ||
    searchParams?.severity === "critical"
      ? searchParams.severity
      : undefined;

  const code = searchParams?.code || undefined;

  const errors = await getErrorsAction({
    severity,
    code,
  });

  // ✅ NORMALISE DATA FOR CLIENT
  const safeErrors =
    errors?.map((e) => ({
      ...e,
      createdAt: e.createdAt ? e.createdAt.toISOString() : null,
    })) ?? [];

  return <ErrorsClient initialErrors={safeErrors} />;
}
