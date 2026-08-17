import PerfilCv from "@/components/PerfilCv";

export default function PerfilPage() {
  return (
    <>
      <div className="ap-page-header">
        <h1 className="ap-page-title">Mi perfil</h1>
        <p className="ap-page-sub">Los datos que la IA usa para responder por ti</p>
      </div>

      <PerfilCv />
    </>
  );
}
