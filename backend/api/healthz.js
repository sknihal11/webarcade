import { runApiRoute, sendJson } from "../lib/http.js";

export default async function handler(req, res) {
  await runApiRoute(req, res, async () => {
    sendJson(res, 200, {
      ok: true,
      service: "webarcade-vercel-backend"
    });
  });
}
