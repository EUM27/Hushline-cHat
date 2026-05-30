import type { Hono } from "hono";
import { generateAdvisorDrafts, generatePersonaDraft } from "./persona-maker.js";
import { advisorMakerBodySchema, personaMakerBodySchema } from "./schemas.js";

export function registerMakerRoutes(app: Hono) {
  app.post("/api/v2/persona-maker/generate", async (context) => {
    const parsed = personaMakerBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "Invalid persona maker request", details: parsed.error.issues }, 400);
    }

    const result = await generatePersonaDraft(parsed.data.prompt, parsed.data.connection);
    return context.json(result);
  });

  app.post("/api/v2/advisor-maker/generate", async (context) => {
    const parsed = advisorMakerBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json({ error: "Invalid advisor maker request", details: parsed.error.issues }, 400);
    }

    const result = await generateAdvisorDrafts(
      parsed.data.prompt,
      parsed.data.count,
      parsed.data.connection,
    );
    return context.json(result);
  });
}
