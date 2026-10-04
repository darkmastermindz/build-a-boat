import type { Config } from "@netlify/functions";

// Open a GitHub pull request with a design from the simulator.
//   POST /api/propose  { mode: "default" | "new", name, build }
//   default -> replaces data/build.json (the design the site opens with)
//   new     -> adds data/designs/<slug>.json (listed under "Saved in the repo")
// Needs a GITHUB_TOKEN environment variable in Netlify (a fine-grained token
// with Contents and Pull requests write access to the repo). Without it the
// endpoint answers 501 and the page falls back to download + GitHub upload.
// It only ever opens a PR; someone still reviews and merges it.

const MAX_BYTES = 256 * 1024;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "design";

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const token = Netlify.env.get("GITHUB_TOKEN");
  const repo = Netlify.env.get("GITHUB_REPO") || "darkmastermindz/bob";
  const base = Netlify.env.get("GITHUB_BASE") || "main";
  if (!token) return json({ error: "Opening PRs from the site isn't set up (no GITHUB_TOKEN in Netlify).", fallback: true }, 501);
  const text = await req.text();
  if (text.length > MAX_BYTES) return json({ error: "Design is too large (max 256 KB)" }, 413);
  let body: any;
  try { body = JSON.parse(text); } catch { return json({ error: "Body must be JSON" }, 400); }
  const mode = body?.mode === "default" ? "default" : body?.mode === "new" ? "new" : null;
  const b = body?.build;
  if (!mode) return json({ error: 'mode must be "default" or "new"' }, 400);
  if (!b || typeof b !== "object" || typeof b.config !== "object" || !Array.isArray(b.parts) || b.parts.length > 500) return json({ error: "build must include config and parts" }, 400);
  const name = String(body?.name ?? b.name ?? "Design").trim().slice(0, 80) || "Design";
  const path = mode === "default" ? "data/build.json" : `data/designs/${slug(name)}.json`;
  const branch = `design/${slug(name)}-${Date.now().toString(36)}`;
  const gh = async (method: string, url: string, payload?: unknown) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${url}`, {
      method, headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "bob-sim" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data: any = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 404) throw new Error(`GitHub ${method} ${url}: ${r.status} ${data.message || ""}`);
    return { status: r.status, data };
  };
  try {
    const ref = await gh("GET", `/git/ref/heads/${base}`);
    await gh("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha: ref.data.object.sha });
    const existing = await gh("GET", `/contents/${path}?ref=${base}`);
    const out = Object.assign({}, b, { name, updated: new Date().toISOString().slice(0, 10) });
    const content = Buffer.from(JSON.stringify(out, null, 2) + "\n").toString("base64");
    await gh("PUT", `/contents/${path}`, { message: `${mode === "default" ? "Set default design" : "Add design"}: ${name}`, content, branch, ...(existing.status === 200 ? { sha: existing.data.sha } : {}) });
    const pr = await gh("POST", "/pulls", {
      title: mode === "default" ? `Make "${name}" the default design` : `Add design: ${name}`, head: branch, base,
      body: `Proposed from the B.O.B. simulator.\n\n- File: \`${path}\`\n- ${mode === "default" ? "Replaces the design the site opens with." : "Adds it under *Saved in the repo* in the design dropdown."}\n\nReview the diff before merging.`,
    });
    return json({ url: pr.data.html_url, branch, path });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 502);
  }
};

export const config: Config = { path: "/api/propose" };
