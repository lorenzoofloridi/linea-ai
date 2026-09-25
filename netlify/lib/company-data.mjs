// Dati della dashboard aziendale: panoramica, note del team, cancellazione ed esportazione.
// Ogni funzione riceve il company_id già verificato dalla sessione: nessun ID dal browser.
import { buildXlsx } from "./xlsx.mjs";
import { randomBytes } from "node:crypto";

const fail = (status, message) => {
  const error = new Error(message);
  error.httpStatus = status;
  throw error;
};

const list = value =>
  Array.isArray(value)
    ? value.filter(item => typeof item === "string" && item.trim()).map(item => item.trim())
    : [];

/** Trasforma la knowledge base della ricerca in voci leggibili per la dashboard. */
export function knowledgeEntries(row) {
  if (!row || !row.knowledge || typeof row.knowledge !== "object") return [];
  const k = row.knowledge;
  const firstSource = Array.isArray(row.sources) && row.sources[0]?.url ? row.sources[0].url : "Ricerca automatica";
  const verified = row.status === "verified";
  const entry = (content, source = firstSource) =>
    content ? { kind: "public", content, source, verified, ai_allowed: false } : null;

  const contacts = [k.contacts?.email, k.contacts?.phone].filter(Boolean).join(" · ");
  const entries = [
    entry(k.identity?.description),
    list(k.services).length && entry("Servizi: " + list(k.services).join(", ")),
    list(k.products).length && entry("Prodotti: " + list(k.products).join(", ")),
    list(k.brands).length && entry("Marchi: " + list(k.brands).join(", ")),
    list(k.locations).length && entry("Sedi: " + list(k.locations).join("; ")),
    list(k.service_areas).length && entry("Zone servite: " + list(k.service_areas).join(", ")),
    list(k.opening_hours).length && entry("Orari: " + list(k.opening_hours).join("; ")),
    contacts && entry("Contatti: " + contacts),
    ...(Array.isArray(k.faq) ? k.faq : [])
      .filter(item => item?.question && item?.answer)
      .slice(0, 20)
      .map(item => entry(item.question + " — " + item.answer)),
    ...list(k.commercial_information).slice(0, 20).map(item => entry(item))
  ];
  return entries.filter(Boolean).slice(0, 60);
}

