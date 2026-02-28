import { Link, useLocation } from "react-router-dom";
import { BarChart3, PlusCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import DotGrid from "./DotGrid";

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
        {/* Interactive dot grid */}
        <DotGrid />
        {/* Gradient color orbs */}
        <div className="pointer-events-none fixed inset-0 z-[1]">
          {/* Cyan orb — top-right */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_90%_0%,hsl(195_100%_50%/0.13),transparent)]" />
          {/* Violet orb — bottom-left */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_-5%_95%,hsl(270_70%_55%/0.12),transparent)]" />
          {/* Cyan bloom — bottom-center */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_115%,hsl(195_100%_50%/0.22),transparent)]" />
        </div>
        {children}
      </main>
    </div>
  );
}
