export interface Env {
  DB: D1Database;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
  OWNER_DISCORD_USER_ID: string;
  ANDROID_APP_URL: string;
}

const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization"
};

const out = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

async function userFromToken(request: Request, env: Env): Promise<any | null> {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  return await env.DB.prepare(
    "SELECT * FROM users WHERE discord_id = ? LIMIT 1"
  ).bind(token).first();
}

async function requireUser(request: Request, env: Env) {
  const user = await userFromToken(request, env);
  if (!user) throw new Error("UNAUTHORIZED");
  if (Number(user.disabled) === 1) throw new Error("ACCOUNT_DISABLED");
  return user;
}

async function discordToken(env: Env, code: string) {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI
  });
  const r = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {"content-type": "application/x-www-form-urlencoded"},
    body
  });
  if (!r.ok) throw new Error("DISCORD_TOKEN_FAILED");
  return await r.json() as any;
}

async function discordUser(accessToken: string) {
  const r = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) throw new Error("DISCORD_USER_FAILED");
  return await r.json() as any;
}

function avatarUrl(u: any) {
  return u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
    : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, {headers});

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === "/" && method === "GET")
        return out({name: "OneState Hub API", status: "online", version: "1.0.0"});

      if (path === "/health" && method === "GET") {
        await env.DB.prepare("SELECT 1").first();
        return out({ok: true, database: true});
      }

      if (path === "/auth/discord" && method === "GET") {
        const p = new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID,
          response_type: "code",
          redirect_uri: env.DISCORD_REDIRECT_URI,
          scope: "identify"
        });
        return Response.redirect(`https://discord.com/oauth2/authorize?${p}`, 302);
      }

      if (path === "/auth/discord/callback" && method === "GET") {
        const code = url.searchParams.get("code");
        if (!code) return out({error: "missing_code"}, 400);

        const token = await discordToken(env, code);
        const du = await discordUser(token.access_token);
        const role = du.id === env.OWNER_DISCORD_USER_ID ? "OWNER" : "USER";

        await env.DB.prepare(`
          INSERT INTO users (discord_id, username, avatar_url, display_name, role)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(discord_id) DO UPDATE SET
          username=excluded.username,
          avatar_url=excluded.avatar_url,
          updated_at=CURRENT_TIMESTAMP
        `).bind(
          du.id, du.username, avatarUrl(du), du.global_name || du.username, role
        ).run();

        return out({
          ok: true,
          discord_id: du.id,
          username: du.username,
          avatar_url: avatarUrl(du),
          role,
          session_token: du.id
        });
      }

      if (path === "/me" && method === "GET")
        return out(await requireUser(request, env));

      if (path === "/me/setup" && method === "POST") {
        const user: any = await requireUser(request, env);
        const b: any = await request.json();
        if (!b.region || !b.server_code)
          return out({error: "region_and_server_required"}, 400);

        await env.DB.prepare(`
          UPDATE users SET region=?, server_code=?,
          display_name=COALESCE(NULLIF(?, ''), display_name),
          updated_at=CURRENT_TIMESTAMP WHERE id=?
        `).bind(
          String(b.region), String(b.server_code),
          String(b.display_name || ""), user.id
        ).run();

        return out({ok: true});
      }

      if (path === "/posts" && method === "GET") {
        const rows = await env.DB.prepare(`
          SELECT p.*, u.username, u.display_name, u.avatar_url, u.server_code,
          (SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) likes_count,
          (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) comments_count
          FROM posts p JOIN users u ON u.id=p.user_id
          WHERE u.disabled=0 ORDER BY p.id DESC LIMIT 100
        `).all();
        return out(rows.results);
      }

      if (path === "/posts" && method === "POST") {
        const user: any = await requireUser(request, env);
        const b: any = await request.json();
        const body = String(b.body || "").trim();
        if (!body) return out({error: "post_body_required"}, 400);
        if (String(user.role) === "BANNED")
          return out({error: "posting_disabled"}, 403);

        const r = await env.DB.prepare(
          "INSERT INTO posts (user_id,body,media_url,media_type) VALUES (?,?,?,?)"
        ).bind(user.id, body, b.media_url || null, b.media_type || null).run();

        return out({ok: true, id: r.meta.last_row_id}, 201);
      }

      if (/^\/posts\/\d+\/like$/.test(path) && method === "POST") {
        const user: any = await requireUser(request, env);
        const postId = path.split("/")[2];
        const exists = await env.DB.prepare(
          "SELECT 1 FROM likes WHERE post_id=? AND user_id=?"
        ).bind(postId, user.id).first();

        if (exists) {
          await env.DB.prepare(
            "DELETE FROM likes WHERE post_id=? AND user_id=?"
          ).bind(postId, user.id).run();
          return out({liked: false});
        }

        await env.DB.prepare(
          "INSERT INTO likes (post_id,user_id) VALUES (?,?)"
        ).bind(postId, user.id).run();
        return out({liked: true});
      }

      if (path === "/market" && method === "GET") {
        const server = url.searchParams.get("server");
        if (!server) return out({error: "server_required"}, 400);

        const rows = await env.DB.prepare(`
          SELECT l.*, u.username, u.display_name, u.avatar_url, u.server_code
          FROM listings l JOIN users u ON u.id=l.user_id
          WHERE l.server_code=? AND l.status='ACTIVE' AND u.disabled=0
          ORDER BY l.id DESC LIMIT 100
        `).bind(server).all();

        return out(rows.results);
      }

      if (path === "/market" && method === "POST") {
        const user: any = await requireUser(request, env);
        const b: any = await request.json();

        if (!b.server_code || !b.category || !b.title || b.price === undefined)
          return out({error: "server_category_title_price_required"}, 400);

        const r = await env.DB.prepare(`
          INSERT INTO listings
          (user_id,server_code,category,title,price,description,image_url)
          VALUES (?,?,?,?,?,?,?)
        `).bind(
          user.id, String(b.server_code), String(b.category),
          String(b.title), String(b.price),
          b.description || null, b.image_url || null
        ).run();

        return out({ok: true, id: r.meta.last_row_id}, 201);
      }

      if (path === "/admin/users" && method === "GET") {
        const user: any = await requireUser(request, env);
        if (!["OWNER","ADMIN","MODERATOR"].includes(String(user.role)))
          return out({error: "forbidden"}, 403);

        const rows = await env.DB.prepare(
          "SELECT id,discord_id,username,display_name,region,server_code,role,disabled,created_at FROM users ORDER BY id DESC LIMIT 500"
        ).all();
        return out(rows.results);
      }

      if (path === "/admin/users/role" && method === "POST") {
        const user: any = await requireUser(request, env);
        if (String(user.role) !== "OWNER")
          return out({error: "owner_only"}, 403);

        const b: any = await request.json();
        if (!b.discord_id) return out({error: "discord_id_required"}, 400);

        await env.DB.prepare(
          "UPDATE users SET role=?, updated_at=CURRENT_TIMESTAMP WHERE discord_id=?"
        ).bind(String(b.role || "USER"), String(b.discord_id)).run();

        return out({ok: true});
      }

      return out({error: "not_found"}, 404);
    } catch (e: any) {
      const code = e?.message || "server_error";
      return out({error: code}, code === "UNAUTHORIZED" ? 401 : 500);
    }
  }
};
