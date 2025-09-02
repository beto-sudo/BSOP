import ThemeLoader from "../_components/ThemeLoader";
import Sidebar from "../_components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ThemeLoader />
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </>
  );
}
