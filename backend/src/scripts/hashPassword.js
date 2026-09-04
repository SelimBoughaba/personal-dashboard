import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Nutzung: npm run hash-password -- <deinPasswort>");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log("\nFüge diese Zeile in backend/.env ein:\n");
console.log(`APP_PASSWORD_HASH=${hash}\n`);
