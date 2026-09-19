import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { MarcaAcceso, Mensaje } from "@/components/acceso/Piezas";
import { cambiarRecordatorios } from "@/lib/baja-recordatorios";

// docs/rafagas-y-ponerse-al-dia.md §3.8: el enlace "Dejar de recibir estos avisos" del
// recordatorio. Sin iniciar sesión (la firma del enlace es la prueba, ver
// lib/baja-recordatorios.ts) y en un solo clic: la baja se hace al abrir la página.
//
// Como un antivirus de correo puede abrir el enlace antes que la persona, la página
// ofrece "volver a recibirlos" -- con la misma firma -- para deshacer una baja sin querer.
export default async function BajaRecordatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string; reactivar?: string }>;
}) {
  const { u, t, reactivar } = await searchParams;
  const activar = reactivar === "1";
  const resultado = u && t ? await cambiarRecordatorios(u, t, activar) : "invalido";

  return (
    <div className="ap-tramite">
      <div className="ap-tramite__caja">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <MarcaAcceso />
        </div>

        <div className="ap-tramite__hoja">
          {resultado === "ok" ? (
            <div style={{ textAlign: "center" }}>
              <span
                style={{
                  width: 48, height: 48, borderRadius: 13, margin: "0 auto 16px",
                  background: "var(--ok-soft)", color: "var(--ok)",
                  display: "grid", placeItems: "center",
                }}
              >
                <CircleCheck size={22} />
              </span>
              <h1 style={{ fontSize: 22, marginBottom: 8 }}>
                {activar ? "Volverás a recibir los recordatorios" : "No te enviaremos más recordatorios"}
              </h1>
              <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
                {activar
                  ? "Si pasan unos días sin que AutoPostula se ponga al día, te avisamos por correo."
                  : "AutoPostula sigue funcionando igual: solo dejamos de avisarte por correo cuando pasan unos días sin ponerse al día."}
              </p>
              <Link
                href={`/recordatorios/baja?${new URLSearchParams({ u: u!, t: t!, ...(activar ? {} : { reactivar: "1" }) })}`}
                style={{ fontSize: 12.5, color: "var(--text-muted)", textDecoration: "underline" }}
              >
                {activar ? "Dejar de recibirlos otra vez" : "Fue sin querer: volver a recibirlos"}
              </Link>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 22, marginBottom: 8 }}>Enlace inválido</h1>
              <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 18 }}>
                Puede que esté mal copiado o incompleto. Usa el enlace del último correo que te mandamos.
              </p>
              <Mensaje tipo="error">No pudimos cambiar tus recordatorios con este enlace.</Mensaje>
              <Link href="/dashboard/ajustes" className="ap-btn ap-btn--primary" style={{ display: "inline-block", width: "100%", marginTop: 8, textAlign: "center" }}>
                Ir a Ajustes
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
