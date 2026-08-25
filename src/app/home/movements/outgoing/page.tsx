import { redirect } from "next/navigation";

export default function OutgoingMovementsRedirect() {
  redirect("/home/movements?direction=outgoing");
}
