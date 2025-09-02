// app/(app)/layout.tsx
import ThemeLoader from "../_components/ThemeLoader";
import Sidebar from "../_components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <ThemeLoader />
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-white">{children}</main>
    </div>
  );
}
