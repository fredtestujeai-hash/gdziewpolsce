// Serwer gry na Cloudflare Workers: pliki statyczne z dist/ obsługuje Cloudflare,
// a ten kod odpowiada tylko na adresy /api/* (ranking).
import { ensureSchema, handleDelete, handleRanking, handleScore, type Env } from "../src/ranking-server";

interface WorkerEnv extends Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

const notFound = () => new Response(JSON.stringify({ error: "Nie ma takiego adresu." }), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } });

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
    try {
      if (env.DB) await ensureSchema(env.DB);
      if (pathname === "/api/ranking" && request.method === "GET") return await handleRanking(request, env);
      if (pathname === "/api/score" && request.method === "POST") return await handleScore(request, env);
      if (pathname === "/api/score" && request.method === "DELETE") return await handleDelete(request, env);
      return notFound();
    } catch (e) {
      console.error(e);
      return new Response(JSON.stringify({ error: "Ranking jest chwilowo niedostępny." }), { status: 503, headers: { "content-type": "application/json; charset=utf-8" } });
    }
  },
};
