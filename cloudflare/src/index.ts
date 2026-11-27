import { Container, getContainer } from "@cloudflare/containers";
import { LIVE_TUTOR_HTML } from "./live-tutor-html";

export interface Env {
  OPENMAIC_CONTAINER: DurableObjectNamespace<OpenMAICContainer>;
  DATABASE_URL: string;
  GOOGLE_API_KEY: string;
  ACCESS_CODE: string;
  OPENMAIC_SECRET_KEY: string;
  OWNER_SINGLE_USER_ID: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
}

export class OpenMAICContainer extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = "30m";

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: "production",
      HOSTNAME: "0.0.0.0",
      PORT: "3000",
      OPENMAIC_CONFIG: "/app/openmaic.yml",
      OWNER_SINGLE_USER: "true",
      DATABASE_URL: env.DATABASE_URL,
      GOOGLE_API_KEY: env.GOOGLE_API_KEY,
      ACCESS_CODE: env.ACCESS_CODE,
      OPENMAIC_SECRET_KEY: env.OPENMAIC_SECRET_KEY,
      OWNER_SINGLE_USER_ID: env.OWNER_SINGLE_USER_ID,
      ASSET_S3_BUCKET: "openmaic-assets",
      AWS_REGION: "auto",
      AWS_ENDPOINT_URL_S3: "https://2f8a5cfdd43166fcab6a74e2723ec923.r2.cloudflarestorage.com",
      AWS_S3_FORCE_PATH_STYLE: "1",
      AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    };
  }
}

const LIVE_AUTH_COOKIE = "openmaic_live_auth";

async function signAccessToken(accessCode: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("live-tutor:" + accessCode));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function isLiveAuthorized(request: Request, env: Env): Promise<boolean> {
  if (!env.ACCESS_CODE) return true;
  const cookieVal = getCookie(request, LIVE_AUTH_COOKIE);
  if (!cookieVal) return false;
  const expected = await signAccessToken(env.ACCESS_CODE, env.OPENMAIC_SECRET_KEY || env.ACCESS_CODE);
  return cookieVal === expected;
}

