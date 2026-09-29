"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Crown,
  FileText,
  Filter,
  Globe,
  House,
  Inbox,
  Menu,
  Settings,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { Marca } from "@/components/Marca";

const GRUPOS: { titulo?: string; items: { href: string; label: string; Icon: any }[] }[] = [
  {
    items: [
      // "Hoy" y no "Resumen": la página parte por lo que hay que hacer hoy.
      { href: "/dashboard", label: "Hoy", Icon: House },
      { href: "/dashboard/por-decidir", label: "Por decidir", Icon: Inbox },
      { href: "/dashboard/historial", label: "Postulaciones", Icon: FileText },
    ],
  },
  {
    titulo: "Tu perfil",
    items: [
      { href: "/dashboard/perfil", label: "Perfil", Icon: UserRound },
      { href: "/dashboard/perfil/conversacion", label: "Entrenar IA", Icon: Sparkles },
    ],
  },
  {
    titulo: "Configuración",
    items: [
      { href: "/dashboard/portales", label: "Portales", Icon: Globe },
      { href: "/dashboard/filtros", label: "Filtros de búsqueda", Icon: Filter },
      // "Tu plan" y no "Premium": la cuenta gratis también tiene uno, y acá
      // se ve cuánto queda del mes.
      { href: "/dashboard/premium", label: "Tu plan", Icon: Crown },
      { href: "/dashboard/ajustes", label: "Ajustes", Icon: Settings },
    ],
  },
];

// Entrenar IA agrupa tres pantallas (Conversación, Calibración y Ajuste fino)
// que se cambian con pestañas adentro — las tres marcan el mismo item del menú.
const RUTAS_ENTRENAR = ["/dashboard/perfil/conversacion", "/dashboard/perfil/entrenar", "/dashboard/perfil/calibracion"];

function estaActivo(href: string, pathname: string) {
  if (href === "/dashboard/perfil/conversacion") return RUTAS_ENTRENAR.includes(pathname);
  return pathname === href;
}

export default function Sidebar({
  userName,
  pendientesPorDecidir = null,
}: {
  userName: string;
  // Cuántas hay en "Por decidir" al cargar, contado en el servidor (layout).
  pendientesPorDecidir?: number | null;
}) {
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [pendientesBandaGris, setPendientesBandaGris] = useState(pendientesPorDecidir ?? 0);
  const yaLoTraeElServidor = useRef(pendientesPorDecidir !== null);

  // docs/optimizacion-2026-09-29.md §3: el número se actualiza en cada cambio
  // de página, pero pidiendo solo el conteo. Antes se bajaba la lista entera
  // de "Por decidir" (con el extracto de cada aviso) solo para contarla. Al
  // cargar no se pide: ya vino del servidor.
  useEffect(() => {
    if (yaLoTraeElServidor.current) {
      yaLoTraeElServidor.current = false;
      return;
    }
    fetch("/api/banda-gris/conteo")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPendientesBandaGris(data?.pendientes ?? 0))
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
