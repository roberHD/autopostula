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
  Menu,
  X,
  Filter,
  Crown,
  Inbox,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { Marca } from "@/components/Marca";

const GRUPOS: { titulo?: string; items: { href: string; label: string; Icon: any }[] }[] = [
  {
    items: [
      { href: "/dashboard", label: "Resumen", Icon: LayoutDashboard },
      { href: "/dashboard/historial", label: "Postulaciones", Icon: FileText },
      { href: "/dashboard/por-decidir", label: "Por decidir", Icon: Inbox },
    ],
  },
  {
    titulo: "Tu perfil",
    items: [
      { href: "/dashboard/perfil", label: "Perfil", Icon: UserRound },
      { href: "/dashboard/perfil/conversacion", label: "Conversación IA", Icon: MessageSquare },
      { href: "/dashboard/perfil/entrenar", label: "Entrenar IA", Icon: Sparkles },
    ],
  },
  {
    titulo: "Configuración",
    items: [
      { href: "/dashboard/portales", label: "Portales", Icon: Globe },
      { href: "/dashboard/filtros", label: "Filtros de búsqueda", Icon: Filter },
      { href: "/dashboard/premium", label: "Premium", Icon: Crown },
      { href: "/dashboard/ajustes", label: "Ajustes", Icon: Settings },
    ],
  },
];

// Entrenar IA agrupa dos pantallas (Calibración y Ajuste fino) que se
// cambian con pestañas adentro — las dos marcan el mismo item del menú.
const RUTAS_ENTRENAR = ["/dashboard/perfil/entrenar", "/dashboard/perfil/calibracion"];

function estaActivo(href: string, pathname: string) {
  if (href === "/dashboard/perfil/entrenar") return RUTAS_ENTRENAR.includes(pathname);
  return pathname === href;
}

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [pendientesBandaGris, setPendientesBandaGris] = useState(0);

  useEffect(() => {
    fetch("/api/banda-gris")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPendientesBandaGris(data?.pendientes?.length ?? 0))
      .catch(() => {});
  }, [pathname]);

  // Cierra el drawer solo en mobile al navegar — en desktop nunca está "abierto"
  // porque el botón que lo activa está oculto por CSS.
  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  return (
    <>
      <div className="ap-mobile-topbar">
        <Link href="/dashboard" className="ap-mobile-topbar-brand ap-brand-link" aria-label="AutoPostula — ir al inicio">
          <Marca tam={26} />
          AutoPostula
        </Link>
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
        <Link href="/dashboard" className="ap-brand-link" aria-label="AutoPostula — ir al inicio">
          <Marca tam={32} />
          <div>
            <div className="ap-brand-name">AutoPostula</div>
            <div className="ap-brand-sub">Chile</div>
          </div>
        </Link>
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
        {GRUPOS.map((grupo, gi) => (
          <div key={grupo.titulo ?? gi} style={{ display: "contents" }}>
            {grupo.titulo && <p className="ap-nav-grupo">{grupo.titulo}</p>}
            {grupo.items.map(({ href, label, Icon }) => {
              const activo = estaActivo(href, pathname);
              const esPorDecidir = href === "/dashboard/por-decidir";
              return (
                <Link
                  key={href}
                  href={href}
                  className={"ap-nav-item" + (activo ? " ap-nav-item-active" : "")}
                >
                  <Icon size={17} strokeWidth={1.8} style={{ width: 17, height: 17, flexShrink: 0 }} />
                  {label}
                  {esPorDecidir && pendientesBandaGris > 0 && (
                    <span className="ap-nav-badge ap-tnum">{pendientesBandaGris}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
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
