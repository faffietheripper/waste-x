import { redirect } from "next/navigation";

export default function IncomingMovementsRedirect() {
  redirect("/home/movements?direction=incoming");
}
