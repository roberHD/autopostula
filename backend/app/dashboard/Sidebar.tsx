"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  FileText,
  UserRound,
  MessageSquare,
  Globe,
  Sparkles,
  Settings,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Resumen", Icon: LayoutDashboard },
  { href: "/dashboard/historial", label: "Postulaciones", Icon: FileText },
  { href: "/dashboard/perfil", label: "Perfil", Icon: UserRound },
  { href: "/dashboard/perfil/conversacion", label: "Conversación IA", Icon: MessageSquare },
  { href: "/dashboard/portales", label: "Portales", Icon: Globe },
];

// Calibración y Entrenar IA quedan agrupadas en un solo módulo (antes eran dos
// items sueltos) — se expande para elegir entre las dos.
const GRUPO_ENTRENAR = {
  label: "Entrenar IA",
  Icon: Sparkles,
  items: [
    { href: "/dashboard/perfil/calibracion", label: "Calibración" },
    { href: "/dashboard/perfil/entrenar", label: "Entrenar IA" },
  ],
};

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const grupoActivo = GRUPO_ENTRENAR.items.some((i) => i.href === pathname);
  const [grupoAbierto, setGrupoAbierto] = useState(grupoActivo);
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Cierra el drawer solo en mobile al navegar — en desktop nunca está "abierto"
  // porque el botón que lo activa está oculto por CSS.
  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  return (
    <>
      <div className="ap-mobile-topbar">
        <div className="ap-mobile-topbar-brand">
          <div className="ap-brand-mark" style={{ width: 26, height: 26, fontSize: 11 }}>AP</div>
          AutoPostula
        </div>
        <button
          type="button"
          className="ap-mobile-menu-btn"
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
        >
          <Menu size={18} />
        </button>
      </div>

      <div
        className={"ap-sidebar-overlay" + (menuAbierto ? " ap-sidebar-overlay-visible" : "")}
        onClick={() => setMenuAbierto(false)}
      />

      <aside className={"ap-sidebar" + (menuAbierto ? " ap-sidebar-open" : "")}>
      <div className="ap-brand">
        <div className="ap-brand-mark">AP</div>
        <div>
          <div className="ap-brand-name">AutoPostula</div>
          <div className="ap-brand-sub">Chile</div>
        </div>
        <button
          type="button"
          className="ap-mobile-menu-btn"
          style={{ marginLeft: "auto" }}
          onClick={() => setMenuAbierto(false)}
          aria-label="Cerrar menú"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="ap-nav">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const activo = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={"ap-nav-item" + (activo ? " ap-nav-item-active" : "")}
            >
              <Icon size={17} strokeWidth={1.8} style={{ width: 17, height: 17, flexShrink: 0 }} />
              {label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setGrupoAbierto((v) => !v)}
          className={"ap-nav-item" + (grupoActivo && !grupoAbierto ? " ap-nav-item-active" : "")}
          style={{ width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit", textAlign: "left" }}
        >
          <GRUPO_ENTRENAR.Icon size={17} strokeWidth={1.8} style={{ width: 17, height: 17, flexShrink: 0 }} />
          {GRUPO_ENTRENAR.label}
          <ChevronDown
            size={14}
            style={{ marginLeft: "auto", transform: grupoAbierto ? "rotate(180deg)" : "none", transition: "transform .15s" }}
          />
        </button>
        {grupoAbierto && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: 14, paddingLeft: 13, borderLeft: "1px solid var(--border)" }}>
            {GRUPO_ENTRENAR.items.map(({ href, label }) => {
              const activo = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={"ap-nav-item" + (activo ? " ap-nav-item-active" : "")}
                  style={{ fontSize: 13 }}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        )}

        <Link
          href="/dashboard/ajustes"
          className={"ap-nav-item" + (pathname === "/dashboard/ajustes" ? " ap-nav-item-active" : "")}
        >
          <Settings size={17} strokeWidth={1.8} style={{ width: 17, height: 17, flexShrink: 0 }} />
          Ajustes
        </Link>
      </nav>

      <div className="ap-sidebar-footer">
        <div className="ap-user">
          <div className="ap-user-avatar">{userName.slice(0, 1).toUpperCase()}</div>
          <div className="ap-user-name">{userName}</div>
        </div>
        <ThemeToggle />
        <button className="ap-signout" onClick={() => signOut({ callbackUrl: "/login" })}>
          Cerrar sesión
        </button>
      </div>
      </aside>
    </>
  );
}
