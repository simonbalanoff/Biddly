"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, PageHeader } from "../../components/app-shell";
import Link from "next/link";
import { Button, Field, Input, Modal, Toggle } from "../../components/ui";
import { apiRequest } from "../../lib/api";
import type { ChapterBranding, ChapterSettings } from "../../lib/types";
import { useAuth } from "../../providers/auth-provider";

export default function SettingsPage() {
  const { context, refreshContext, logout } = useAuth();
  const router = useRouter();
  const chapter = context?.chapter;
  const [name, setName] = useState("");
  const [branding, setBranding] = useState<ChapterBranding>({});
  const [settings, setSettings] = useState<ChapterSettings>({ commentsEnabled: true, repliesEnabled: true, reactionsEnabled: true, scoreMin: 1, scoreMax: 10, scoreStep: 1 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!chapter) return;
    setName(chapter.name);
    setBranding(chapter.branding ?? {});
    setSettings(chapter.settings ?? settings);
  }, [chapter?.id]);

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      await Promise.all([
        apiRequest("/chapter", { method: "PATCH", body: JSON.stringify({ name }) }),
        apiRequest("/chapter/branding", { method: "PATCH", body: JSON.stringify({ primaryColor: branding.primaryColor || null, secondaryColor: branding.secondaryColor || null, accentColor: branding.accentColor || null, logoUrl: branding.logoUrl || null, crestUrl: branding.crestUrl || null }) }),
        apiRequest("/chapter/settings", { method: "PATCH", body: JSON.stringify(settings) })
      ]);
      await refreshContext();
      setMessage("Settings saved.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Unable to save settings");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleteBusy(true);
    setMessage("");
    try {
      await apiRequest("/me/account", { method: "DELETE", body: JSON.stringify({ confirm: "DELETE" }) });
      await logout();
      router.replace("/login");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Unable to delete account");
      setDeleteBusy(false);
      setDeleteOpen(false);
    }
  };

  const primary = branding.primaryColor || chapter?.organization.primaryColor || "#6d28d9";
  const secondary = branding.secondaryColor || chapter?.organization.secondaryColor || "#ffffff";
  const accent = branding.accentColor || chapter?.organization.accentColor || "#a78bfa";

  return <AppShell>
    <PageHeader title="Settings" description="Manage chapter identity, recruitment feedback, and your account." actions={<Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</Button>} />
    {message ? <div className={`form-alert page-alert ${message.includes("saved") ? "form-alert-success" : "form-alert-error"}`}>{message}</div> : null}
    <div className="settings-grid">
      <div className="settings-main">
        <section className="panel"><div className="panel-header"><div><span className="section-kicker">Identity</span><h2>Chapter profile</h2></div></div><div className="form-grid"><Field label="Chapter display name"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><div className="read-only-row"><span>Organization</span><strong>{chapter?.organization.name}</strong></div><div className="read-only-row"><span>University</span><strong>{chapter?.university.name}</strong></div></div></section>
        <section className="panel"><div className="panel-header"><div><span className="section-kicker">Branding</span><h2>Chapter theme</h2><p>Your overrides take priority over organization defaults.</p></div></div><div className="color-settings"><ColorField label="Primary" value={primary} onChange={(value) => setBranding({ ...branding, primaryColor: value })} /><ColorField label="Secondary" value={secondary} onChange={(value) => setBranding({ ...branding, secondaryColor: value })} /><ColorField label="Accent" value={accent} onChange={(value) => setBranding({ ...branding, accentColor: value })} /></div><div className="form-grid form-grid-2"><Field label="Crest URL"><Input type="url" value={branding.crestUrl ?? ""} onChange={(event) => setBranding({ ...branding, crestUrl: event.target.value })} placeholder="https://…" /></Field><Field label="Logo URL"><Input type="url" value={branding.logoUrl ?? ""} onChange={(event) => setBranding({ ...branding, logoUrl: event.target.value })} placeholder="https://…" /></Field></div></section>
        <section className="panel"><div className="panel-header"><div><span className="section-kicker">Discussion</span><h2>Member feedback</h2></div></div><div className="setting-stack"><div className="toggle-setting"><div><strong>Comments</strong><span>Allow chapter members to leave written feedback on PNMs.</span></div><Toggle checked={settings.commentsEnabled} onChange={(commentsEnabled) => setSettings({ ...settings, commentsEnabled, repliesEnabled: commentsEnabled ? settings.repliesEnabled : false, reactionsEnabled: commentsEnabled ? settings.reactionsEnabled : false })} /></div><div className="toggle-setting"><div><strong>Replies</strong><span>Allow one level of conversation under comments.</span></div><Toggle disabled={!settings.commentsEnabled} checked={settings.repliesEnabled} onChange={(repliesEnabled) => setSettings({ ...settings, repliesEnabled })} /></div><div className="toggle-setting"><div><strong>Reactions</strong><span>Allow lightweight emoji reactions on chapter feedback.</span></div><Toggle disabled={!settings.commentsEnabled} checked={settings.reactionsEnabled} onChange={(reactionsEnabled) => setSettings({ ...settings, reactionsEnabled })} /></div></div></section>
        <section className="panel"><div className="panel-header"><div><span className="section-kicker">Scoring</span><h2>PNM score scale</h2><p>Scoring is always enabled. Chapters can choose the scale members use.</p></div></div><div className="form-grid form-grid-3"><Field label="Minimum"><Input type="number" value={settings.scoreMin} onChange={(event) => setSettings({ ...settings, scoreMin: Number(event.target.value) })} /></Field><Field label="Maximum"><Input type="number" value={settings.scoreMax} onChange={(event) => setSettings({ ...settings, scoreMax: Number(event.target.value) })} /></Field><Field label="Step"><Input type="number" step="0.1" value={settings.scoreStep} onChange={(event) => setSettings({ ...settings, scoreStep: Number(event.target.value) })} /></Field></div></section>
        <section className="panel"><div className="panel-header"><div><span className="section-kicker">Account</span><h2>Delete your Biddly account</h2><p>Your account identity is removed while audit history remains intact.</p></div></div><div className="setting-stack"><div className="toggle-setting"><div><strong>Permanent account deletion</strong><span>A sole chapter administrator must transfer admin access first.</span></div><Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete account</Button></div></div></section>
      </div>
      <aside className="settings-side">
        <section className="panel theme-preview-card"><span className="section-kicker">Preview</span><div className="theme-preview" style={{ "--theme-primary": primary, "--theme-secondary": secondary, "--theme-accent": accent } as React.CSSProperties}><div className="theme-preview-header"><div className="theme-preview-crest">{branding.crestUrl || chapter?.organization.crestUrl ? <img src={branding.crestUrl || chapter?.organization.crestUrl || ""} alt="" /> : (chapter?.organization.shortName || "B").slice(0, 2)}</div><div><strong>{name || chapter?.name}</strong><span>{chapter?.university.shortName || chapter?.university.name}</span></div></div><div className="theme-preview-card-body"><span className="theme-chip">Priority</span><strong>James Walker</strong><small>Mechanical Engineering · Junior</small><button type="button">View PNM</button></div></div></section>
        <section className="panel compact-panel"><div className="panel-header"><div><span className="section-kicker">Plan</span><h2>Subscription</h2><p>Billing is managed separately through Stripe.</p></div></div><div className="subscription-card"><strong>Stripe billing</strong><span>Manage your plan, payment method, renewal, and invoices from the Billing page.</span><Link href="/billing" className="button button-secondary button-sm">Open billing</Link></div></section>
      </aside>
    </div>

    <Modal open={deleteOpen} onClose={() => { if (!deleteBusy) { setDeleteOpen(false); setDeleteConfirm(""); } }} title="Delete your account" subtitle="This permanently removes your sign-in access and account identity." footer={<><Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>Cancel</Button><Button variant="danger" onClick={() => void deleteAccount()} disabled={deleteBusy || deleteConfirm !== "DELETE"}>{deleteBusy ? "Deleting…" : "Delete account"}</Button></>}>
      <div className="form-alert form-alert-error">This cannot be undone. Recruitment records and audit history remain attached to an anonymized account record.</div>
      <Field label="Type DELETE to confirm"><Input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} autoComplete="off" /></Field>
    </Modal>
  </AppShell>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><div className="color-input-row"><input className="color-picker" type="color" value={value} onChange={(event) => onChange(event.target.value)} /><Input value={value} onChange={(event) => onChange(event.target.value)} /></div></Field>;
}
