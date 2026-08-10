type ReportStatusBadgeProps = {
  status: string | null | undefined;
};

export default function ReportStatusBadge({ status }: ReportStatusBadgeProps) {
  const label = getStatusLabel(status);
  const className = getStatusClass(status);

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function getStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "pending":
      return "Pending";
    case "generating":
      return "Generating";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Unknown";
  }
}

function getStatusClass(status: string | null | undefined) {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "generating":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "pending":
      return "border-slate-200 bg-slate-50 text-slate-600";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}