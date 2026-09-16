"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "../../components/app-shell";
import { Icon } from "../../components/icons";
import { Badge, Button, EmptyState, Field, Input, Modal, Select, StatusDot, Toggle } from "../../components/ui";
import { apiRequest } from "../../lib/api";
import type { CandidateStatus, PublicFormConfig, RecruitmentCycle, RecruitmentCycleSummary } from "../../lib/types";
import { useAuth } from "../../providers/auth-provider";

export default function RecruitmentPage() {
  const { context, refreshContext } = useAuth();
  const [cycles, setCycles] = useState<Array<RecruitmentCycleSummary & { publicForm?: PublicFormConfig | null; _count?: { candidates: number } }>>([]);
  const [activeCycle, setActiveCycle] = useState<RecruitmentCycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [error, setError] = useState("");
  const cycleId = context?.chapter?.activeRecruitmentCycle?.id;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const list = await apiRequest<typeof cycles>("/recruitment-cycles");
      setCycles(list);
      if (context?.chapter?.activeRecruitmentCycle?.id) {
        setActiveCycle(await apiRequest<RecruitmentCycle>(`/recruitment-cycles/${context.chapter.activeRecruitmentCycle.id}`));
      } else {
        setActiveCycle(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load recruitment setup");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [cycleId]);

  const activate = async (id: string) => {
    await apiRequest(`/recruitment-cycles/${id}/activate`, { method: "POST" });
    await refreshContext();
    await load();
  };

  const archive = async (id: string) => {
    if (!window.confirm("Archive this recruitment cycle? The public form will close and members will no longer see its PNMs by default.")) return;
    await apiRequest(`/recruitment-cycles/${id}/archive`, { method: "POST" });
    await refreshContext();
    await load();
  };

  const unarchive = async (id: string) => {
    await apiRequest(`/recruitment-cycles/${id}/unarchive`, { method: "POST" });
    await refreshContext();
    await load();
  };

  return (
    <AppShell>
      <PageHeader title="Recruitment" description="Manage the active recruitment cycle and the pipeline your chapter uses to move PNMs through rush." actions={<Button icon="plus" onClick={() => setCycleOpen(true)}>New cycle</Button>} />
      {error ? <div className="form-alert form-alert-error page-alert">{error}</div> : null}

      {activeCycle ? <section className="recruitment-hero panel">
        <div className="recruitment-hero-main"><div className="recruitment-status"><span className="live-dot" /> Active recruitment</div><h2>{activeCycle.name}</h2><p>{activeCycle._count.candidates} PNMs · {activeCycle._count.evaluations} scores · {activeCycle._count.comments} discussion posts</p></div>
        <div className="recruitment-hero-actions"><Link href="/recruitment/form" className="button button-secondary button-md"><Icon name="form" size={17} /> Public form</Link><Button variant="ghost" onClick={() => void archive(activeCycle.id)}>Archive cycle</Button></div>
      </section> : !loading ? <section className="panel panel-spacious"><EmptyState icon="workflow" title="Start a recruitment cycle" copy="Create a cycle for the current semester. Once activated, members will automatically see it when they open Biddly." action={<Button icon="plus" onClick={() => setCycleOpen(true)}>Create first cycle</Button>} /></section> : null}

      {activeCycle ? <div className="recruitment-grid">
        <section className="panel">
          <div className="panel-header"><div><span className="section-kicker">Pipeline</span><h2>PNM statuses</h2><p>These stages define how PNMs move through your chapter’s recruitment process.</p></div><Button variant="secondary" size="sm" icon="plus" onClick={() => setStatusOpen(true)}>Add status</Button></div>
          <div className="config-list">{activeCycle.statuses.map((status) => <StatusRow key={status.id} status={status} cycleId={activeCycle.id} onChanged={load} />)}</div>
        </section>


      </div> : null}

      <section className="panel cycle-history">
        <div className="panel-header"><div><span className="section-kicker">History</span><h2>Recruitment cycles</h2></div></div>
        {cycles.length ? <div className="cycle-list">{cycles.map((cycle) => <div className="cycle-row" key={cycle.id}><div className="cycle-icon"><Icon name="calendar" /></div><div className="cycle-copy"><Link href={`/recruitment/cycles/${cycle.id}`}><strong>{cycle.name}</strong></Link><span>{cycle.startsAt ? new Date(cycle.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "No start date"}{cycle.endsAt ? ` – ${new Date(cycle.endsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : ""}</span></div><div className="cycle-count">{cycle._count?.candidates ?? 0} PNMs</div><div className="cycle-actions"><Link href={`/recruitment/cycles/${cycle.id}`} className="button button-secondary button-sm">View</Link>{cycle.status === "DRAFT" ? <Button size="sm" onClick={() => void activate(cycle.id)}>Activate</Button> : null}{cycle.status === "ACTIVE" ? <Button variant="ghost" size="sm" onClick={() => void archive(cycle.id)}>Archive</Button> : null}{cycle.status === "ARCHIVED" ? <Button variant="secondary" size="sm" onClick={() => void unarchive(cycle.id)}>Restore</Button> : null}</div></div>)}</div> : <div className="config-empty"><span>No recruitment cycles have been created.</span></div>}
      </section>

      <CreateCycleModal open={cycleOpen} onClose={() => setCycleOpen(false)} onCreated={async (id) => { setCycleOpen(false); await activate(id); }} />
      {activeCycle ? <CreateStatusModal open={statusOpen} onClose={() => setStatusOpen(false)} cycleId={activeCycle.id} onCreated={async () => { setStatusOpen(false); await load(); }} /> : null}
    </AppShell>
  );
}

function StatusRow({ status, cycleId, onChanged }: { status: CandidateStatus; cycleId: string; onChanged: () => Promise<void> }) {
  const remove = async () => {
    if (!window.confirm(`Remove the “${status.name}” status?`)) return;
    try {
      await apiRequest(`/recruitment-cycles/${cycleId}/statuses/${status.id}`, { method: "DELETE" });
      await onChanged();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Unable to remove status");
    }
  };
  return <div className="config-row"><div className="config-handle">{status.position + 1}</div><StatusDot color={status.color} /><div className="config-copy"><strong>{status.name}</strong><span>{status.isTerminal ? "Terminal stage" : "Active stage"}</span></div>{status.isTerminal ? <Badge>Final</Badge> : null}<button className="icon-button" onClick={() => void remove()} aria-label={`Remove ${status.name}`}><Icon name="trash" size={16} /></button></div>;
}

function CreateCycleModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => { setBusy(true); setError(""); try { const cycle = await apiRequest<{ id: string }>("/recruitment-cycles", { method: "POST", body: JSON.stringify({ name, startsAt: startsAt || null, endsAt: endsAt || null }) }); await onCreated(cycle.id); setName(""); setStartsAt(""); setEndsAt(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create cycle"); } finally { setBusy(false); } };
  return <Modal open={open} onClose={onClose} title="New recruitment cycle" subtitle="Create the workspace your chapter will use for this recruitment period." footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || !name.trim()} onClick={() => void submit()}>{busy ? "Creating…" : "Create & activate"}</Button></>}><Field label="Cycle name" hint="Examples: Fall 2026, Spring 2027"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Fall 2026" /></Field><div className="form-grid form-grid-2"><Field label="Start date"><Input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></Field><Field label="End date"><Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></Field></div>{error ? <div className="form-alert form-alert-error">{error}</div> : null}</Modal>;
}

function CreateStatusModal({ open, onClose, cycleId, onCreated }: { open: boolean; onClose: () => void; cycleId: string; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7c3aed");
  const [terminal, setTerminal] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { await apiRequest(`/recruitment-cycles/${cycleId}/statuses`, { method: "POST", body: JSON.stringify({ name, color, isTerminal: terminal }) }); setName(""); setTerminal(false); await onCreated(); } finally { setBusy(false); } };
  return <Modal open={open} onClose={onClose} title="Add pipeline status" subtitle="Add a new stage to the chapter’s recruitment workflow." footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void submit()} disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add status"}</Button></>}><Field label="Status name"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Second Dinner" /></Field><Field label="Status color"><div className="color-input-row"><input className="color-picker" type="color" value={color} onChange={(event) => setColor(event.target.value)} /><Input value={color} onChange={(event) => setColor(event.target.value)} /></div></Field><div className="toggle-setting"><div><strong>Final stage</strong><span>Mark this as a terminal outcome such as Accepted or Closed.</span></div><Toggle checked={terminal} onChange={setTerminal} /></div></Modal>;
}
