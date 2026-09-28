"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/dashboard/perfil/conversacion", label: "Conversación" },
  { href: "/dashboard/perfil/calibracion", label: "Calibración" },
  { href: "/dashboard/perfil/entrenar", label: "Ajuste fino" },
];

/**
 * Conversación, Calibración y Ajuste fino son la misma tarea — enseñarle a
 * la IA cómo escribes — así que son pestañas de un solo módulo, Entrenar IA,
 * separado de Perfil (tu CV y tus datos). Cada una sigue teniendo su propia
 * ruta, para que un enlace directo siga funcionando.
 */
export default function PestanasEntrenar() {
  const pathname = usePathname();

  return (
    <div className="ap-pestanas" role="tablist" aria-label="Entrenar IA">
      {PESTANAS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          role="tab"
          aria-selected={pathname === href}
          className="ap-pestana"
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
