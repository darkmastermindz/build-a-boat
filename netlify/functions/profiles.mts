import type { Config, Context } from "@netlify/functions";
import { getDeployStore, getStore } from "@netlify/blobs";

// Shared design profiles for the raft simulator.
//   GET    /api/profiles       -> list of { id, name, savedAt, summary }
//   GET    /api/profiles/:id   -> full profile { id, name, savedAt, summary, build }
//   PUT    /api/profiles/:id   -> save { name, build, summary }
//   DELETE /api/profiles/:id
//   GET    /api/default        -> the design the simulator opens with { name, savedAt, build }, or 404
//   PUT    /api/default        -> set it { name, build }
//   DELETE /api/default        -> back to data/build.json
// Production uses the global store; previews and branch deploys use a
// deploy-scoped store so test data never reaches production.

const MAX_BYTES = 256 * 1024;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

function profileStore(name = "profiles") {
  if (Netlify.context?.deploy.context === "production") {
    return getStore({ name, consistency: "strong" });
  }
  return getDeployStore({ name, consistency: "strong" });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function validBuild(b: any): boolean {
  return b && typeof b === "object" && typeof b.config === "object" && Array.isArray(b.parts) && b.parts.length <= 500;
}

async function readBody(req: Request): Promise<any> {
  const text = await req.text();
  if (text.length > MAX_BYTES) throw json({ error: "Design is too large (max 256 KB)" }, 413);
  try { return JSON.parse(text); } catch { throw json({ error: "Body must be JSON" }, 400); }
}

async function defaultDesign(req: Request) {
  const store = profileStore("settings");
  if (req.method === "GET") {
    const d = await store.get("default", { type: "json" });
    return d ? json(d) : json({ error: "No default set; the simulator uses data/build.json" }, 404);
  }
  if (req.method === "PUT") {
    let body: any;
    try { body = await readBody(req); } catch (r) { return r as Response; }
    if (!validBuild(body?.build)) return json({ error: "build must include config and parts" }, 400);
    const d = { name: String(body.name ?? "").trim().slice(0, 80) || "Team default", savedAt: new Date().toISOString(), build: body.build };
    await store.setJSON("default", d);
    return json(d);
  }
  if (req.method === "DELETE") {
    await store.delete("default");
    return json({ deleted: "default" });
  }
  return json({ error: "Method not allowed" }, 405);
}

export default async (req: Request, context: Context) => {
  if (new URL(req.url).pathname.replace(/\/$/, "") === "/api/default") return defaultDesign(req);
  const store = profileStore();
  const id = context.params?.id;

  if (!id) {
    if (req.method !== "GET") return json({ error: "Use GET on /api/profiles, or PUT/DELETE on /api/profiles/:id" }, 405);
    const { blobs } = await store.list();
    const items = await Promise.all(blobs.map(async ({ key }) => {
      const p = await store.get(key, { type: "json" });
      return p ? { id: p.id, name: p.name, savedAt: p.savedAt, summary: p.summary ?? null } : null;
    }));
    return json({ profiles: items.filter(Boolean).sort((a: any, b: any) => (b.savedAt || "").localeCompare(a.savedAt || "")) });
  }

  if (!ID_RE.test(id)) return json({ error: "Profile id must be lowercase letters, digits and dashes (max 63)" }, 400);

  if (req.method === "GET") {
    const p = await store.get(id, { type: "json" });
    return p ? json(p) : json({ error: "Profile not found" }, 404);
  }

  if (req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json({ error: "Profile is too large (max 256 KB)" }, 413);
    let body: any;
    try { body = JSON.parse(text); } catch { return json({ error: "Body must be JSON" }, 400); }
    const name = String(body?.name ?? "").trim().slice(0, 80);
    if (!name) return json({ error: "Give the profile a name" }, 400);
    if (!validBuild(body.build)) return json({ error: "build must include config and parts" }, 400);
    const profile = { id, name, savedAt: new Date().toISOString(), summary: body.summary ?? null, build: body.build };
    await store.setJSON(id, profile);
    return json(profile);
  }

  if (req.method === "DELETE") {
    await store.delete(id);
    return json({ deleted: id });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config: Config = {
  path: ["/api/profiles", "/api/profiles/:id", "/api/default"],
};
