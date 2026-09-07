// date.toISOString() rechnet immer in UTC um. Deutschland liegt in UTC+1/+2 –
// kurz nach Mitternacht Lokalzeit (bis ca. 1-2 Uhr, je nach Sommer-/Winterzeit)
// ist es in UTC noch der Vortag. Ein direktes toISOString().slice(0, 10) liefert
// in diesem Fenster das falsche "heute" (den Vortag), was "fällig heute" /
// "überfällig"-Vergleiche in genau diesem Zeitraum falsch macht. Diese Funktion
// verwendet stattdessen die lokalen Date-Getter, sodass "heute" der tatsächlich
// in der Zeitzone des Browsers angezeigte Kalendertag ist.
export function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
