import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {/* Mobile header spacer so content isn't under the hamburger button */}
        <div className="md:hidden h-14" />
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
