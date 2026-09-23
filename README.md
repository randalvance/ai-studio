# AI Video Studio

A small, self-hosted asset studio for generative video pre-production. Create projects, then generate images, character references, setting references, audio clips and voice clones inside them. Everything is stored in a local gallery folder.

## Run it (devcontainer only)

This project runs **only inside its devcontainer**. See [CLAUDE.md](CLAUDE.md) for the rule and the reasons.

```bash
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . npm run dev
```

Then open http://localhost:3000.

## Where things are saved

- Assets: `./gallery` on the host, mounted at `/gallery` in the container. Change the mount in `.devcontainer/devcontainer.json` to use another folder, or change the path on the Settings page.
- Settings: `data/settings.json` (gitignored).

## How it works

The studio has three sections: Image, Video and Audio. Each shows the models from the Higgsfield catalog that produce that output type. Pick a model and the parameter form is built from that model's input schema; media inputs (image, video or audio URLs) are filled by picking assets already in the project. Generations are saved into the current project and listed on the right.

- **Catalog**: Settings → "Refresh catalog" calls `GET https://api.higgsfield.ai/models` with your Higgsfield key and reads each model's public input schema, and, with an ElevenLabs key, lists ElevenLabs text-to-speech models and your voices. A bundled fallback (Soul 2, Seedance 2.0 / 2.5) is used until then.
- **Higgsfield provider** (default): POSTs to the model endpoint, polls, downloads the result. Referenced assets are uploaded to Higgsfield storage first (jpeg, png, webp, gif, wav, mp4 only) and their public URLs cached.
- **ElevenLabs provider**: the Audio section. The API key needs the Voices: read and Text to Speech permissions (Models: read is optional; without it the documented models are used). Saving the key refreshes the catalog automatically. Pick a model and one of your voices (with a preview), type the line, and get a wav (default) or mp3 clip. Tag it Voice and use it as an audio reference for Seedance.
- **Mock provider**: offline placeholders so the whole flow works without a key.
- **Uploads**: every media input offers Upload next to the project's assets, and the generations header has an Upload button. Uploaded files become project assets you can reuse or tag.
- **Tags**: mark an image as Character or Setting, or an audio clip as Voice, from its card. Tags show in reference pickers.

The Higgsfield catalog currently has no audio models, so Audio is powered by ElevenLabs. Add the ElevenLabs key in Settings and refresh the catalog.

## Development

```bash
devcontainer exec --workspace-folder . npm test
devcontainer exec --workspace-folder . npm run typecheck
devcontainer exec --workspace-folder . npm run lint
devcontainer exec --workspace-folder . npm run build
```
