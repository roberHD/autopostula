"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MonitorSmartphone } from "lucide-react";
import { sinSoporteExtension } from "@/lib/dispositivo";

// docs/celular-y-escritorio.md §9.7: "en el dashboard móvil se ve claramente qué
// falta y qué se desbloquea al hacerlo". Desde un teléfono la extensión no se
// puede instalar -- no es un error ni una tarea pendiente en ESE aparato --, así
// que el cartel dice qué se puede hacer ahí y qué se desbloquea en un computador.
// En un computador no muestra nada: ahí lo que falta se resuelve desde Portales.
export default function BannerExtension() {
  // null hasta montar: el servidor no sabe qué aparato es, y decidirlo en el
  // primer render desajustaría la hidratación.
  const [enMovil, setEnMovil] = useState<boolean | null>(null);

  useEffect(() => {
    setEnMovil(sinSoporteExtension());
  }, []);

  if (!enMovil) return null;

  return (
    <div className="ap-cartel-maqueta" role="status">
      <MonitorSmartphone size={17} />
      <div>
        <p className="ap-cartel-maqueta__t">Desde el celular decides; en el computador se postula</p>
        <p className="ap-cartel-maqueta__d">
          La extensión de AutoPostula solo funciona en Chrome de un computador. Desde acá puedes{" "}
          <Link href="/dashboard/por-decidir" style={{ color: "inherit", textDecoration: "underline" }}>
            decidir qué ofertas te interesan
          </Link>{" "}
          y{" "}
          <Link href="/dashboard/historial" style={{ color: "inherit", textDecoration: "underline" }}>
            revisar tus postulaciones
          </Link>
          . Para que postule por ti, abre autopostula.cl en tu computador con la misma cuenta e instala la
          extensión.
        </p>
      </div>
    </div>
  );
}