export async function companyOverview(db, companyId) {
  const [management, stats, feedback, notes, knowledge] = await Promise.all([
    db.pool.query("SELECT verified, config_version FROM company_management WHERE company_id=$1", [companyId]),
    db.pool.query(
      `SELECT
         (SELECT COUNT(*) FROM conversations c
           WHERE c.company_id=$1
             AND EXISTS (SELECT 1 FROM messages m WHERE m.company_id=c.company_id AND m.conversation_id=c.id)) AS conversations,
         (SELECT COUNT(*) FROM leads WHERE company_id=$1) AS leads,
         (SELECT ROUND(AVG(rating)::numeric, 1) FROM feedback WHERE company_id=$1) AS feedback_average,
         (SELECT COUNT(*) FROM feedback WHERE company_id=$1) AS feedback_count,
         (SELECT ROUND(AVG(rating)::numeric, 1) FROM feedback
           WHERE company_id=$1
             AND created_at >= date_trunc('month', NOW() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome') AS feedback_month_average`,
      [companyId]
    ),
    db.pool.query(
      `SELECT rating, comment, created_at FROM feedback
        WHERE company_id=$1
        ORDER BY created_at DESC LIMIT 30`,
      [companyId]
    ),
    db.pool.query(
      `SELECT comment, created_at AS updated_at FROM company_notes
        WHERE company_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [companyId]
    ),
    db.pool.query("SELECT status, knowledge, sources FROM company_knowledge WHERE company_id=$1", [companyId])
  ]);

  const s = stats.rows[0];
  const conversations = Number(s.conversations) || 0;
  const leads = Number(s.leads) || 0;

  return {
    verified: Boolean(management.rows[0]?.verified),
    config_version: management.rows[0]?.config_version ?? 1,
    research_status: knowledge.rows[0]?.status || null,
    statistics: {
      conversations,
      leads,
      lead_percentage: conversations ? Math.round((leads / conversations) * 100) : null,
      feedback_average: s.feedback_average === null ? null : Number(s.feedback_average),
      feedback_count: Number(s.feedback_count) || 0,
      feedback_month_average: s.feedback_month_average === null ? null : Number(s.feedback_month_average)
    },
    knowledge: knowledgeEntries(knowledge.rows[0]),
    installations: [],
    feedback: feedback.rows.map(f => ({
      rating: f.rating,
      comment: f.comment,
      created_at: new Date(f.created_at).toISOString()
    })),
    reviews: notes.rows
  };
}

async function ownedConversation(db, companyId, conversationId) {
  if (typeof conversationId !== "string" || !conversationId || conversationId.length > 100) {
    fail(400, "Conversazione non valida.");
  }
  const found = await db.pool.query(
    "SELECT id FROM conversations WHERE company_id=$1 AND id=$2",
    [companyId, conversationId]
  );
  if (!found.rowCount) fail(404, "Conversazione non disponibile.");
  return conversationId;
}

export async function addCompanyNote(db, companyId, body) {
  const conversationId = await ownedConversation(db, companyId, body?.conversation);
  const comment = typeof body?.comment === "string" ? body.comment.trim() : "";
  if (!comment || comment.length > 2000) fail(400, "Scrivi una nota di massimo 2.000 caratteri.");
  await db.pool.query(
    "INSERT INTO company_notes(id, company_id, conversation_id, comment) VALUES($1,$2,$3,$4)",
    [randomBytes(16).toString("base64url"), companyId, conversationId, comment]
  );
  return { saved: true };
}

export async function deleteConversation(db, companyId, body) {
  if (body?.confirm !== true) fail(400, "Conferma la cancellazione.");
  const conversationId = await ownedConversation(db, companyId, body?.conversation);
  // Le chiavi esterne eliminano a cascata messaggi, richiesta, feedback e note.
  await db.pool.query("DELETE FROM conversations WHERE company_id=$1 AND id=$2", [companyId, conversationId]);
  return { deleted: true };
}

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  // Evita che Excel interpreti il contenuto come formula (CSV injection).
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export async function exportLeadsCsv(db, companyId) {
  const rows = (
    await db.pool.query(
      `SELECT created_at, status, kind, data, consent, summary
         FROM leads WHERE company_id=$1 ORDER BY created_at DESC LIMIT 5000`,
      [companyId]
    )
  ).rows;

  const keys = [...new Set(rows.flatMap(r => Object.keys(r.data || {})))];
  const header = ["Ricevuta il", "Stato", "Origine", ...keys, "Consenso"];
  const origin = { real: "Sito", test: "Chat di prova", public_demo: "Demo" };
  const lines = [header.map(csvCell).join(";")];

  for (const r of rows) {
    lines.push(
      [
        new Date(r.created_at).toISOString(),
        r.status,
        origin[r.kind] || r.kind,
        ...keys.map(key => r.data?.[key] ?? ""),
        r.consent
      ].map(csvCell).join(";")
    );
  }

  // BOM iniziale: Excel riconosce correttamente accenti e caratteri speciali.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// Esportazione per Excel (.xlsx): stesse colonne del CSV, date leggibili
// in ora italiana, consenso come Sì/No. Solo le richieste dell'azienda.
export async function exportLeadsXlsx(db, companyId) {
  const rows = (
    await db.pool.query(
      `SELECT created_at, status, kind, data, consent, summary
         FROM leads WHERE company_id=$1 ORDER BY created_at DESC LIMIT 5000`,
      [companyId]
    )
  ).rows;

  const keys = [...new Set(rows.flatMap(r => Object.keys(r.data || {})))];
  const origin = { real: "Sito", test: "Chat di prova", public_demo: "Demo" };
  const when = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short"
  });
  const table = [["Ricevuta il", "Stato", "Origine", ...keys, "Consenso al contatto"]];
  for (const r of rows) {
    table.push([
      when.format(new Date(r.created_at)),
      r.status,
      origin[r.kind] || r.kind,
      ...keys.map(key => r.data?.[key] ?? ""),
      r.consent ? "Sì" : "No"
    ]);
  }
  return buildXlsx(table, { sheetName: "Richieste" });
}

