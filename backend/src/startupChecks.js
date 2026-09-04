// Informativer Start-Check, nicht mehr blockierend: Ein fehlendes Passwort
// ist beim allerersten Start normal (der Einrichtungsassistent legt es
// fest) und darf den Server nicht am Starten hindern – sonst käme man nie
// bis zur Oberfläche, die das Passwort überhaupt erst setzt. Das
// JWT-Secret wird bei Bedarf automatisch erzeugt (siehe configStore.js).

import { getPasswordHash } from "./configStore.js";

export function logStartupStatus() {
  if (!getPasswordHash()) {
    console.log("Kein Passwort eingerichtet – die Ersteinrichtung erscheint beim ersten Öffnen der App.");
  }
}
