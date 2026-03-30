export default async function RejectedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white px-6">
      <div className="border border-neutral-800 bg-neutral-950 p-10 max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-4">
          Organisation Not Approved
        </h1>

        <p className="text-sm text-neutral-400 mb-6">
          Unfortunately, your organisation was not approved.
        </p>

        <p className="text-xs text-neutral-600">
          Please contact support on the email below if you believe this is a
          mistake.
        </p>
        <p className="text-xs text-neutral-600">tafadzwampofu24@gmail.com</p>
      </div>
    </div>
  );
}
