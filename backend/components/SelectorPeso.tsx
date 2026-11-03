import { PESO_LO_ACEPTARIA, PESO_LO_BUSCO, TEXTO_PESO, seBuscaDeVerdad } from "@/lib/peso-objetivo";

/**
 * «Lo busco» / «Lo aceptaría» en vez de un número (lib/peso-objetivo.ts).
 * Lo usan Filtros de búsqueda y el paso «¿Qué buscas?» del onboarding.
 *
 * Un peso viejo que no es ni 1 ni 0,5 se muestra en la opción que le
 * corresponde, y no se toca mientras la persona no cambie la opción.
 */
export default function SelectorPeso({
  peso,
  onChange,
  style,
}: {
  peso: number;
  onChange: (peso: number) => void;
  style?: React.CSSProperties;
}) {
  return (
    <select
      className="ap-input"
      style={style}
      aria-label="Cuánto lo buscas"
      title={TEXTO_PESO.explicacion}
      value={seBuscaDeVerdad(peso) ? "busco" : "aceptaria"}
      onChange={(e) => onChange(e.target.value === "busco" ? PESO_LO_BUSCO : PESO_LO_ACEPTARIA)}
    >
      <option value="busco">{TEXTO_PESO.loBusco}</option>
      <option value="aceptaria">{TEXTO_PESO.loAceptaria}</option>
    </select>
  );
}
