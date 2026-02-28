import { Link, useLocation } from "react-router-dom";
import { BarChart3, PlusCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: PlusCircle, label: "Create Ad" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 md:px-8 h-14">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary shadow-glow-sm">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground tracking-tight">Adgent</span>
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive =
                item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="relative flex-1 p-4 md:p-8 overflow-auto">
        <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_120%,hsl(var(--primary)/0.25),transparent)]" />
        {children}
      </main>
    </div>
  );
}
