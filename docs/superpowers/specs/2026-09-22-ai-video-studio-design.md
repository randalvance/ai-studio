# AI Video Studio — design

Date: 2026-09-22 (revised the same day for the model-driven studio)

## Goal

A local, single-user web app for creating generative assets, organized by project. Think Higgsfield, but simpler: no timelines, no accounts, no cloud storage. The gallery is a folder on disk.

## Scope

- Projects with a name and description. Create, switch, edit, delete. The studio always shows one current project.
- Three sections: Image, Video, Audio. Each lists the catalog models with that output type; selecting one renders its parameters from the model's JSON input schema.
- Assets are image / video / audio files with metadata (model slug, inputs, prompt, optional tag: character / setting / voice, references, cached upload URL).
- Generations grid for the current project only, filtered by section, searchable, with a column toggle.
- Settings: gallery folder, provider, Higgsfield API key, catalog refresh.

Out of scope: video editing or extension workflows beyond what the catalog exposes, authentication, background jobs, audio providers other than what the Higgsfield catalog offers.

## Runtime constraint

Everything runs inside the devcontainer. The gallery folder is a bind mount at `/gallery`. `CLAUDE.md` states this rule.

## Storage

```
<gallery>/projects/<projectId>/project.json
<gallery>/projects/<projectId>/assets/<assetId>.json
<gallery>/projects/<projectId>/assets/<assetId>.<ext>
data/settings.json   # galleryPath, provider, higgsfieldApiKey, currentProjectId (gitignored)
data/catalog.json    # cached model catalog (gitignored)
```

## Catalog

- `GET https://api.higgsfield.ai/models` (auth: `Authorization: Key ID:SECRET`) → `{ total, items: [{ slug, operation_type, output_type, ...}] }`.
- Per-model input schema: from the item's `input_schema` if present, else parsed from `https://dash.higgsfield.ai/models/<slug>/llms.txt` ("Input JSON Schema" block). Items with neither are listed as skipped.
- Bundled fallback catalog with real schemas for Soul 2 and Seedance 2.0 / 2.5.
- ElevenLabs: `GET /v1/models` (TTS-capable) + paginated `GET /v2/voices` → one audio model per TTS model with `voice_id` as an enum carrying voice names and preview URLs; other inputs: text, output_format (wav default), stability, similarity, style, speed, speaker boost, language code, seed (advanced).
- Refresh fetches each provider whose key is set and merges per provider; per-provider errors are stored on the catalog and shown in Settings.

## Generation

- Form fields are `f.<key>`; the server coerces them by schema type, validates (required, enum, min/max, lengths, item counts), resolves `format: uri` fields from gallery asset ids, and calls the provider.
- Higgsfield provider: upload referenced assets via presigned URLs (public URL cached on the asset), POST `https://api.higgsfield.ai/<slug>`, poll `status_url` with 2s→10s backoff and a 5-minute cap, terminal statuses `completed | failed | nsfw | canceled`, download the first output.
- ElevenLabs provider: POST `/v1/text-to-speech/<voice_id>?output_format=…` with `xi-api-key`; body `{ text, model_id, voice_settings, language_code?, seed? }`; the response body is the audio.
- Provider dispatch: `mock` setting → mock for everything; otherwise by the model's provider.
- Errors redirect back to the section with `?error=` and render as a banner.

## UI

- Icon rail: Image, Video, Audio, Settings.
- Left panel: project switcher, model select grouped by family, schema-driven parameters (Advanced collapsed), Generate.
- Main: "My generations" for the current project and section, search, column toggle, cards with media, model, prompt, tag select, download, delete.

## Testing

Vitest against temp directories and fake `fetch`: gallery (incl. legacy migration), settings, catalog (llms parser, schema helpers, API fetch, store), providers (Higgsfield generic run + uploads, mock). Pages verified with `next build` and a browser walkthrough.
