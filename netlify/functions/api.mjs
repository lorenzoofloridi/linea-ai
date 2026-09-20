import { getDatabase } from "@netlify/database";

export default async (request) => {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return Response.json({
      ok: true,
      service: "linea-ai",
      database: "configured"
    });
  }

  return Response.json(
    { error: "Operazione non disponibile." },
    { status: 404 }
  );
};

export const config = {
  path: "/api/*"
};
