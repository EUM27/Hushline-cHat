import app from "../packages/server/src/vercel-app";

function handle(request: Request): Response | Promise<Response> {
  return app.fetch(request);
}

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
