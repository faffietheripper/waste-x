import { Suspense } from "react";
import SetupAccountClient from "./SetupAccountClient";

export default function SetupAccountPage() {
  return (
    <Suspense fallback={<div className="p-10 text-white">Loading...</div>}>
      <SetupAccountClient />
    </Suspense>
  );
}