async function handleLiveAuth(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const ok = await isLiveAuthorized(request, env);
    return new Response(JSON.stringify({ authorized: ok }), {
      status: ok ? 200 : 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  if (request.method === "POST") {
    let body: { code?: string } = {};
    try {
      body = (await request.json()) as { code?: string };
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (!env.ACCESS_CODE || body.code?.trim() === env.ACCESS_CODE.trim()) {
      const token = await signAccessToken(env.ACCESS_CODE || "", env.OPENMAIC_SECRET_KEY || env.ACCESS_CODE || "openmaic");
      return new Response(JSON.stringify({ authorized: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Set-Cookie": `${LIVE_AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/live-tutor; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
        },
      });
    }
    return new Response(JSON.stringify({ authorized: false }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

async function handleLiveWebSocket(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const authorized = await isLiveAuthorized(request, env);
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  if (!authorized) {
    server.accept();
    server.close(4401, "Unauthorized");
    return new Response(null, { status: 101, webSocket: client });
  }

  const upstreamUrl =
    "https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=" +
    encodeURIComponent(env.GOOGLE_API_KEY);

  const upstreamResp = await fetch(upstreamUrl, {
    headers: { Upgrade: "websocket" },
  });
  const upstream = upstreamResp.webSocket;
  if (!upstream) {
    return new Response("Failed to connect to Gemini Live API", { status: 502 });
  }

  server.accept();
  upstream.accept();

  server.addEventListener("message", (event) => {
    try {
      upstream.send(event.data);
    } catch {}
  });
  upstream.addEventListener("message", (event) => {
    try {
      server.send(event.data);
    } catch {}
  });

  const closeBoth = (code?: number, reason?: string) => {
    try { server.close(code && code >= 1000 && code < 5000 ? code : 1000, reason); } catch {}
    try { upstream.close(code && code >= 1000 && code < 5000 ? code : 1000, reason); } catch {}
  };

  server.addEventListener("close", (e) => closeBoth(e.code, e.reason));
  upstream.addEventListener("close", (e) => closeBoth(e.code, e.reason));
  server.addEventListener("error", () => closeBoth(1011, "Client error"));
  upstream.addEventListener("error", () => closeBoth(1011, "Upstream error"));

  return new Response(null, { status: 101, webSocket: client });
}

const FLOATING_LAUNCHER_SNIPPET = `
<style id="openmaic-live-camera-style">
  #openmaic-live-fab {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483640;
    background: #111827;
    color: #fff;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 999px;
    padding: 10px 16px;
    font: 600 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(0,0,0,0.28);
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  #openmaic-live-fab:hover { background: #1f2937; }
  #openmaic-live-drawer {
    position: fixed;
    top: 16px;
    right: 16px;
    bottom: 16px;
    width: min(440px, calc(100vw - 32px));
    z-index: 2147483641;
    background: #0f1115;
    border: 1px solid #2a2f3a;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 50px rgba(0,0,0,0.45);
    display: none;
    flex-direction: column;
  }
  #openmaic-live-drawer.open { display: flex; }
  #openmaic-live-drawer-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #171a21;
    border-bottom: 1px solid #2a2f3a;
    color: #f3f5f8;
    font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  #openmaic-live-drawer-close {
    background: transparent;
    border: none;
    color: #98a2b3;
    font-size: 18px;
    cursor: pointer;
    padding: 2px 6px;
  }
  #openmaic-live-drawer iframe {
    border: 0;
    width: 100%;
    flex: 1;
  }
</style>
<button id="openmaic-live-fab" type="button" title="Open Gemini Live Notebook Camera Tutor">
  <span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;"></span>
  Notebook Camera
</button>
<div id="openmaic-live-drawer" aria-label="Notebook Camera Tutor">
  <div id="openmaic-live-drawer-bar">
    <span>Gemini Live · Notebook Camera</span>
    <div style="display:flex;align-items:center;gap:10px;">
      <a href="/live-tutor" target="_blank" rel="noopener" style="color:#93c5fd;text-decoration:none;font-size:12px;">Pop out &#8599;</a>
      <button id="openmaic-live-drawer-close" type="button" aria-label="Close">&times;</button>
    </div>
  </div>
  <iframe id="openmaic-live-iframe" allow="camera; microphone; autoplay; speaker-selection" src="about:blank"></iframe>
</div>
<script>
(() => {
  function initFab() {
    const fab = document.getElementById("openmaic-live-fab");
    const drawer = document.getElementById("openmaic-live-drawer");
    const closeBtn = document.getElementById("openmaic-live-drawer-close");
    const iframe = document.getElementById("openmaic-live-iframe");
    if (!fab || !drawer || !closeBtn || !iframe || fab.dataset.bound) return;
    fab.dataset.bound = "1";
    fab.addEventListener("click", () => {
      if (!iframe.src || !iframe.src.includes("/live-tutor")) iframe.src = "/live-tutor";
      drawer.classList.add("open");
    });
    closeBtn.addEventListener("click", () => {
      drawer.classList.remove("open");
      iframe.src = "about:blank";
    });
  }
  initFab();
  window.addEventListener("load", initFab);
})();
</script>
`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/live-tutor" || url.pathname === "/live-tutor/") {
      return new Response(LIVE_TUTOR_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname === "/live-tutor/auth") {
      return handleLiveAuth(request, env);
    }

    if (url.pathname === "/live-tutor/ws") {
      return handleLiveWebSocket(request, env);
    }

    const container = getContainer(env.OPENMAIC_CONTAINER, "main");
    const response = await container.fetch(request);

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      return new HTMLRewriter()
        .on("body", {
          element(el) {
            el.append(FLOATING_LAUNCHER_SNIPPET, { html: true });
          },
        })
        .transform(response);
    }

    return response;
  },
};
