# Legacy Engine Boundary

`packages/server/src/engine` is the v1 compatibility engine used by `createApp` and the existing non-v2 API routes.

Do not move v2 case-knowledge, director-law, reveal-budget, scene-snapshot, or multi-agent turn pipeline code into this folder. New runtime features should target `packages/server/src/engine-v2`.

Keep v1 tests passing until the v1 API route is intentionally removed.
