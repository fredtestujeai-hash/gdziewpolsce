// GET /api/ranking?day=RRRR-MM-DD: ranking dnia.
import { handleRanking, type Env } from "../../src/ranking-server";

export const onRequestGet = (ctx: { request: Request; env: Env }) => handleRanking(ctx.request, ctx.env);
