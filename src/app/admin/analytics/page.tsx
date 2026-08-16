import { redirect } from "next/navigation";

export default function LegacyAdminAnalyticsRedirect() {
  redirect("/admin/reports");
}
