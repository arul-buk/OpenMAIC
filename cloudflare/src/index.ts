import { Container, getContainer } from "@cloudflare/containers";

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
      GEMINI_LIVE_MODEL: "models/gemini-3.8-live",
      ACCESS_CODE: env.ACCESS_CODE,
      OPENMAIC_SECRET_KEY: env.OPENMAIC_SECRET_KEY,
      OWNER_SINGLE_USER_ID: env.OWNER_SINGLE_USER_ID,
      ASSET_S3_BUCKET: "openmaic-assets",
      ASSET_BYTE_EGRESS: "redirect",
      AWS_REGION: "auto",
      AWS_ENDPOINT_URL_S3: "https://2f8a5cfdd43166fcab6a74e2723ec923.r2.cloudflarestorage.com",
      AWS_S3_FORCE_PATH_STYLE: "1",
      AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    };
  }
}

// Background slide audio prefetcher: quietly warms browser cache for all slide audio
// in the active lesson so mobile/Android tablets play slide-to-slide with zero delay.
const AUDIO_PREFETCH_SNIPPET = `
<script>
(() => {
  const prefetched = new Set();
  const prefetchQueue = [];
  let prefetchActive = 0;
  function pumpPrefetch() {
    while (prefetchActive < 2 && prefetchQueue.length > 0) {
      const url = prefetchQueue.shift();
      if (!url || prefetched.has(url)) continue;
      prefetched.add(url);
      prefetchActive++;
      fetch(url, { credentials: "same-origin", priority: "low" })
        .then((r) => r.arrayBuffer())
        .catch(() => {})
        .finally(() => {
          prefetchActive--;
          pumpPrefetch();
        });
    }
  }
  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const resp = await origFetch(...args);
    try {
      const reqUrl = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      if (resp.ok && /\\/api\\/(stages|persistence\\/stages)/.test(reqUrl)) {
        const ct = resp.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          resp.clone().text().then((body) => {
            const matches = body.match(/\\/api\\/persistence\\/assets\\/[a-zA-Z0-9_-]+\\/content/g);
            if (matches) {
              for (const m of matches) {
                if (!prefetched.has(m)) prefetchQueue.push(m);
              }
              pumpPrefetch();
            }
          }).catch(() => {});
        }
      }
    } catch {}
    return resp;
  };
})();
</script>
`;

async function proxyToContainerWithRetry(
  container: ReturnType<typeof getContainer<OpenMAICContainer>>,
  request: Request,
): Promise<Response> {
  // Buffer small non-GET request bodies so we can safely retry if the container was asleep
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const bodyBuf = hasBody ? await request.clone().arrayBuffer().catch(() => null) : null;

  const buildReq = () =>
    new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: hasBody && bodyBuf ? bodyBuf.slice(0) : undefined,
      redirect: "manual",
    });

  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const targetReq = (attempt === 0 && !hasBody ? request.clone() : buildReq()) as unknown as Request;
      const resp = await container.fetch(targetReq);
      if (resp.status >= 500) {
        const errText = await resp.clone().text().catch(() => "");
        if (
          errText.includes("container is not running") ||
          errText.startsWith("Error proxying request to container")
        ) {
          lastResponse = resp;
          await container.startAndWaitForPorts();
          continue;
        }
      }
      return resp;
    } catch {
      await container.startAndWaitForPorts().catch(() => {});
    }
  }

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "CONTAINER_STARTING",
          message: "Classroom container is waking up — please tap Retry in a few seconds.",
        },
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
  }

  return (
    lastResponse ??
    new Response("Classroom server is waking up — please refresh in a few seconds.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Redirect legacy /live-tutor bookmark to the native Help Me Learn section
    if (url.pathname === "/live-tutor" || url.pathname === "/live-tutor/") {
      return Response.redirect(`${url.origin}/help-me-learn`, 302);
    }

    const container = getContainer(env.OPENMAIC_CONTAINER, "main");
    const response = await proxyToContainerWithRetry(container, request);

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      return new HTMLRewriter()
        .on("body", {
          element(el) {
            el.append(AUDIO_PREFETCH_SNIPPET, { html: true });
          },
        })
        .transform(response);
    }

    return response;
  },
};
