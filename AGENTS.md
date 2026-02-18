Build/Lint/Test:

- `pnpm dev` (all workspaces)
- `pnpm dev:web` (Next app)
- `pnpm build`
- `pnpm check-types` (tsc across workspaces)
- `pnpm check` (oxlint + oxfmt)
  Architecture:
- Monorepo with `apps/*` and `packages/*` (pnpm workspaces)
- `apps/web` is Next.js 16 app router in `src/app`
- OCR API route: `apps/web/src/app/api/ocr/route.ts`
- Mistral OCR client: `apps/web/src/lib/ocr/mistral.ts`
- Chunking: `apps/web/src/lib/engine/chunk.ts`
- Local DB (Dexie): `apps/web/src/lib/db.ts`
- Env schema: `packages/env/src/web.ts` (requires `MISTRAL_API_KEY`)
  Code Style:
- TypeScript strict; add `"use client"` for client components
- Use `@/` alias for app imports; prefer named exports for helpers
- Formatting via `pnpm check` (oxfmt); double quotes + semicolons
- Naming: PascalCase components/types, camelCase functions/vars
- Error handling: throw in server routes, surface status in UI
