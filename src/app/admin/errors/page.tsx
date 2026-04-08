import { getErrorsAction } from "./actions";
import ErrorsClient from "./ErrorsClient";

type Severity = "low" | "medium" | "high" | "critical";
type Status = "active" | "resolved" | "all";

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams?: {
    severity?: string;
    code?: string;
    status?: string;
  };
}) {
  // ✅ validate severity
  const severity =
    searchParams?.severity === "low" ||
    searchParams?.severity === "medium" ||
    searchParams?.severity === "high" ||
    searchParams?.severity === "critical"
      ? searchParams.severity
      : undefined;

  // ✅ validate status
  const status =
    searchParams?.status === "active" ||
    searchParams?.status === "resolved" ||
    searchParams?.status === "all"
      ? searchParams.status
      : "active"; // default

  const code = searchParams?.code || undefined;

  const errors = await getErrorsAction({
    severity,
    code,
    status, // 🔥 THIS WAS MISSING
  });

  const safeErrors =
    errors?.map((e) => ({
      ...e,
      createdAt: e.createdAt ? e.createdAt.toISOString() : null,
    })) ?? [];

  return <ErrorsClient initialErrors={safeErrors} />;
}
