// Ricerca e preparazione automatica della knowledge base aziendale.
// Questo modulo gira esclusivamente server-side.

function ready(env = process.env) {
  return Boolean(
    env.GEMINI_API_KEY &&
    env.GOOGLE_GEMINI_BASE_URL
  );
}

function cleanText(value, maximum = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .slice(0, maximum);
}

function validWebsite(value) {
  try {
    const url = new URL(value);

    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function extractSources(raw) {
  const sources = [];
  const seen = new Set();

  for (const candidate of raw?.candidates || []) {
    const chunks =
      candidate?.groundingMetadata
        ?.groundingChunks || [];

    for (const chunk of chunks) {
      const web = chunk?.web;

      if (
        !web ||
        typeof web.uri !== "string" ||
        !web.uri ||
        seen.has(web.uri)
      ) {
        continue;
      }

      seen.add(web.uri);

      sources.push({
        url: web.uri,
        title:
          typeof web.title === "string"
            ? web.title.slice(0, 300)
            : ""
      });
    }

    const urlMetadata =
      candidate?.urlContextMetadata
        ?.urlMetadata || [];

    for (const item of urlMetadata) {
      const url =
        item?.retrievedUrl ||
        item?.url;

      if (
        typeof url !== "string" ||
        !url ||
        seen.has(url)
      ) {
        continue;
      }

      seen.add(url);

      sources.push({
        url,
        title: "Sito ufficiale"
      });
    }
  }

  return sources.slice(0, 50);
}

function responseText(raw) {
  return (
    raw?.candidates?.[0]
      ?.content?.parts || []
  )
    .map(part =>
      typeof part?.text === "string"
        ? part.text
        : ""
    )
    .join("")
    .trim();
}

export async function researchCompany(
  profile,
  {
    env = process.env,
    transport = fetch
  } = {}
) {
  if (!ready(env)) {
    throw new Error(
      "COMPANY_RESEARCH_UNAVAILABLE"
    );
  }

  if (
    !profile ||
    typeof profile !== "object"
  ) {
    throw new Error(
      "COMPANY_RESEARCH_INVALID_PROFILE"
    );
  }

  const company = {
    legal_name:
      cleanText(profile.legal_name, 250),

    vat:
      cleanText(profile.vat, 100),

    website:
      cleanText(profile.website, 500),

    business_email:
      cleanText(profile.business_email, 250),

    business_phone:
      cleanText(profile.business_phone, 100),

    address:
      cleanText(profile.address, 250),

    city:
      cleanText(profile.city, 150),

    postal_code:
      cleanText(profile.postal_code, 50),

    country:
      cleanText(profile.country, 10)
        .toUpperCase()
  };

  if (
    !company.legal_name ||
    !validWebsite(company.website)
  ) {
    throw new Error(
      "COMPANY_RESEARCH_INVALID_PROFILE"
    );
  }

  const model =
    env.LINEA_RESEARCH_MODEL ||
    env.LINEA_AI_MODEL ||
    "gemini-2.5-flash-lite";

  if (
    !/^[a-z0-9.-]+$/.test(model)
  ) {
    throw new Error(
      "COMPANY_RESEARCH_UNAVAILABLE"
    );
  }

  const prompt = `
Sei il motore di onboarding aziendale di Linea AI.

Devi costruire una knowledge base commerciale affidabile per l'assistente AI di UNA SOLA azienda.

AZIENDA DICHIARATA:
${JSON.stringify(company, null, 2)}

SITO UFFICIALE DICHIARATO:
${company.website}

OBIETTIVO:
1. Analizza il sito ufficiale indicato.
2. Cerca sul web informazioni pubbliche pertinenti sull'azienda.
3. Cerca di distinguere questa azienda da eventuali omonimi usando ragione sociale, sito, località e identificativo fiscale.
4. Dai priorità al sito ufficiale e a fonti autorevoli.
5. Non inventare informazioni.
6. Non usare dati appartenenti ad aziende omonime se non sei ragionevolmente certo che si riferiscano alla stessa azienda.
7. Non raccogliere dati personali non necessari.
8. Non trattare risultati di ricerca non verificati come fatti certi.
9. Se una informazione non è disponibile, usa stringa vuota o array vuoto.
10. Lo scopo è preparare un assistente commerciale che possa rispondere correttamente ai visitatori del sito.

Raccogli, quando realmente disponibili:
- identità e descrizione dell'azienda;
- settore;
- prodotti;
- servizi;
- marchi o linee commerciali;
- sedi pubbliche;
- aree geografiche servite;
- contatti aziendali pubblici;
- orari pubblicati;
- FAQ;
- informazioni commerciali utili;
- modalità di richiesta preventivo o contatto;
- informazioni importanti per un potenziale cliente;
- eventuali limitazioni o informazioni che l'assistente NON deve inventare.

Restituisci ESCLUSIVAMENTE JSON valido con questa struttura:

{
  "identity": {
    "legal_name": "",
    "display_name": "",
    "vat": "",
    "website": "",
    "sector": "",
    "description": "",
    "headquarters": ""
  },
  "products": [],
  "services": [],
  "brands": [],
  "locations": [],
  "service_areas": [],
  "contacts": {
    "email": "",
    "phone": ""
  },
  "opening_hours": [],
  "faq": [
    {
      "question": "",
      "answer": ""
    }
  ],
  "commercial_information": [],
  "customer_information": [],
  "assistant_rules": [],
  "research_summary": "",
  "confidence": "high|medium|low"
}

Non aggiungere markdown.
Non aggiungere testo prima o dopo il JSON.
`;

  const base =
    env.GOOGLE_GEMINI_BASE_URL
      .replace(/\/+$/, "");

  const response =
    await transport(
      `${base}/v1beta/models/${model}:generateContent`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "x-goog-api-key":
            env.GEMINI_API_KEY
        },

        signal:
          AbortSignal.timeout(
            45000
          ),

        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],

          tools: [
            {
              url_context: {}
            },
            {
              google_search: {}
            }
          ],

          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 5000,
            responseMimeType:
              "application/json"
          }
        })
      }
    );

  if (!response.ok) {
  const errorText = await response.text();

  console.error(
    "Gemini research request failed:",
    response.status,
    errorText.slice(0, 2000)
  );

  throw new Error(
    `COMPANY_RESEARCH_UNAVAILABLE_${response.status}`
  );
}

  const raw =
    await response.json();

  const output =
    responseText(raw);

  if (!output) {
    throw new Error(
      "COMPANY_RESEARCH_UNAVAILABLE"
    );
  }

  let knowledge;

  try {
    knowledge =
      JSON.parse(output);
  } catch {
    throw new Error(
      "COMPANY_RESEARCH_INVALID_RESPONSE"
    );
  }

  if (
    !knowledge ||
    typeof knowledge !== "object" ||
    Array.isArray(knowledge)
  ) {
    throw new Error(
      "COMPANY_RESEARCH_INVALID_RESPONSE"
    );
  }

  const confidence =
    ["high", "medium", "low"].includes(
      knowledge.confidence
    )
      ? knowledge.confidence
      : "low";

  knowledge.confidence =
    confidence;

  return {
    knowledge,

    sources:
      extractSources(raw),

    verified:
      confidence !== "low"
  };
}