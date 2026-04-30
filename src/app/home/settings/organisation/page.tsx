import { auth } from "@/auth";
import { redirect } from "next/navigation";
import OrganisationSetupForm from "./OrganisationSetupForm";

export default async function OrganisationSettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return <OrganisationSetupForm />;
}
