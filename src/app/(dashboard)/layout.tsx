import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { CommandPalette } from "@/components/layout/command-palette";
import { BottomNav } from "@/components/layout/bottom-nav";

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
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
        {/* Mobile header spacer so content isn't under the hamburger button */}
        <div className="md:hidden h-14" />
        <div className="p-4 md:p-8 pb-24 md:pb-8">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
