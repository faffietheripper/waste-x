export default function DemoEnvironmentBanner() {
  const isDemo =
    process.env.NEXT_PUBLIC_APP_ENV === "demo" ||
    process.env.APP_ENV === "demo";

  if (!isDemo) return null;

  return (
    <div className="sticky top-0 z-[9999] border-b border-orange-900/30 bg-orange-500 px-4 py-2 text-center text-xs font-black uppercase tracking-[0.22em] text-black shadow-sm">
      Demo Environment — test data only
    </div>
  );
}