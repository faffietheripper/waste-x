export default async function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white px-6">
      <div className="max-w-md border border-neutral-800 bg-neutral-950 p-8 text-center">
        <h1 className="text-xl font-semibold mb-4">
          Organisation Under Review
        </h1>

        <p className="text-sm text-neutral-400 mb-6">
          Your organisation has been submitted and is currently being verified.
          You’ll gain full access once approved.
        </p>

        <p className="text-xs text-neutral-600">
          WX-ONBOARDING // STATUS: PENDING
        </p>
      </div>
    </div>
  );
}
