"use client";

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
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Inicio", Icon: LayoutDashboard },
  { href: "/dashboard/historial", label: "Historial", Icon: FileText },
  { href: "/dashboard/perfil", label: "Perfil", Icon: UserRound },
  { href: "/dashboard/perfil/conversacion", label: "Conversación IA", Icon: MessageSquare },
  { href: "/dashboard/portales", label: "Portales", Icon: Globe },
  { href: "/dashboard/perfil/calibracion", label: "Calibración", Icon: Sparkles },
  { href: "/dashboard/perfil/entrenar", label: "Entrenar IA", Icon: Sparkles },
  { href: "/dashboard/ajustes", label: "Ajustes", Icon: Settings },
];

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <aside className="ap-sidebar">
      <div className="ap-brand">
        <div className="ap-brand-mark">AP</div>
        <div>
          <div className="ap-brand-name">AutoPostula</div>
          <div className="ap-brand-sub">Chile</div>
        </div>
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
  );
}
