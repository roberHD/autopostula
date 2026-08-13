import { auth } from "@/auth";
import { redirect } from "next/navigation";
import "./theme.css";
import Sidebar from "./Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="ap-shell">
      <Sidebar userName={session.user.name ?? session.user.email ?? "Usuario"} />
      <main className="ap-main">{children}</main>
    </div>
  );
}
