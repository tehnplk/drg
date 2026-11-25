// A request that came through a Cloudflare tunnel (Cloudflare always adds cf-connecting-ip) must give TUNNEL_USER
// and TUNNEL_PASSWORD in Basic Auth; localhost and the LAN pass as before. TUNNEL_PASSWORD unset: tunnel requests are refused.
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  if (!req.headers.has("cf-connecting-ip")) return;
  const { TUNNEL_USER = "", TUNNEL_PASSWORD } = process.env;
  const [scheme, b64] = req.headers.get("authorization")?.split(" ") ?? [];
  const given = scheme === "Basic" && b64 ? Buffer.from(b64, "base64").toString() : null;
  if (TUNNEL_PASSWORD && given === `${TUNNEL_USER}:${TUNNEL_PASSWORD}`) return;
  return new NextResponse("ต้องใส่รหัสผ่าน", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="PLK Chart AI", charset="UTF-8"' } });
}
