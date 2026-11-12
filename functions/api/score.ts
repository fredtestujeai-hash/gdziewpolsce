// POST /api/score (dołączenie do rankingu) i DELETE /api/score (usunięcie swoich wpisów).
import { handleDelete, handleScore, type Env } from "../../src/ranking-server";

export const onRequestPost = (ctx: { request: Request; env: Env }) => handleScore(ctx.request, ctx.env);
export const onRequestDelete = (ctx: { request: Request; env: Env }) => handleDelete(ctx.request, ctx.env);
