// Seitentitel: 28-34px (Punkt 55) - text-[30px] trifft die Vorgabe genau
// in der Mitte. Ausschließlich Manrope (Nutzerwunsch), Bold für die
// Überschrift, Light für den Beschreibungstext.
export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[30px] font-bold tracking-tight text-ivory">{title}</h1>
        {/* max-w-xl statt 2xl: ~55-75 Zeichen Zeilenlänge (Punkt 55) */}
        {description && <p className="mt-1 max-w-xl text-sm leading-relaxed text-ivory/65">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
