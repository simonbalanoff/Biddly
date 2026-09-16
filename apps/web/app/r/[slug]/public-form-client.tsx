"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/icons";
import { Button, Field, Input, Select, Spinner, Textarea } from "../../../components/ui";
import { publicApiRequest } from "../../../lib/api";
import type { PublicForm } from "../../../lib/types";

type Values = Record<string, unknown>;

export default function PublicFormClient({ slug }: { slug: string }) {
  const [form, setForm] = useState<PublicForm | null>(null);
  const [values, setValues] = useState<Values>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    publicApiRequest<PublicForm>(`/public/forms/${encodeURIComponent(slug)}`).then(setForm).catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load form")).finally(() => setLoading(false));
  }, [slug]);

  const core = useMemo(() => new Map(form?.coreFields.map((field) => [field.key, field]) ?? []), [form]);
  const primary = form?.branding.primaryColor || "#6d28d9";
  const secondary = form?.branding.secondaryColor || "#ffffff";
  const accent = form?.branding.accentColor || "#a78bfa";

  const set = (key: string, value: unknown) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true); setError("");
    try {
      const customFields = Object.fromEntries(form.customFields.map((field) => [field.key, values[field.key]]).filter(([, value]) => value !== undefined && value !== ""));
      const result = await publicApiRequest<{ id: string; confirmationMessage: string; photoUpload?: { uploadUrl: string; contentType: string } | null }>(`/public/forms/${encodeURIComponent(slug)}/submissions`, {
        method: "POST",
        body: JSON.stringify({
          firstName: String(values.firstName ?? ""),
          lastName: String(values.lastName ?? ""),
          email: core.has("email") && values.email ? String(values.email) : null,
          phone: core.has("phone") && values.phone ? String(values.phone) : null,
          customFields,
          photo: photo ? { contentType: photo.type, byteLength: photo.size } : null
        })
      });
      if (photo && result.photoUpload) {
        const upload = await fetch(result.photoUpload.uploadUrl, { method: "PUT", headers: { "Content-Type": result.photoUpload.contentType }, body: photo });
        if (!upload.ok) throw new Error("Your information was saved, but the photo could not be uploaded.");
      }
      setConfirmation(result.confirmationMessage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit form");
    } finally { setBusy(false); }
  };

  if (loading) return <div className="public-loading"><Spinner size={28} /><span>Loading recruitment form…</span></div>;
  if (!form) return <div className="public-error"><strong>Form unavailable</strong><span>{error || "This recruitment form could not be found."}</span></div>;

  const theme = { "--public-primary": primary, "--public-secondary": secondary, "--public-accent": accent } as React.CSSProperties;

  return <main className="public-page" style={theme}>
    <div className="public-accent-bar" />
    <div className="public-shell">
      <header className="public-branding">
        <div className="public-crest">{form.branding.crestUrl || form.branding.logoUrl ? <img src={form.branding.crestUrl || form.branding.logoUrl || ""} alt={`${form.organization.name} crest`} /> : <span>{(form.organization.shortName || form.organization.name).slice(0, 2).toUpperCase()}</span>}</div>
        <div><strong>{form.organization.name}</strong><span>{form.chapter.name} · {form.chapter.universityName}</span></div>
      </header>

      {confirmation ? <section className="public-confirmation"><span className="public-confirmation-icon"><Icon name="check" size={24} /></span><h1>Thanks for reaching out.</h1><p>{confirmation}</p><div className="public-confirmation-line" /></section> : !form.isOpen ? <section className="public-closed"><h1>Recruitment form closed</h1><p>This chapter is not currently accepting submissions through Biddly.</p></section> : <>
        <section className="public-intro"><span className="public-eyebrow">Recruitment interest form</span><h1>{form.title || `Connect with ${form.chapter.name}`}</h1><p>{form.introText || `Tell ${form.chapter.name} a little about yourself. Your information will go directly to the chapter’s recruitment team.`}</p></section>
        <form className="public-form" onSubmit={submit}>
          <section className="public-section"><div className="public-section-heading"><span>01</span><div><h2>About you</h2><p>Start with the basics so the chapter can identify and contact you.</p></div></div><div className="public-fields"><div className="form-grid form-grid-2"><Field label="First name"><Input value={String(values.firstName ?? "")} onChange={(event) => set("firstName", event.target.value)} required /></Field><Field label="Last name"><Input value={String(values.lastName ?? "")} onChange={(event) => set("lastName", event.target.value)} required /></Field></div>{core.get("email") ? <Field label="Email address"><Input type="email" value={String(values.email ?? "")} onChange={(event) => set("email", event.target.value)} required={core.get("email")?.required} /></Field> : null}{core.get("phone") ? <Field label="Phone number"><Input type="tel" value={String(values.phone ?? "")} onChange={(event) => set("phone", event.target.value)} required={core.get("phone")?.required} placeholder="(970) 555-0123" /></Field> : null}</div></section>

          {form.customFields.length ? <section className="public-section"><div className="public-section-heading"><span>02</span><div><h2>Tell us more</h2><p>A few chapter-specific questions to help the recruitment team get to know you.</p></div></div><div className="public-fields">{form.customFields.map((field) => <PublicField key={field.key} field={field} value={values[field.key]} onChange={(value) => set(field.key, value)} />)}</div></section> : null}

          {core.get("photo") ? <section className="public-section"><div className="public-section-heading"><span>{form.customFields.length ? "03" : "02"}</span><div><h2>Profile photo</h2><p>Add a clear photo so chapter members can put a face to your name.</p></div></div><label className={`public-photo-drop ${photo ? "public-photo-selected" : ""}`}><input type="file" accept="image/jpeg,image/png,image/webp" required={core.get("photo")?.required} onChange={(event) => { const next = event.target.files?.[0] ?? null; if (next && next.size > 2_000_000) { setError("Photo must be smaller than 2 MB."); event.currentTarget.value = ""; return; } setError(""); setPhoto(next); }} />{photo ? <><span className="photo-check"><Icon name="check" /></span><strong>{photo.name}</strong><small>{(photo.size / 1024 / 1024).toFixed(1)} MB · ready to upload</small></> : <><span className="photo-upload-icon"><Icon name="upload" /></span><strong>Choose a photo</strong><small>JPG, PNG, or WebP · maximum 2 MB</small></>}</label></section> : null}

          {error ? <div className="form-alert form-alert-error">{error}</div> : null}
          <div className="public-submit-row"><p>By submitting, you’re sharing this information directly with {form.chapter.name} for recruitment purposes.</p><Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit to chapter"}</Button></div>
        </form>
      </>}
      <footer className="public-footer"><span>Recruitment powered by</span><strong><span className="mini-b-mark"><i /><i /></span>Biddly</strong></footer>
    </div>
  </main>;
}

