import { Readable } from "node:stream";
import app from "./vercel-app";

export default async function handleVercelRequest(request: any, response: any) {
  try {
    const webRequest = toWebRequest(request);
    const webResponse = await app.fetch(webRequest);
    await writeWebResponse(response, webResponse);
  } catch (reason) {
    console.error(reason);
    response.statusCode = 500;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Internal Server Error" }));
  }
}

function toWebRequest(request: any): Request {
  const method = request.method ?? "GET";
  const protocol = request.headers?.["x-forwarded-proto"] ?? "https";
  const host = request.headers?.host ?? "localhost";
  const rawUrl = request.url ?? "/";
  const url = rawUrl.startsWith("http") ? rawUrl : `${protocol}://${host}${rawUrl}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
  };

  if (method !== "GET" && method !== "HEAD") {
    const body = getRequestBody(request);
    if (body !== undefined) {
      init.body = body;
      init.duplex = "half";
    }
  }

  return new Request(url, init);
}

function getRequestBody(request: any): BodyInit | undefined {
  if (request.body === undefined || request.body === null) {
    return typeof request.pipe === "function"
      ? (Readable.toWeb(request) as unknown as ReadableStream)
      : undefined;
  }
  if (typeof request.body === "string" || request.body instanceof Uint8Array) {
    return request.body;
  }
  return JSON.stringify(request.body);
}

async function writeWebResponse(response: any, webResponse: Response) {
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => {
    response.setHeader(key, value);
  });
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}
