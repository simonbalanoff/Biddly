"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Breadcrumbs, PageHeader } from "../../../components/app-shell";
import { Icon } from "../../../components/icons";
import { Badge, Button, ConfirmDialog, CopyButton, Field, Input, Modal, Select, Spinner, Textarea, Toggle } from "../../../components/ui";
import { apiRequest } from "../../../lib/api";
import type { CandidateField, PublicFormConfig, RecruitmentCycle } from "../../../lib/types";
import { useAuth } from "../../../providers/auth-provider";

const FIELD_TYPE_OPTIONS: Array<{ value: CandidateField["type"]; label: string }> = [
  { value: "SHORT_TEXT", label: "Short text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "YEAR", label: "Year" },
  { value: "SELECT", label: "Dropdown" },
  { value: "MULTI_SELECT", label: "Multiple choice" },
  { value: "BOOLEAN", label: "Yes / No" },
  { value: "DATE", label: "Date" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" }
];

export default function FormBuilderPage() {
  const { context } = useAuth();
  const cycleId = context?.chapter?.activeRecruitmentCycle?.id;
  const [cycle, setCycle] = useState<RecruitmentCycle | null>(null);
  const [form, setForm] = useState<PublicFormConfig | null>(null);
  const [draft, setDraft] = useState<PublicFormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [fieldOpen, setFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<CandidateField | null>(null);
  const [fieldToDelete, setFieldToDelete] = useState<CandidateField | null>(null);
  const [deletingField, setDeletingField] = useState(false);

  const loadCycle = async () => {
    if (!cycleId) return;
    setCycle(await apiRequest<RecruitmentCycle>(`/recruitment-cycles/${cycleId}`));
  };

  useEffect(() => {
    if (!cycleId) {
      setLoading(false);
      return;
    }
    Promise.all([
      apiRequest<RecruitmentCycle>(`/recruitment-cycles/${cycleId}`),
      apiRequest<PublicFormConfig>(`/recruitment-cycles/${cycleId}/form`)
    ]).then(([cycleData, formData]) => {
      setCycle(cycleData);
      setForm(formData);
      setDraft(formData);
    }).finally(() => setLoading(false));
  }, [cycleId]);

  const publicUrl = useMemo(() => draft?.slug && typeof window !== "undefined" ? `${window.location.origin}/r/${draft.slug}` : "", [draft?.slug]);
  const changed = JSON.stringify(form) !== JSON.stringify(draft);

  const updateDraft = (updates: Partial<PublicFormConfig>) => {
    setDraft((current) => current ? { ...current, ...updates } : current);
    setSaveState("idle");
    setMessage("");
  };

  const save = async () => {
    if (!cycleId || !draft) return;
    setBusy(true);
    setSaveState("idle");
    setMessage("");
    try {
      const saved = await apiRequest<PublicFormConfig>(`/recruitment-cycles/${cycleId}/form`, {
        method: "PATCH",
        body: JSON.stringify({
          isOpen: draft.isOpen,
          title: draft.title || null,
          introText: draft.introText || null,
          confirmationMessage: draft.confirmationMessage || null,
          emailMode: draft.emailMode,
          phoneMode: draft.phoneMode,
          photoMode: draft.photoMode
        })
      });
      const next = { ...draft, ...saved };
      setForm(next);
      setDraft(next);
      setSaveState("saved");
    } catch (caught) {
      setSaveState("error");
      setMessage(caught instanceof Error ? caught.message : "Unable to save form");
    } finally {
      setBusy(false);
    }
  };

  const patchField = async (fieldId: string, body: Record<string, unknown>) => {
    if (!cycleId) return;
    try {
      await apiRequest(`/recruitment-cycles/${cycleId}/fields/${fieldId}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      await loadCycle();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Unable to update field");
    }
  };

  const removeField = async (field: CandidateField) => {
    if (!cycleId) return;
    setDeletingField(true);
    setMessage("");
    try {
      await apiRequest(`/recruitment-cycles/${cycleId}/fields/${field.id}`, { method: "DELETE" });
      await loadCycle();
      setFieldToDelete(null);
    } catch (caught) {
      setFieldToDelete(null);
      setMessage(caught instanceof Error ? caught.message : "Unable to delete field");
    } finally {
      setDeletingField(false);
    }
  };

  if (loading) return <AppShell><div className="detail-loading"><Spinner /><span>Loading form builder…</span></div></AppShell>;
  if (!cycleId || !draft) return <AppShell><Breadcrumbs items={[{ label: "Recruitment", href: "/recruitment" }, { label: "Public form" }]} /><PageHeader title="Recruitment form" description="Activate a recruitment cycle before configuring a public form." /><div className="panel panel-spacious"><Link href="/recruitment" className="button button-primary button-md">Back to recruitment setup</Link></div></AppShell>;

  return <AppShell>
    <Breadcrumbs items={[{ label: "Recruitment", href: "/recruitment" }, { label: cycle?.name ?? "Active cycle", href: cycleId ? `/recruitment/cycles/${cycleId}` : "/recruitment" }, { label: "Public form" }]} />
    <PageHeader eyebrow={cycle?.name} title="Recruitment form" description="Build the form PNMs see, choose exactly what you collect, and preview the chapter-branded experience." actions={<><Button variant="secondary" icon="external" onClick={() => window.open(`/r/${draft.slug}`, "_blank")}>Preview</Button><Button className={!changed && saveState === "saved" ? "button-saved" : ""} icon={!changed && saveState === "saved" ? "check" : undefined} disabled={!changed || busy} onClick={() => void save()}>{busy ? "Saving…" : changed ? "Save changes" : saveState === "saved" ? "Saved" : "No changes"}</Button></>} />
    {message ? <div className={`form-alert ${saveState === "error" || message !== "Saved" ? "form-alert-error" : "form-alert-success"} page-alert`}>{message}<button type="button" onClick={() => setMessage("")}>Dismiss</button></div> : null}
    <div className="form-builder-grid">
      <div className="form-builder-settings">
        <section className="panel">
          <div className="panel-header"><div><span className="section-kicker">Availability</span><h2>Form access</h2></div><Badge tone={draft.isOpen ? "success" : "neutral"}>{draft.isOpen ? "Open" : "Closed"}</Badge></div>
          <div className="toggle-setting"><div><strong>Accept submissions</strong><span>When enabled, anyone with the form link can submit their information.</span></div><Toggle checked={draft.isOpen} onChange={(isOpen) => updateDraft({ isOpen })} /></div>
          <div className="share-box"><div><span>Share link</span><strong>{publicUrl || `…/r/${draft.slug}`}</strong></div><CopyButton value={publicUrl} label="Copy" /></div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><span className="section-kicker">Content</span><h2>Form introduction</h2><p>Set the tone before a PNM begins filling anything out.</p></div></div>
          <div className="form-grid"><Field label="Form title"><Input value={draft.title ?? ""} onChange={(event) => updateDraft({ title: event.target.value })} placeholder={`${cycle?.name} Recruitment Form`} /></Field><Field label="Intro text"><Textarea rows={5} value={draft.introText ?? ""} onChange={(event) => updateDraft({ introText: event.target.value })} placeholder="Tell PNMs what this form is for and what happens next." /></Field><Field label="Confirmation message"><Textarea rows={3} value={draft.confirmationMessage ?? ""} onChange={(event) => updateDraft({ confirmationMessage: event.target.value })} placeholder="Thanks — someone from our recruitment team will be in touch soon." /></Field></div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><span className="section-kicker">Core fields</span><h2>Contact information</h2><p>First and last name are always required. Decide how the rest should appear.</p></div></div>
          <div className="form-field-settings"><ModeRow label="Email address" value={draft.emailMode} onChange={(emailMode) => updateDraft({ emailMode })} /><ModeRow label="Phone number" value={draft.phoneMode} onChange={(phoneMode) => updateDraft({ phoneMode })} /><ModeRow label="Profile photo" value={draft.photoMode} onChange={(photoMode) => updateDraft({ photoMode })} /></div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><span className="section-kicker">Custom questions</span><h2>Form fields</h2><p>Add chapter-specific questions and control exactly what PNMs see on this form.</p></div><Button variant="secondary" size="sm" icon="plus" onClick={() => { setEditingField(null); setFieldOpen(true); }}>Add field</Button></div>
          {cycle?.fieldDefinitions.length ? <div className="form-custom-fields">{cycle.fieldDefinitions.map((field) => <FormFieldRow key={field.id} field={field} onPatch={(body) => void patchField(field.id, body)} onEdit={() => { setEditingField(field); setFieldOpen(true); }} onDelete={() => setFieldToDelete(field)} />)}</div> : <div className="config-empty"><span>No custom questions yet.</span><button type="button" onClick={() => { setEditingField(null); setFieldOpen(true); }}>Add your first field</button></div>}
        </section>
      </div>

      <div className="form-preview-sticky"><div className="preview-label"><span>Live preview</span><small>Uses your chapter theme</small></div><FormPreview context={context} draft={draft} cycle={cycle} /></div>
    </div>

    <FieldEditorModal open={fieldOpen} onClose={() => { setFieldOpen(false); setEditingField(null); }} cycleId={cycleId} field={editingField} onSaved={async () => { setFieldOpen(false); setEditingField(null); await loadCycle(); }} />
    <ConfirmDialog
      open={Boolean(fieldToDelete)}
      onClose={() => setFieldToDelete(null)}
      onConfirm={() => fieldToDelete ? removeField(fieldToDelete) : undefined}
      title={fieldToDelete ? `Delete “${fieldToDelete.label}”?` : "Delete field?"}
      description="This removes the field from the recruitment form and deletes the values previously collected for it. This action cannot be undone."
      confirmLabel="Delete field"
      busy={deletingField}
    />
  </AppShell>;
}

function ModeRow({ label, value, onChange }: { label: string; value: "HIDDEN" | "OPTIONAL" | "REQUIRED"; onChange: (value: "HIDDEN" | "OPTIONAL" | "REQUIRED") => void }) {
  return <div className="mode-row"><span>{label}</span><Select compact value={value} onChange={(next) => onChange(next as typeof value)} options={[{ value: "HIDDEN", label: "Hidden" }, { value: "OPTIONAL", label: "Optional" }, { value: "REQUIRED", label: "Required" }]} /></div>;
}

function FormFieldRow({ field, onPatch, onEdit, onDelete }: { field: CandidateField; onPatch: (body: Record<string, unknown>) => void; onEdit: () => void; onDelete: () => void }) {
  return <div className={`form-custom-field ${field.visibleOnPublicForm ? "form-custom-field-visible" : ""}`}>
    <div className="form-custom-field-order">{field.position + 1}</div>
    <div className="form-custom-field-copy"><div><strong>{field.label}</strong>{field.visibleOnPublicForm ? <Badge tone="accent">On form</Badge> : <Badge>Hidden</Badge>}</div><span>{FIELD_TYPE_OPTIONS.find((option) => option.value === field.type)?.label ?? field.type}</span></div>
    <div className="form-custom-field-controls"><label><Toggle checked={field.visibleOnPublicForm} onChange={(checked) => onPatch({ visibleOnPublicForm: checked })} /><span>Show</span></label><label><Toggle checked={field.required} onChange={(checked) => onPatch({ required: checked })} /><span>Required</span></label></div>
    <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
    <button type="button" className="icon-button" onClick={onDelete} aria-label={`Delete ${field.label}`}><Icon name="trash" size={16} /></button>
  </div>;
}

function FieldEditorModal({ open, onClose, cycleId, field, onSaved }: { open: boolean; onClose: () => void; cycleId: string; field: CandidateField | null; onSaved: () => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CandidateField["type"]>("SHORT_TEXT");
  const [required, setRequired] = useState(false);
  const [visible, setVisible] = useState(true);
  const [options, setOptions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel(field?.label ?? "");
    setType(field?.type ?? "SHORT_TEXT");
    setRequired(field?.required ?? false);
    setVisible(field?.visibleOnPublicForm ?? true);
    setOptions(field?.options?.choices?.join("\n") ?? "");
    setError("");
  }, [field, open]);

  const selectType = type === "SELECT" || type === "MULTI_SELECT";
  const key = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "field_").slice(0, 50);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const body = {
        label,
        type,
        required,
        visibleOnPublicForm: visible,
        options: selectType ? { choices: options.split("\n").map((item) => item.trim()).filter(Boolean) } : null,
        validation: null
      };
      if (field) {
        await apiRequest(`/recruitment-cycles/${cycleId}/fields/${field.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiRequest(`/recruitment-cycles/${cycleId}/fields`, { method: "POST", body: JSON.stringify({ key, ...body }) });
      }
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Unable to ${field ? "update" : "add"} field`);
    } finally {
      setBusy(false);
    }
  };

  return <Modal open={open} onClose={onClose} title={field ? "Edit form field" : "Add form field"} subtitle={field ? "Update how this question appears on the PNM form." : "Add a chapter-specific question to the PNM form."} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void submit()} disabled={busy || !label.trim() || (selectType && !options.trim())}>{busy ? "Saving…" : field ? "Save field" : "Add field"}</Button></>}>
    <div className="form-grid form-grid-2"><Field label="Field label"><Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Major" /></Field><Field label="Field type"><Select value={type} onChange={(next) => setType(next as CandidateField["type"])} options={FIELD_TYPE_OPTIONS} /></Field></div>
    {selectType ? <Field label="Choices" hint="Put one option on each line."><Textarea rows={5} value={options} onChange={(event) => setOptions(event.target.value)} /></Field> : null}
    <div className="setting-stack"><div className="toggle-setting"><div><strong>Show on public form</strong><span>PNMs can see and answer this question.</span></div><Toggle checked={visible} onChange={setVisible} /></div><div className="toggle-setting"><div><strong>Required field</strong><span>If this field is shown on the public form, PNMs must answer it before submitting.</span></div><Toggle checked={required} onChange={setRequired} /></div></div>
    {error ? <div className="form-alert form-alert-error">{error}</div> : null}
  </Modal>;
}

function FormPreview({ context, draft, cycle }: { context: ReturnType<typeof useAuth>["context"]; draft: PublicFormConfig; cycle: RecruitmentCycle | null }) {
  const primary = context?.chapter?.branding?.primaryColor || context?.chapter?.organization.primaryColor || "#2563eb";
  const secondary = context?.chapter?.branding?.secondaryColor || context?.chapter?.organization.secondaryColor || "#ffffff";
  const accent = context?.chapter?.branding?.accentColor || context?.chapter?.organization.accentColor || primary;
  const crest = context?.chapter?.branding?.crestUrl || context?.chapter?.organization.crestUrl;
  const visibleFields = cycle?.fieldDefinitions.filter((field) => field.visibleOnPublicForm) ?? [];
  const previewFields = visibleFields.slice(0, 5);
  const remaining = Math.max(0, visibleFields.length - previewFields.length);
  const theme = { "--preview-primary": primary, "--preview-secondary": secondary, "--preview-accent": accent } as React.CSSProperties;

  return <div className="form-preview" style={theme}><div className="preview-topbar"><span /></div><div className="preview-body"><div className="preview-brand">{crest ? <img src={crest} alt="" /> : <span>{(context?.chapter?.organization.shortName || "B").slice(0, 2)}</span>}<div><strong>{context?.chapter?.organization.name}</strong><small>{context?.chapter?.university.name}</small></div></div><div className="preview-title-accent" /><h3>{draft.title || `${cycle?.name ?? "Recruitment"} Form`}</h3><p>{draft.introText || "Share a short introduction to your chapter and let PNMs know what to expect after submitting."}</p><div className="preview-fields"><PreviewInput label="First Name" required /><PreviewInput label="Last Name" required />{draft.emailMode !== "HIDDEN" ? <PreviewInput label="Email" required={draft.emailMode === "REQUIRED"} /> : null}{draft.phoneMode !== "HIDDEN" ? <PreviewInput label="Phone" required={draft.phoneMode === "REQUIRED"} /> : null}{previewFields.map((field) => <PreviewInput key={field.id} label={field.label} required={field.required} multiline={field.type === "LONG_TEXT"} />)}{remaining ? <div className="preview-more-fields">+ {remaining} more {remaining === 1 ? "question" : "questions"}</div> : null}{draft.photoMode !== "HIDDEN" ? <div className="preview-upload"><Icon name="upload" /><span>Upload photo{draft.photoMode === "REQUIRED" ? " *" : ""}</span></div> : null}</div><button type="button" className="preview-submit">Submit information</button></div></div>;
}

function PreviewInput({ label, required, multiline = false }: { label: string; required?: boolean; multiline?: boolean }) {
  return <label className={`preview-input ${multiline ? "preview-input-multiline" : ""}`}><span>{label}{required ? <b> *</b> : ""}</span><i /></label>;
}
