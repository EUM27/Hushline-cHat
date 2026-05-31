import app from "./vercel-app";

export default {
  fetch(request: Request): Response | Promise<Response> {
    return app.fetch(request);
  },
};
