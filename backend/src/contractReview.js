// Fristenradar-Ausbaustufe (Punkt 70): "Erinnerung und eine lokal erstellte
// Prüfaufgabe bilden die erste Ausbaustufe." Die Erinnerung (Warnbanner,
// Fristmarkierung in der Vorgangsakte) existiert bereits in Vertraege.jsx -
// hier kommt die automatisch erstellte, verlinkte Aufgabe dazu.
//
// Kein Cron/Hintergrunddienst (bewusst, wie schon bei purgeExpired() in
// trash.js): läuft stattdessen lazy bei jedem GET /api/contracts mit.
// contracts.review_task_id (Migration 0023) verhindert doppelte Aufgaben für
// dieselbe Frist - erst wenn next_renewal_date oder cancellation_period_days
// sich ändert (siehe routes/contracts.js PATCH), wird das Feld wieder auf
// NULL gesetzt und für die NEUE Frist kann erneut eine Aufgabe entstehen.
// Kein automatisches Kündigen, keine Rechtsauskunft - nur eine Aufgabe zum
// selbst Prüfen.

import { db } from "./db.js";

// Deckt sich mit der Schwelle der Kündigungsfrist-Warnung in Vertraege.jsx
// ("soonToCancel", days <= 30) - dieselbe Frist gilt hier für die Aufgabe.
export const CONTRACT_REVIEW_THRESHOLD_DAYS = 30;

function cancellationDeadline(contract) {
  if (!contract.next_renewal_date || contract.cancellation_period_days === null) return null;
  const deadline = new Date(`${contract.next_renewal_date}T00:00:00Z`);
  deadline.setUTCDate(deadline.getUTCDate() - contract.cancellation_period_days);
  return deadline;
}

export function ensureContractReviewTasks() {
  const contracts = db
    .prepare(
      `SELECT * FROM contracts
       WHERE deleted_at IS NULL AND status = 'aktiv' AND review_task_id IS NULL
         AND next_renewal_date IS NOT NULL AND cancellation_period_days IS NOT NULL`,
    )
    .all();

  for (const contract of contracts) {
    const deadline = cancellationDeadline(contract);
    if (!deadline) continue;
    const daysUntil = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntil > CONTRACT_REVIEW_THRESHOLD_DAYS) continue;

    const dueDate = deadline.toISOString().slice(0, 10);
    const title = `Kündigungsfrist prüfen: ${contract.title}`;
    const notes = `Automatisch vom Fristenradar angelegt - Kündigungsfrist für „${contract.title}" endet am ${dueDate}.`;

    const info = db
      .prepare(`INSERT INTO tasks (title, notes, due_date, priority, area, status) VALUES (?, ?, ?, 'hoch', ?, 'offen')`)
      .run(title, notes, dueDate, contract.area);
    const taskId = info.lastInsertRowid;

    // Sichtbare, manuell trennbare Verknüpfung wie jede andere auch (Punkt
    // 69), kein Sonderfall - direkter Insert statt HTTP-Roundtrip über
    // routes/links.js, da beide Objekte hier serverseitig bereits bekannt
    // und aktiv sind.
    db.prepare(`INSERT INTO object_links (a_type, a_id, b_type, b_id) VALUES ('vertrag', ?, 'aufgabe', ?)`).run(
      contract.id,
      taskId,
    );

    db.prepare(`UPDATE contracts SET review_task_id = ? WHERE id = ?`).run(taskId, contract.id);
  }
}
