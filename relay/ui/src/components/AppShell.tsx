import { Outlet } from "react-router-dom";
import { Rail } from "./Rail";

export function AppShell() {
  return (
    <div className="flex h-full w-full bg-bg text-text">
      <Rail />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
