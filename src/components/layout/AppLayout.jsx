import React, { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/lib/PermissionsContext";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  LogOut,
  Shield,
  Menu,
  X,
  ChevronRight,
  AlertTriangle,
  TrendingUp,
  Box,
  ListChecks,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppLayout() {
  const logout = useAuth().logout;
  const user = useAuth().user;
  const { showPersonalNav, showUsersNav, isAdmin } = usePermissions();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/faena", label: "Modo Faena", icon: Flame },
    ...(isAdmin
      ? [{ path: "/vista-3d", label: "Vista 3D", icon: Box }]
      : []),
    { path: "/master-plan", label: "Plan Maestro", icon: ClipboardList },
    { path: "/restrictions", label: "Restricciones", icon: AlertTriangle },
    { path: "/analytics", label: "Productividad", icon: TrendingUp },
    ...(showPersonalNav
      ? [{ path: "/workers", label: "Personal", icon: Users }]
      : []),
    ...(isAdmin
      ? [{ path: "/activities", label: "Actividades", icon: ListChecks }]
      : []),
    ...(showUsersNav
      ? [{ path: "/users", label: "Usuarios", icon: Shield }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background font-inter">
      {/* Top Header */}
      <header className="sticky top-0 z-[60] bg-primary text-primary-foreground">
        <div className="flex items-center justify-between px-4 md:px-6 h-14">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-primary-foreground hover:bg-white/10"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </Button>
            <img
              src="https://media.base44.com/images/public/69c135c57c9886fec79cebc5/6324de60d_logoclientes-8.png"
              alt="DGC"
              className="h-10 object-contain"
            />

            <div className="hidden sm:block">
              <h1 className="text-sm font-semibold leading-tight">
                Control de Actividades y Avance
              </h1>
              <p className="text-xs text-primary-foreground/60">
                Obra Eléctrica
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/faena"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-black bg-orange-600 hover:bg-orange-500 text-white shadow-md transition-all shrink-0"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Modo Faena</span>
            </Link>

            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-medium">
                {user?.full_name || "Supervisor"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
              onClick={logout}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="bg-[hsl(var(--primary))] pb-2 px-6 hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const active =
              location.pathname === item.path ||
              (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Mobile Nav */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-all duration-300 ${
          mobileOpen
            ? "visible pointer-events-auto"
            : "invisible pointer-events-none"
        }`}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        {/* Sidebar */}
        <nav
          className={`absolute left-0 top-14 bottom-0 w-64 bg-card shadow-xl p-4 space-y-1 transition-transform duration-300 ease-in-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {navItems.map((item) => {
            const active =
              location.pathname === item.path ||
              (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
                {active && <ChevronRight className="w-4 h-4 ml-auto" />}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <main className="p-4 md:p-6 max-w-screen-2xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
