// app/(app)/layout.tsx
import ThemeLoader from "../_components/ThemeLoader";
import Sidebar from "../_components/Sidebar";
import Topbar from "../_components/Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <ThemeLoader />
      <Sidebar />
      <div className="flex-1 flex flex-col bg-white">
        <Topbar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
