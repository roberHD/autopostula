"use client";

import Link from "next/link";
import { Clock } from "lucide-react";

// docs/pase-prepagado.md §6: desde 5 días antes de que termine el Premium, un
// aviso arriba de todo el panel: "Tu Premium vence en 3 días · Renovar". Recibe
// el fin del ÚLTIMO pase (si ya compró otro que sigue, lo que importa es cuándo
// termina ese, así que no avisa de más).
const AVISAR_DESDE_DIAS = 5;

export default function BannerVencimiento({ venceEn }: { venceEn: string | null }) {
  if (!venceEn) return null;

  const fin = new Date(venceEn).getTime();
  const dias = Math.ceil((fin - Date.now()) / 86_400_000);
  if (dias <= 0 || dias > AVISAR_DESDE_DIAS) return null;

  const cuando = dias === 1 ? "mañana" : `en ${dias} días`;
  return (
    <div className="ap-cartel-maqueta" role="status">
      <Clock size={17} />
      <div>
        <p className="ap-cartel-maqueta__t">Tu Premium vence {cuando}</p>
        <p className="ap-cartel-maqueta__d">
          Después vuelves al plan gratuito. Si renuevas antes, los días nuevos se suman a los que te quedan.{" "}
          <Link href="/dashboard/premium" style={{ color: "inherit", textDecoration: "underline" }}>
            Renovar
          </Link>
        </p>
      </div>
    </div>
  );
}
