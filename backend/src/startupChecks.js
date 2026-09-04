// Verhindert, dass der Server versehentlich mit unsicherer/fehlender
// Konfiguration läuft (z. B. der Beispielwert aus .env.example, den man
// leicht vergisst zu ändern). Lieber beim Start klar abbrechen als still
// mit einem erratbaren JWT-Secret oder ohne Passwortschutz online gehen.

const INSECURE_JWT_SECRETS = new Set(["change-me-to-a-long-random-string"]);
const MIN_JWT_SECRET_LENGTH = 32;

export function validateEnv() {
  const problems = [];

  const jwtSecret = process.env.JWT_SECRET || "";
  if (!jwtSecret) {
    problems.push("JWT_SECRET fehlt in .env.");
  } else if (INSECURE_JWT_SECRETS.has(jwtSecret)) {
    problems.push("JWT_SECRET verwendet noch den Beispielwert aus .env.example – bitte durch einen eigenen, zufälligen Wert ersetzen (z. B. mit: openssl rand -hex 32).");
  } else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET ist zu kurz (mindestens ${MIN_JWT_SECRET_LENGTH} Zeichen empfohlen).`);
  }

  const passwordHash = process.env.APP_PASSWORD_HASH || "";
  if (!passwordHash) {
    problems.push("APP_PASSWORD_HASH fehlt in .env (npm run hash-password -- <DeinPasswort>).");
  } else if (!passwordHash.startsWith("$2")) {
    problems.push("APP_PASSWORD_HASH sieht nicht wie ein bcrypt-Hash aus – bitte mit 'npm run hash-password' erzeugen, nicht das Klartext-Passwort eintragen.");
  }

  if (problems.length > 0) {
    console.error("\nServer-Start abgebrochen – Konfiguration in backend/.env prüfen:\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("");
    process.exit(1);
  }
}
