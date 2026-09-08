import { useState } from "react";

// Vorgangsakte-Grundgerüst (Punkt 58): dieselbe Auswahl-/Übergangslogik,
// die zuerst in Uebersicht.jsx für die Tageslinie entstand, jetzt als
// eigener Hook nutzbar für weitere Listenseiten (Rechnungen, Verträge, ...).
// "Liste behält Filter, Scrollposition und Auswahl": die Auswahl lebt hier
// als reiner Komponenten-State, öffnet/schließt also nie einen Reload der
// Liste selbst - ein Filterwechsel/Scrollen bleibt davon unberührt.
//
// closed -> opening (im DOM, noch an Startposition) -> open (Zielzustand,
// Transition läuft) -> closing (Transition zurück, dann entfernen).
export function useDetailPanel() {
  const [selectedKey, setSelectedKey] = useState(null);
  const [panelState, setPanelState] = useState("closed");

  function open(key) {
    setSelectedKey(key);
    setPanelState("opening");
    // Erst im nächsten Frame in den Zielzustand wechseln, damit der Browser
    // die Startposition tatsächlich rendert, bevor die Transition beginnt.
    requestAnimationFrame(() => requestAnimationFrame(() => setPanelState("open")));
  }

  function close() {
    setPanelState("closing");
    setTimeout(() => {
      setPanelState("closed");
      setSelectedKey(null);
    }, 160);
  }

  // Wird z. B. nach einem Löschen des gerade ausgewählten Objekts gebraucht,
  // um keine verwaiste Vorgangsakte stehen zu lassen.
  function reset() {
    setPanelState("closed");
    setSelectedKey(null);
  }

  return {
    selectedKey,
    mounted: panelState !== "closed",
    atTarget: panelState === "open",
    open,
    close,
    reset,
  };
}