function PublicField({ field, value, onChange }: { field: PublicForm["customFields"][number]; value: unknown; onChange: (value: unknown) => void }) {
  const choices = field.options?.choices ?? [];
  if (field.type === "LONG_TEXT") return <Field label={field.label}><Textarea rows={5} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} required={field.required} /></Field>;
  if (field.type === "SELECT") return <Field label={field.label}><Select value={String(value ?? "")} onChange={onChange} required={field.required} placeholder="Select one" options={choices.map((choice) => ({ value: choice, label: choice }))} /></Field>;
  if (field.type === "MULTI_SELECT") return <Field label={field.label}><div className="public-choice-grid">{choices.map((choice) => { const selected = Array.isArray(value) && value.includes(choice); return <label key={choice} className={selected ? "choice-card choice-card-selected" : "choice-card"}><input type="checkbox" checked={selected} onChange={(event) => { const current = Array.isArray(value) ? value as string[] : []; onChange(event.target.checked ? [...current, choice] : current.filter((item) => item !== choice)); }} /><span>{choice}</span></label>; })}</div></Field>;
  if (field.type === "BOOLEAN") return <Field label={field.label}><div className="public-choice-grid public-choice-grid-2"><label className={value === true ? "choice-card choice-card-selected" : "choice-card"}><input type="radio" name={field.key} checked={value === true} onChange={() => onChange(true)} required={field.required} /><span>Yes</span></label><label className={value === false ? "choice-card choice-card-selected" : "choice-card"}><input type="radio" name={field.key} checked={value === false} onChange={() => onChange(false)} required={field.required} /><span>No</span></label></div></Field>;
  const type = field.type === "NUMBER" || field.type === "YEAR" ? "number" : field.type === "EMAIL" ? "email" : field.type === "PHONE" ? "tel" : field.type === "DATE" ? "date" : "text";
  return <Field label={field.label}><Input type={type} value={String(value ?? "")} onChange={(event) => onChange(type === "number" && event.target.value ? Number(event.target.value) : event.target.value)} required={field.required} /></Field>;
}
