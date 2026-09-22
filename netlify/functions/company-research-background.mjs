import { getDatabase } from "@netlify/database";
import { researchCompany } from "../lib/company-research.mjs";

export default async request => {
  const db = getDatabase();

  let body;

  try {
    body = await request.json();
  } catch {
    console.error(
      "Company research: invalid request."
    );
    return;
  }

  const companyId =
    typeof body?.company_id === "string"
      ? body.company_id.trim()
      : "";

  if (!companyId) {
    console.error(
      "Company research: missing company_id."
    );
    return;
  }

  try {
    const profileResult =
      await db.pool.query(
        `SELECT data
           FROM plan_profiles
          WHERE company_id=$1`,
        [companyId]
      );

    const profile =
      profileResult.rows[0]?.data;

    if (!profile) {
      throw new Error(
        "COMPANY_PROFILE_NOT_FOUND"
      );
    }

    await db.pool.query(
      `UPDATE company_knowledge
          SET status='researching',
              started_at=COALESCE(started_at,NOW()),
              completed_at=NULL,
              updated_at=NOW(),
              error=NULL
        WHERE company_id=$1`,
      [companyId]
    );

    const research =
      await researchCompany(profile);

    const finalStatus =
      research.verified
        ? "verified"
        : "needs_review";

    await db.pool.query(
      `UPDATE company_knowledge
          SET status=$1,
              knowledge=$2::jsonb,
              sources=$3::jsonb,
              completed_at=NOW(),
              updated_at=NOW(),
              error=NULL
        WHERE company_id=$4`,
      [
        finalStatus,
        JSON.stringify(
          research.knowledge
        ),
        JSON.stringify(
          research.sources
        ),
        companyId
      ]
    );

    await db.pool.query(
      `UPDATE plan_profiles
          SET status=$1,
              updated_at=NOW()
        WHERE company_id=$2`,
      [
        finalStatus,
        companyId
      ]
    );

    await db.pool.query(
      `INSERT INTO company_knowledge_events
       (
         company_id,
         status,
         message
       )
       VALUES ($1,$2,$3)`,
      [
        companyId,
        finalStatus,
        finalStatus === "verified"
          ? "Ricerca aziendale completata."
          : "Ricerca completata con verifica aggiuntiva necessaria."
      ]
    );
  } catch (error) {
    console.error(
      "Company research background error:",
      error?.message || "unknown"
    );

    await db.pool.query(
      `UPDATE company_knowledge
          SET status='failed',
              completed_at=NOW(),
              updated_at=NOW(),
              error=$1
        WHERE company_id=$2`,
      [
        String(
          error?.message ||
          "Ricerca non riuscita."
        ).slice(0, 1000),
        companyId
      ]
    );

    await db.pool.query(
      `UPDATE plan_profiles
          SET status='needs_review',
              updated_at=NOW()
        WHERE company_id=$1`,
      [companyId]
    );

    await db.pool.query(
      `INSERT INTO company_knowledge_events
       (
         company_id,
         status,
         message
       )
       VALUES ($1,'failed',$2)`,
      [
        companyId,
        "Ricerca aziendale non completata."
      ]
    );
  }
};

export const config = {
  background: true
};