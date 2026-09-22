import Link from "next/link";
import { refreshCatalog, saveSettings } from "@/app/actions";
import { Card, buttonClass, ghostButtonClass, inputClass, sectionLabelClass } from "@/components/ui";
import { PROVIDER_CHOICES } from "@/lib/providers";
import { parseCredential } from "@/lib/providers/higgsfield";
import { catalogStore, settingsStore } from "@/lib/studio";

export const dynamic = "force-dynamic";

export default async function SettingsPage(props: PageProps<"/settings">) {
  const sp = await props.searchParams;
  const [settings, catalog] = await Promise.all([settingsStore.get(), catalogStore.get()]);
  const cred = parseCredential(settings.higgsfieldApiKey);
  const keyStatus = cred ? `Key configured (ID ${cred.keyId.slice(0, 4)}…${cred.keyId.slice(-4)})` : "No key configured";
  const counts = { image: 0, video: 0, audio: 0 };
  for (const m of catalog.models) counts[m.outputType] += 1;

  return (
    <main className="flex-1 p-6">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Settings</h1>
        <Link href="/image" className="text-sm text-muted hover:text-foreground">
          ← Back to studio
        </Link>
      </div>
      {typeof sp.error === "string" && (
        <p role="alert" className="mb-4 max-w-xl rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {sp.error}
        </p>
      )}
      {sp.refreshed && (
        <p className="mb-4 max-w-xl rounded-md border border-emerald-900 bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
          Catalog refreshed.{" "}
          <Link href="/audio" className="underline">
            Open Audio
          </Link>
        </p>
      )}
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <Card>
          <form key={`${settings.provider}|${settings.galleryPath}`} action={saveSettings} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Gallery folder</span>
              <input name="galleryPath" defaultValue={settings.galleryPath} className={inputClass} />
              <span className="text-xs text-muted">
                Path inside the devcontainer. The default <code>/gallery</code> is bind-mounted from <code>./gallery</code> on the host.
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Generation provider</span>
              <select name="provider" defaultValue={settings.provider} className={inputClass}>
                {PROVIDER_CHOICES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Higgsfield API key</span>
              <input name="higgsfieldApiKey" type="password" autoComplete="off" placeholder="KEY_ID:KEY_SECRET" className={inputClass} />
              <span className="text-xs text-muted">
                {keyStatus}. Create a credential in the{" "}
                <a href="https://console.higgsfield.ai" target="_blank" rel="noreferrer" className="underline">
                  Higgsfield Console
                </a>{" "}
                and paste it as <code>KEY_ID:KEY_SECRET</code>. Leave blank to keep the current key. Stored server-side in{" "}
                <code>data/settings.json</code>, which is gitignored.
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">ElevenLabs API key</span>
              <input name="elevenlabsApiKey" type="password" autoComplete="off" placeholder="xi-api-key" className={inputClass} />
              <span className="text-xs text-muted">
                {settings.elevenlabsApiKey ? `Key configured (…${settings.elevenlabsApiKey.slice(-4)})` : "No key configured"}. Create one under{" "}
                <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer" className="underline">
                  ElevenLabs → API keys
                </a>
                . Powers the Audio section (text to speech with your voices). Leave blank to keep the current key.
              </span>
            </label>
            <div>
              <button className={buttonClass}>Save settings</button>
            </div>
          </form>
        </Card>

        <Card>
          <span className={sectionLabelClass}>Model catalog</span>
          <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted">Source</dt>
            <dd>{catalog.source === "higgsfield" ? "Higgsfield API" : "Bundled fallback"}</dd>
            <dt className="text-muted">Fetched</dt>
            <dd>{new Date(catalog.fetchedAt).toLocaleString()}</dd>
            <dt className="text-muted">Models</dt>
            <dd>
              {counts.image} image · {counts.video} video · {counts.audio} audio
            </dd>
            {catalog.warnings && (
              <>
                <dt className="text-muted">Notes</dt>
                <dd className="text-xs text-amber-200">{Object.values(catalog.warnings).join(" · ")}</dd>
              </>
            )}
            {catalog.errors && (
              <>
                <dt className="text-muted">Last errors</dt>
                <dd className="text-xs text-red-300">{Object.values(catalog.errors).join(" · ")}</dd>
              </>
            )}
            {catalog.skipped && catalog.skipped.length > 0 && (
              <>
                <dt className="text-muted">Skipped</dt>
                <dd className="text-xs text-muted">{catalog.skipped.join(", ")}</dd>
              </>
            )}
          </dl>
          <p className="mt-3 text-xs text-muted">
            Refresh pulls Higgsfield models from <code>GET https://api.higgsfield.ai/models</code> (schemas from their public docs)
            and ElevenLabs text-to-speech models plus your voices from <code>api.elevenlabs.io</code>, for whichever keys are set.
          </p>
          <form action={refreshCatalog} className="mt-4">
            <button className={ghostButtonClass}>Refresh catalog</button>
          </form>
        </Card>
      </div>
    </main>
  );
}
