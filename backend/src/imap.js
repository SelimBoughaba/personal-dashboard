import { ImapFlow } from "imapflow";
import { withTimeout, parseAreaRules, areaForAddress, configuredMailAccounts } from "./mailAccounts.js";

const MAX_MESSAGES_PER_ACCOUNT = 50;
const CONNECTION_TIMEOUT_MS = 15000;

async function fetchAccountMessages(account, rules) {
  const client = new ImapFlow({
    host: account.host,
    port: Number(account.port) || 993,
    secure: true,
    auth: { user: account.user, pass: account.password },
    logger: false,
  });

  const messages = [];
  await withTimeout(client.connect(), CONNECTION_TIMEOUT_MS, `Verbindung zu ${account.host}`);

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ or: [{ seen: false }, { flagged: true }] });
      const recentUids = uids.sort((a, b) => b - a).slice(0, MAX_MESSAGES_PER_ACCOUNT);

      if (recentUids.length > 0) {
        for await (const msg of client.fetch(recentUids, { envelope: true, flags: true, uid: true })) {
          const from = msg.envelope.from?.[0];
          const address = from?.address || "";
          messages.push({
            id: `${account.id}-${msg.uid}`,
            account: account.id,
            from: address,
            fromName: from?.name || address || "(Unbekannt)",
            subject: msg.envelope.subject || "(Kein Betreff)",
            date: msg.envelope.date ? new Date(msg.envelope.date).toISOString() : null,
            unread: !msg.flags.has("\\Seen"),
            flagged: msg.flags.has("\\Flagged"),
            area: areaForAddress(address, rules),
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await withTimeout(client.logout(), 5000, "Abmelden");
    } catch {
      client.close();
    }
  }

  return messages;
}

export async function getMessages() {
  const accounts = configuredMailAccounts();
  if (accounts.length === 0) {
    const err = new Error("Mail ist nicht konfiguriert.");
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  const rules = parseAreaRules();
  const results = await Promise.all(accounts.map((account) => fetchAccountMessages(account, rules)));
  return results.flat().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
