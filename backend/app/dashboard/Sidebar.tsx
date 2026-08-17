"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import ThemeToggle from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Resumen", icon: "M4 4h7v7H4V4zm9 0h7v4h-7V4zm0 6h7v10h-7V10zM4 13h7v7H4v-7z" },
  { href: "/dashboard/historial", label: "Historial", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/dashboard/perfil", label: "Perfil", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-4 3.6-6 8-6s8 2 8 6" },
  { href: "/dashboard/perfil/conversacion", label: "Conversación IA", icon: "M4 4h16v12H7l-3 3V4z" },
  { href: "/dashboard/portales", label: "Portales", icon: "M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2c2.5 2.7 4 6.2 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.2-4-10s1.5-7.3 4-10z" },
  { href: "/dashboard/perfil/calibracion", label: "Calibración", icon: "M12 2l2.4 6.6L21 10l-6.6 1.4L12 18l-2.4-6.6L3 10l6.6-1.4z" },
  { href: "/dashboard/perfil/entrenar", label: "Entrenar IA", icon: "M12 2a5 5 0 015 5c0 1.6-.8 3-2 3.9V13h2v2h-2v2h-6v-2H7v-2h2v-2.1C7.8 10 7 8.6 7 7a5 5 0 015-5z" },
  { href: "/dashboard/ajustes", label: "Ajustes", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a7.4 7.4 0 000-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 00-1.7-1L14.9 3h-4l-.4 2.9a7.4 7.4 0 00-1.7 1l-2.5-1-2 3.5L6.4 11a7.4 7.4 0 000 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 001.7 1l.4 2.9h4l.4-2.9a7.4 7.4 0 001.7-1l2.5 1 2-3.5-2.1-1.6z" },
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
        {NAV_ITEMS.map((item) => {
          const activo = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={"ap-nav-item" + (activo ? " ap-nav-item-active" : "")}
            >
              <svg className="ap-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {item.label}
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
