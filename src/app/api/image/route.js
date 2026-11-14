// Fetches a picture from another site for the "paste an image link" option.
// Browsers can't read most image hosts directly (CORS), so the server does it.
import dns from "node:dns/promises";
import net from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 15_000;

const fail = (error, status = 400) => Response.json({ error }, { status });

// Only public addresses: never let a link reach this machine or its network.
function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

async function checkUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That isn't a valid link.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https links work.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error("Couldn't find that website.");
  if (addrs.some((a) => isPrivate(a.address))) throw new Error("That link points to a private address.");
  return url;
}

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) return fail("No link given.");

  let res;
  try {
    let url = await checkUrl(raw);
    for (let i = 0; ; i++) {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (3DS Theme Studio image fetch)", Accept: "image/*" },
      });
      if (res.status < 300 || res.status >= 400) break;
      if (i >= MAX_REDIRECTS) return fail("That link redirects too many times.");
      url = await checkUrl(new URL(res.headers.get("location") || "", url).href);
    }
  } catch (err) {
    return fail(err.name === "TimeoutError" ? "That website took too long to answer." : err.message || "Couldn't download that link.");
  }

  if (!res.ok) return fail(`That website answered with an error (HTTP ${res.status}).`);
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/")) {
    return fail("That link is a web page, not a picture. Right-click the picture itself and choose “Copy image address”.");
  }
  // SVG can carry scripts, and this route serves from our own origin.
  if (type === "image/svg+xml") return fail("SVG pictures aren't supported. Pick a JPG, PNG or WebP.");
  if (Number(res.headers.get("content-length")) > MAX_BYTES) return fail("That picture is too large (over 25 MB).");

  // Stream with a hard cap, in case the size header was missing or wrong.
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_BYTES) return fail("That picture is too large (over 25 MB).");
    chunks.push(chunk);
  }
  return new Response(Buffer.concat(chunks), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
