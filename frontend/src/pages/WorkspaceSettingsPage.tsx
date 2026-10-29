import { useEffect, useState } from "react"

type Settings = { template: string; categories: string[]; teams: string[]; routes: { category: string; team: string }[]; instructions: string; imageScreening: boolean; escalation: { alwaysHuman: boolean; minConfidence: number; priorities: string[] } }
type Integration = { webhook_url: string; keys: { _id: string; name: string; keyPrefix: string; revokedAt?: string }[]; deliveries: { _id: string; eventId: string; status: string; attempts: number; lastStatus?: number }[] }
async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/workspace/${path}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? "Workspace request failed")
  return value as T
}
export function WorkspaceSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [templates, setTemplates] = useState<Record<string, Settings>>({})
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [categories, setCategories] = useState("")
  const [teams, setTeams] = useState("")
  const [url, setUrl] = useState("")
  const [keyName, setKeyName] = useState("")
  const [secret, setSecret] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  function selectSettings(value: Settings) { setSettings(value); setCategories(value.categories.join("\n")); setTeams(value.teams.join("\n")) }
  async function refresh() { const value = await api<Integration>("integration"); setIntegration(value); setUrl(value.webhook_url) }
  useEffect(() => {
    Promise.all([api<{ settings: Settings }>("settings"), api<Record<string, Settings>>("templates"), api<Integration>("integration")]).then(([s, t, i]) => { selectSettings(s.settings); setTemplates(t); setIntegration(i); setUrl(i.webhook_url) }).catch(err => setError(err.message))
  }, [])
  async function run(task: () => Promise<void>) { setBusy(true); setError(""); setMessage(""); try { await task() } catch (err) { setError(err instanceof Error ? err.message : "Request failed") } finally { setBusy(false) } }
  if (!settings) return <section className="panel"><h1>Workspace settings</h1><p>{error || "Loading…"}</p></section>
  const lines = (value: string) => value.split("\n").map(item => item.trim()).filter(Boolean)
  const categoryList = lines(categories), teamList = lines(teams)
  return <div className="stack">
    <div><div className="eyebrow">CONFIGURATION & INTEGRATIONS</div><h1>Your workspace, your workflow</h1><p>Choose a starting template, then adapt triage and routing to your business.</p></div>
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <form className="panel stack" onSubmit={e => { e.preventDefault(); void run(async () => {
      const updated = { ...settings, categories: categoryList, teams: teamList, routes: settings.routes.filter(route => categoryList.includes(route.category) && teamList.includes(route.team)) }
      const result = await api<{ settings: Settings }>("settings", "PUT", updated); selectSettings(result.settings); setMessage("Workspace settings saved. New analysis uses these rules; existing assignments are preserved.")
    }) }}>
      <h2>Triage rules</h2>
      <label className="field"><span>Starting template (replaces unsaved settings)</span><select value={settings.template} onChange={e => e.target.value === "custom" ? setSettings({ ...settings, template: "custom" }) : selectSettings(structuredClone(templates[e.target.value]!))}>
        {Object.keys(templates).map(name => <option key={name} value={name}>{name.replaceAll("_", " ")}</option>)}<option value="custom">custom</option>
      </select></label>
      <label className="field"><span>Categories — one per line; include Other</span><textarea rows={7} value={categories} onChange={e => { setCategories(e.target.value); setSettings({ ...settings, template: "custom" }) }} /></label>
      <label className="field"><span>Support teams — one per line; first team is the default</span><textarea rows={5} value={teams} onChange={e => { setTeams(e.target.value); setSettings({ ...settings, template: "custom" }) }} /></label>
      <h3>Category routing</h3>{[...new Set(categoryList)].map(category => <label className="field" key={category}><span>{category}</span><select value={settings.routes.find(route => route.category === category)?.team ?? ""} onChange={e => setSettings({ ...settings, routes: [...settings.routes.filter(route => route.category !== category), ...(e.target.value ? [{ category, team: e.target.value }] : [])] })}><option value="">Default team</option>{[...new Set(teamList)].map(team => <option key={team}>{team}</option>)}</select></label>)}
      <label className="field"><span>Resolution instructions</span><textarea rows={5} maxLength={4000} value={settings.instructions} onChange={e => setSettings({ ...settings, instructions: e.target.value })} /></label>
      <label><input type="checkbox" checked={settings.imageScreening} onChange={e => setSettings({ ...settings, imageScreening: e.target.checked })} /> Screen attached images with Sightengine</label>
      <label><input type="checkbox" checked={settings.escalation.alwaysHuman} onChange={e => setSettings({ ...settings, escalation: { ...settings.escalation, alwaysHuman: e.target.checked } })} /> Always require human review</label>
      <label className="field"><span>Minimum confidence before requester confirmation</span><input type="number" min="0" max="1" step="0.05" value={settings.escalation.minConfidence} onChange={e => setSettings({ ...settings, escalation: { ...settings.escalation, minConfidence: Number(e.target.value) } })} /></label>
      <div><span>Priorities requiring human review</span><div className="row">{["Low", "Medium", "High", "Critical"].map(priority => <label key={priority}><input type="checkbox" checked={settings.escalation.priorities.includes(priority)} onChange={e => setSettings({ ...settings, escalation: { ...settings.escalation, priorities: e.target.checked ? [...settings.escalation.priorities, priority] : settings.escalation.priorities.filter(item => item !== priority) } })} /> {priority}</label>)}</div></div>
      <button className="button-primary" disabled={busy}>Save workspace settings</button>
    </form>
    <section className="panel stack"><h2>Integration API keys</h2><p>Keys grant workspace ticket access. Give them only to your company backend.</p>
      <label className="field"><span>Key name</span><input maxLength={100} value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Food delivery demo" /></label>
      <button disabled={busy || !keyName.trim()} onClick={() => void run(async () => { const result = await api<{ key: string }>("keys", "POST", { name: keyName }); setSecret(`API key (copy now): ${result.key}`); setKeyName(""); await refresh() })}>Create API key</button>
      {integration?.keys.map(key => <div className="row row-space" key={key._id}><span>{key.name} · {key.keyPrefix}… {key.revokedAt && "(revoked)"}</span>{!key.revokedAt && <button disabled={busy} onClick={() => void run(async () => { await api(`keys/${key._id}`, "DELETE"); await refresh() })}>Revoke</button>}</div>)}
    </section>
    <section className="panel stack"><h2>Signed webhooks</h2><p>Receive analysis.completed and ticket.updated events. Saving generates a new signing secret and cancels deliveries using the previous configuration. Leave the URL blank to disable.</p>
      <label className="field"><span>Public HTTPS receiver URL</span><input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://support.example.com/ticketmind/events" /></label>
      <button disabled={busy} onClick={() => void run(async () => { const result = await api<{ secret: string }>("webhook", "PUT", { url }); setSecret(result.secret ? `Webhook signing secret (copy now): ${result.secret}` : ""); await refresh(); setMessage(url ? "Webhook saved. Configure your receiver with the new secret." : "Webhook disabled.") })}>Save webhook / rotate secret</button>
      <h3>Recent deliveries</h3><button disabled={busy} onClick={() => void run(refresh)}>Refresh delivery status</button>
      {!integration?.deliveries.length && <p>No deliveries yet. Configure a receiver and process a ticket.</p>}
      {integration?.deliveries.map(delivery => <div key={delivery._id} className="stack"><code style={{ overflowWrap: "anywhere" }}>{delivery.eventId}</code><span>{delivery.status} · {delivery.attempts} attempts · HTTP {delivery.lastStatus || "—"}</span>{delivery.status === "failed" && <button disabled={busy} onClick={() => void run(async () => { await api(`deliveries/${delivery._id}/retry`, "POST"); await refresh() })}>Retry delivery</button>}</div>)}
    </section>
    {secret && <section className="panel"><h2>Copy your new credential</h2><p>This value is shown only now. Store it securely on your backend.</p><code style={{ overflowWrap: "anywhere" }}>{secret}</code><p><button onClick={() => setSecret("")}>Hide credential</button></p></section>}
  </div>
}
