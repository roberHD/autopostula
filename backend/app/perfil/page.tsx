import { redirect } from "next/navigation";
import { auth } from "@/auth";
import PerfilCv from "@/components/PerfilCv";

export default async function PerfilPage() {
  const session = await auth();
  if (!session?.user) redirect("/login"); // ajusta si tu login vive en otra ruta

  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-50 px-4 py-10">
      <PerfilCv />
    </main>
  );
}