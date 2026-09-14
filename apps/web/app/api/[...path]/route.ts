import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

const hopByHopHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function backendUrl(requestUrl: string) {
  const incoming = new URL(requestUrl);
  const configuredBackend = process.env.BACKEND_INTERNAL_URL;
  if (!configuredBackend && process.env.NODE_ENV === "production")
    throw new Error("BACKEND_INTERNAL_URL is required in production");
  const backend = (configuredBackend || "http://localhost:3002").replace(
    /\/$/,
    "",
  );
  return `${backend}${incoming.pathname}${incoming.search}`;
}

function getSetCookies(headers: Headers) {
  const native = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;
  if (native) return native.call(headers);
  const combined = headers.get("set-cookie");
  return combined
    ? combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/).map((value) => value.trim())
    : [];
}

async function proxy(request: Request) {
  const requestHeaders = new Headers();
  request.headers.forEach((value, name) => {
    if (!hopByHopHeaders.has(name)) requestHeaders.append(name, value);
  });

  try {
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstream = await fetch(backendUrl(request.url), {
      method: request.method,
      headers: requestHeaders,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, name) => {
      if (name !== "set-cookie" && !hopByHopHeaders.has(name))
        responseHeaders.append(name, value);
    });
    for (const cookie of getSetCookies(upstream.headers))
      responseHeaders.append("set-cookie", cookie);

    const isBodyless =
      request.method === "HEAD" || [204, 205, 304].includes(upstream.status);
    return new Response(isBodyless ? null : await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const requestId = request.headers.get("x-request-id") || randomUUID();
    console.error("API proxy request failed", { requestId, error });
    return Response.json(
      {
        error: {
          code: "BACKEND_UNAVAILABLE",
          message: "The API service is temporarily unavailable",
        },
        requestId,
      },
      { status: 502, headers: { "x-request-id": requestId } },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
