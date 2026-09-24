import { getDatabase } from "../lib/db.mjs";
import { researchCompany } from "../lib/company-research.mjs";
import { internalRequestAuthorized } from "../lib/internal-auth.mjs";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export default async request => {
  if (request.method !== "POST") {
    return json(
      {
        error: "Metodo non disponibile."
      },
      405
    );
  }

  // Le background function hanno un URL pubblico: si accetta solo
  // la chiamata interna firmata dal backend (LINEA_INTERNAL_SECRET).
  if (
    !internalRequestAuthorized(request)
  ) {
    console.error(
      "Company research: unauthorized request."
    );

    return json(
      {
        error: "Non autorizzato."
      },
      401
    );
  }

  const db = getDatabase();

  let body;

  try {
    body = await request.json();
  } catch {
    console.error(
      "Company research: invalid request."
    );

    return json(
      {
        error: "Richiesta non valida."
      },
      400
    );
  }

  const companyId =
    typeof body?.company_id === "string"
      ? body.company_id.trim()
      : "";

  if (!companyId || companyId.length > 200) {
    console.error(
      "Company research: missing or invalid company_id."
    );

    return json(
      {
        error: "Azienda non valida."
      },
      400
    );
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

    if (
      !profile ||
      typeof profile !== "object" ||
      Array.isArray(profile)
    ) {
      throw new Error(
        "COMPANY_PROFILE_NOT_FOUND"
      );
    }

    // Si procede solo per una ricerca messa in coda dal backend.
    const knowledgeResult =
      await db.pool.query(
        `SELECT company_id
           FROM company_knowledge
          WHERE company_id=$1
            AND status='pending'`,
        [companyId]
      );

    if (!knowledgeResult.rowCount) {
      console.error(
        "Company research: no pending research."
      );

      return json(
        {
          error: "Nessuna ricerca in attesa."
        },
        409
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

    console.log(
      "Company research completed:",
      companyId,
      finalStatus
    );

    return json(
      {
        ok: true,
        company_id: companyId,
        status: finalStatus
      },
      200
    );
  } catch (error) {
    console.error(
      "Company research background error:",
      error?.message || "unknown"
    );

    const errorMessage =
      String(
        error?.message ||
        "Ricerca non riuscita."
      ).slice(0, 1000);

    try {
      await db.pool.query(
        `UPDATE company_knowledge
            SET status='failed',
                completed_at=NOW(),
                updated_at=NOW(),
                error=$1
          WHERE company_id=$2`,
        [
          errorMessage,
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
    } catch (databaseError) {
      console.error(
        "Company research database update failed:",
        databaseError?.message || "unknown"
      );
    }

    return json(
      {
        error:
          "Ricerca aziendale non completata."
      },
      500
    );
  }
};

export const config = {
  background: true
};