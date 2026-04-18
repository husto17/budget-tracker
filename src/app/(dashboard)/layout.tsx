import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { CommandPalette } from "@/components/layout/command-palette";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden">
      <KeyboardShortcuts />
      <CommandPalette />
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {/* Mobile header spacer so content isn't under the hamburger button */}
        <div className="md:hidden h-14" />
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
