# AI Video Studio

A simplified, self-hosted take on Higgsfield: create **projects** (with a description) and generate **assets** inside them: images, character references, setting references, audio clips, and voice clones. Everything is saved to a local **gallery folder** on disk. No database.

## Devcontainer is mandatory

**This project must always be executed inside the devcontainer.** Every command (npm, node, next, vitest, eslint, tsc, scripts, one-off shell commands) runs inside the container, never on the host.

```bash
# Start / rebuild the container (from the repo root on the host)
devcontainer up --workspace-folder .

# Run any command inside it
devcontainer exec --workspace-folder . npm run dev
devcontainer exec --workspace-folder . npm test
devcontainer exec --workspace-folder . bash -lc 'cd /workspaces/ai-studio && <command>'
```

Why: the container pins Node 22, mounts the gallery volume at `/gallery`, and sets `GALLERY_PATH`. Running on the host bypasses all of that and writes files to the wrong place.

- Workspace inside the container: `/workspaces/ai-studio`
- Gallery mount: host `./gallery` → container `/gallery` (change the `mounts` entry in `.devcontainer/devcontainer.json` to point at another host folder)
- Dev server: `npm run dev` on port 3000, forwarded to the host

## Commands (all inside the devcontainer)

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Tests | `npm test` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Production build | `npm run build` |

## Architecture

- `src/lib/types.ts` — domain types. Asset types are the model output types (`image | video | audio`); assets carry the catalog `model` slug, the `inputs` sent, an optional `tag` (character / setting / voice) and cached `remoteUrl`.
- `src/lib/settings.ts` — reads/writes `data/settings.json` (gitignored): `galleryPath`, `provider` (`live` or `mock`), `higgsfieldApiKey` (`KEY_ID:KEY_SECRET`, env fallback `HIGGSFIELD_API_KEY`), `elevenlabsApiKey` (env fallback `ELEVENLABS_API_KEY`), `currentProjectId`.
- `src/lib/gallery.ts` — filesystem store, the source of truth. Layout inside the gallery folder:
  - `projects/<projectId>/project.json`
  - `projects/<projectId>/assets/<assetId>.json` + `<assetId>.<ext>`
  - Legacy `character` / `setting` / `voice` types are normalized on read to image/audio with a tag.
- `src/lib/catalog/` — the model catalog.
  - `higgsfield-catalog.ts` fetches `GET https://api.higgsfield.ai/models` with the key (items have `slug`, `operation_type`, `output_type`) and, when an item lacks `input_schema`, parses the public per-model doc at `https://dash.higgsfield.ai/models/<slug>/llms.txt` (`llms.ts`).
  - `elevenlabs-catalog.ts` fetches `GET /v1/models` (TTS-capable only) and every page of `GET /v2/voices` with `xi-api-key`, and builds one audio `ModelSpec` per model whose `voice_id` enum carries `enumLabels` (voice names) and `enumPreviews` (sample URLs). Slugs look like `elevenlabs/<model_id>`.
  - ElevenLabs keys carry permissions. `models_read` refused → fall back to `DEFAULT_TTS_MODELS` with a warning; `voices_read` refused → error with advice. Speech itself needs the `text_to_speech` permission.
  - `refresh.ts` runs every provider that has a key (or a subset), merges via `merge.ts`, and records per-provider `errors` / `warnings` on the catalog. Saving a key in Settings triggers a refresh for that provider automatically.
  - `store.ts` caches the catalog in `data/catalog.json`; `bundled.json` is the offline fallback (Soul 2, Seedance 2.0/2.5). Each `ModelSpec` has a `provider` (`higgsfield` when missing).
  - `schema.ts` — JSON-schema helpers: defaults, form coercion (`f.<key>` fields), validation, and `assetFields()` which finds `format: uri` inputs that the UI fills with gallery assets.
- `src/lib/providers/` — `createProvider(settings, model)` returns the `Provider` that runs that model: `mock` when the setting is mock, otherwise by `model.provider`. `generate({ model, inputs, assets })` returns the output bytes.
  - `higgsfield.ts`: POST `https://api.higgsfield.ai/<slug>` with the inputs, poll `status_url` (2s→10s backoff, 5 min cap), download `images[0].url` / `video.url` / `audio.url`. Gallery assets referenced in uri fields are uploaded first via `POST /files/generate-upload-url` + `PUT`; public URLs come back in `uploadedUrls` and are cached on the asset.
  - `elevenlabs.ts`: POST `https://api.elevenlabs.io/v1/text-to-speech/<voice_id>?output_format=…` with `text`, `model_id` (from the slug) and `voice_settings`; the body is the audio. Default output is `wav_24000` so clips can be Seedance audio references.
  - `mock.ts`: placeholder SVG / animated SVG / WAV by output type, so the app works with no key.
- `src/app/[kind]/page.tsx` — the studio (`/image`, `/video`, `/audio`): project switcher, model select (grouped by family), schema-driven parameter form, and the current project's generations grid with search and column toggle. `src/app/actions.ts` holds all Server Actions. `src/app/api/files/[...path]/route.ts` serves asset files.
- `src/components/schema-form.tsx` renders a model's input schema: prompt → textarea, enum → select, bounded numbers → slider, boolean → checkbox, `uri` fields → asset picker filtered by the field name (image_/audio_/video_). Console `ui_schema` hints decide what is Advanced.

## Conventions

- Next.js 16: `params`/`searchParams` are Promises; use the global `PageProps<'/route'>` helper. Adding or removing route directories needs a dev-server restart (`pkill -f "[n]ext dev"` inside the container, then `npm run dev`). Read `node_modules/next/dist/docs/` before using an API you are unsure about.
- Server Components by default. Add `'use client'` only for interactivity.
- Keep storage logic in `src/lib` and unit-test it with Vitest (`*.test.ts` next to the source). Tests use a temp directory, never the real gallery.
- Never commit `data/` or the contents of `gallery/`.

## Next.js agent rules

Next.js maintains its own guidance in @AGENTS.md. Read it; it points to the bundled docs for this exact version.
