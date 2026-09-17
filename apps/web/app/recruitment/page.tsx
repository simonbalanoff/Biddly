"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "../../components/app-shell";
import { Icon } from "../../components/icons";
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, Select, StatusDot, Toggle } from "../../components/ui";
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
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [activateTarget, setActivateTarget] = useState<{ id: string; name: string } | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [activateBusy, setActivateBusy] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [draggedStatusId, setDraggedStatusId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const cycleId = context?.chapter?.activeRecruitmentCycle?.id;
  const readOnly = context?.subscriptionAccess?.mode === "READ_ONLY";

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
    setActivateBusy(true);
    setError("");
    try {
      await apiRequest(`/recruitment-cycles/${id}/activate`, { method: "POST" });
      await refreshContext();
      await load();
      setActivateTarget(null);
    } catch (caught) {
      setActivateTarget(null);
      setError(caught instanceof Error ? caught.message : "Unable to activate recruitment cycle");
    } finally {
      setActivateBusy(false);
    }
  };

  const archive = async (id: string) => {
    setArchiveBusy(true);
    setError("");
    try {
      await apiRequest(`/recruitment-cycles/${id}/archive`, { method: "POST" });
      await refreshContext();
      await load();
      setArchiveTarget(null);
    } catch (caught) {
      setArchiveTarget(null);
      setError(caught instanceof Error ? caught.message : "Unable to archive recruitment cycle");
    } finally {
      setArchiveBusy(false);
    }
  };

  const unarchive = async (id: string) => {
    await apiRequest(`/recruitment-cycles/${id}/unarchive`, { method: "POST" });
    await refreshContext();
    await load();
  };

  const saveStatusOrder = async (statusIds: string[]) => {
    if (!activeCycle || reorderBusy) return;
    const previous = activeCycle.statuses;
    const byId = new Map(previous.map((status) => [status.id, status]));
    const next = statusIds.map((id, index) => ({ ...byId.get(id)!, position: index }));
    setActiveCycle({ ...activeCycle, statuses: next });
    setReorderBusy(true);
    setError("");
    try {
      await apiRequest(`/recruitment-cycles/${activeCycle.id}/statuses/order`, { method: "PUT", body: JSON.stringify({ statusIds }) });
    } catch (caught) {
      setActiveCycle({ ...activeCycle, statuses: previous });
      setError(caught instanceof Error ? caught.message : "Unable to reorder statuses");
    } finally {
      setReorderBusy(false);
    }
  };

  const moveStatus = (statusId: string, direction: -1 | 1) => {
    if (!activeCycle) return;
    const ids = activeCycle.statuses.map((status) => status.id);
    const index = ids.indexOf(statusId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    void saveStatusOrder(ids);
  };

  const dropStatus = (targetStatusId: string) => {
    if (!activeCycle || !draggedStatusId || draggedStatusId === targetStatusId) {
      setDraggedStatusId(null);
      return;
    }
    const ids = activeCycle.statuses.map((status) => status.id);
    const sourceIndex = ids.indexOf(draggedStatusId);
    if (sourceIndex < 0) {
      setDraggedStatusId(null);
      return;
    }
    ids.splice(sourceIndex, 1);
    const targetIndex = ids.indexOf(targetStatusId);
    ids.splice(targetIndex < 0 ? ids.length : targetIndex, 0, draggedStatusId);
    setDraggedStatusId(null);
    void saveStatusOrder(ids);
  };

  return (
    <AppShell>
      <PageHeader title="Recruitment" description={readOnly ? "Review the chapter’s recruitment setup and historical cycles. Changes are disabled until billing is restored." : "Manage the active recruitment cycle and the pipeline your chapter uses to move PNMs through rush."} actions={!readOnly ? <Button icon="plus" onClick={() => setCycleOpen(true)}>New cycle</Button> : undefined} />
      {error ? <div className="form-alert form-alert-error page-alert">{error}</div> : null}

      {activeCycle ? <section className="recruitment-hero panel">
        <div className="recruitment-hero-main"><div className="recruitment-status"><span className="live-dot" /> Active recruitment</div><h2>{activeCycle.name}</h2><p>{activeCycle._count.candidates} PNMs · {activeCycle._count.evaluations} scores · {activeCycle._count.comments} discussion posts</p></div>
        <div className="recruitment-hero-actions">{!readOnly ? <Link href="/recruitment/form" className="button button-secondary button-md"><Icon name="form" size={17} /> Public form</Link> : null}{!readOnly ? <Button variant="ghost" onClick={() => setArchiveTarget({ id: activeCycle.id, name: activeCycle.name })}>Archive cycle</Button> : null}</div>
      </section> : !loading ? <section className="panel panel-spacious"><EmptyState icon="workflow" title={readOnly ? "No active recruitment cycle" : "Start a recruitment cycle"} copy={readOnly ? "There is no active recruitment cycle to review. Restore billing before creating a new cycle." : "Create a cycle for the current semester. Once activated, members will automatically see it when they open Biddly."} action={!readOnly ? <Button icon="plus" onClick={() => setCycleOpen(true)}>Create first cycle</Button> : undefined} /></section> : null}

      {activeCycle ? <div className="recruitment-grid">
        <section className="panel">
          <div className="panel-header"><div><span className="section-kicker">Pipeline</span><h2>PNM statuses</h2><p>{readOnly ? "These stages define how PNMs move through your chapter’s recruitment process." : "Drag statuses into the order your chapter uses, or use the arrow controls."}</p></div>{!readOnly ? <div className="status-panel-actions">{reorderBusy ? <span className="saving-text">Saving order…</span> : null}<Button variant="secondary" size="sm" icon="plus" onClick={() => setStatusOpen(true)}>Add status</Button></div> : null}</div>
          <div className={`config-list status-config-list ${reorderBusy ? "status-config-saving" : ""}`}>{activeCycle.statuses.map((status, index) => <StatusRow key={status.id} status={status} index={index} total={activeCycle.statuses.length} cycleId={activeCycle.id} onChanged={load} onError={setError} readOnly={readOnly} reorderBusy={reorderBusy} dragging={draggedStatusId === status.id} onMove={moveStatus} onDragStart={setDraggedStatusId} onDragEnd={() => setDraggedStatusId(null)} onDrop={dropStatus} />)}</div>
        </section>


      </div> : null}

      <section className="panel cycle-history">
        <div className="panel-header"><div><span className="section-kicker">History</span><h2>Recruitment cycles</h2></div></div>
        {cycles.length ? <div className="cycle-list">{cycles.map((cycle) => <div className="cycle-row" key={cycle.id}><div className="cycle-icon"><Icon name="calendar" /></div><div className="cycle-copy"><Link href={`/recruitment/cycles/${cycle.id}`}><strong>{cycle.name}</strong></Link><span>{cycle.startsAt ? new Date(cycle.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "No start date"}{cycle.endsAt ? ` – ${new Date(cycle.endsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : ""}</span></div><div className="cycle-count">{cycle._count?.candidates ?? 0} PNMs</div><div className="cycle-actions"><Link href={`/recruitment/cycles/${cycle.id}`} className="button button-secondary button-sm">View</Link>{!readOnly && cycle.status === "DRAFT" ? <Button size="sm" disabled={activateBusy} onClick={() => context?.chapter?.activeRecruitmentCycle?.id && context.chapter.activeRecruitmentCycle.id !== cycle.id ? setActivateTarget({ id: cycle.id, name: cycle.name }) : void activate(cycle.id)}>Activate</Button> : null}{!readOnly && cycle.status === "ACTIVE" ? <Button variant="ghost" size="sm" onClick={() => setArchiveTarget({ id: cycle.id, name: cycle.name })}>Archive</Button> : null}{!readOnly && cycle.status === "ARCHIVED" ? <Button variant="secondary" size="sm" onClick={() => void unarchive(cycle.id)}>Restore</Button> : null}</div></div>)}</div> : <div className="config-empty"><span>No recruitment cycles have been created.</span></div>}
      </section>

      <ConfirmDialog
        open={Boolean(activateTarget)}
        onClose={() => setActivateTarget(null)}
        onConfirm={() => activateTarget ? activate(activateTarget.id) : undefined}
        title={activateTarget ? `Make ${activateTarget.name} active?` : "Make recruitment cycle active?"}
        description="Your current active recruitment cycle will be archived automatically, and members will begin seeing this cycle instead."
        confirmLabel="Make active"
        tone="warning"
        busy={activateBusy}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget ? archive(archiveTarget.id) : undefined}
        title={archiveTarget ? `Archive ${archiveTarget.name}?` : "Archive recruitment cycle?"}
        description="The public form will close and members will no longer see this cycle’s PNMs by default. The cycle and its historical data can be restored later."
        confirmLabel="Archive cycle"
        tone="warning"
        busy={archiveBusy}
      />
      {!readOnly ? <CreateCycleModal open={cycleOpen} onClose={() => setCycleOpen(false)} onCreated={async (id) => { setCycleOpen(false); await activate(id); }} /> : null}
      {!readOnly && activeCycle ? <CreateStatusModal open={statusOpen} onClose={() => setStatusOpen(false)} cycleId={activeCycle.id} onCreated={async () => { setStatusOpen(false); await load(); }} /> : null}
    </AppShell>
  );
}

function StatusRow({ status, index, total, cycleId, onChanged, onError, readOnly, reorderBusy, dragging, onMove, onDragStart, onDragEnd, onDrop }: { status: CandidateStatus; index: number; total: number; cycleId: string; onChanged: () => Promise<void>; onError: (message: string) => void; readOnly: boolean; reorderBusy: boolean; dragging: boolean; onMove: (statusId: string, direction: -1 | 1) => void; onDragStart: (statusId: string) => void; onDragEnd: () => void; onDrop: (statusId: string) => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const assignedCount = status._count?.candidates ?? 0;
  const historyCount = status._count?.historyTo ?? 0;
  const blockedReason = assignedCount > 0
    ? `${assignedCount} ${assignedCount === 1 ? "PNM is" : "PNMs are"} currently assigned to this status.`
    : "";
  const statusDetail = assignedCount > 0
    ? `${assignedCount} ${assignedCount === 1 ? "PNM" : "PNMs"} assigned · Move them before removing`
    : historyCount > 0
      ? `${historyCount} ${historyCount === 1 ? "history entry" : "history entries"} · Deleted references display as “Removed status”`
      : status.isTerminal
        ? "Terminal stage"
        : "Active stage";

  const remove = async () => {
    setBusy(true);
    try {
      await apiRequest(`/recruitment-cycles/${cycleId}/statuses/${status.id}`, { method: "DELETE" });
      await onChanged();
      setConfirmOpen(false);
    } catch (caught) {
      setConfirmOpen(false);
      onError(caught instanceof Error ? caught.message : "Unable to remove status");
    } finally {
      setBusy(false);
    }
  };

  const confirmDescription = historyCount > 0
    ? `This will remove the status from the pipeline. ${historyCount} ${historyCount === 1 ? "existing history entry will" : "existing history entries will"} remain and display as “Removed status”.`
    : "This status will be removed from the recruitment pipeline.";

  return <>
    <div
      className={`config-row status-config-row ${dragging ? "status-config-row-dragging" : ""}`}
      draggable={!readOnly && !reorderBusy}
      onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; onDragStart(status.id); }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => { if (!readOnly && !reorderBusy) event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); onDrop(status.id); }}
    >
      <div className="config-drag-handle" title={readOnly ? undefined : "Drag to reorder"}><Icon name="grip" size={16} /></div>
      <StatusDot color={status.color} />
      <div className="config-copy"><strong>{status.name}</strong><span>Stage {index + 1} · {statusDetail}</span></div>
      <div className="status-row-meta">{status.isTerminal ? <Badge>Final</Badge> : historyCount > 0 ? <Badge>History</Badge> : blockedReason ? <Badge>In use</Badge> : null}</div>
      {!readOnly ? <div className="status-row-actions">
        <button type="button" className="icon-button" disabled={reorderBusy || index === 0} onClick={() => onMove(status.id, -1)} aria-label={`Move ${status.name} up`}><Icon name="arrowUp" size={15} /></button>
        <button type="button" className="icon-button" disabled={reorderBusy || index === total - 1} onClick={() => onMove(status.id, 1)} aria-label={`Move ${status.name} down`}><Icon name="arrowDown" size={15} /></button>
        {!blockedReason ? <button type="button" className="icon-button" onClick={() => setConfirmOpen(true)} aria-label={`Remove ${status.name}`}><Icon name="trash" size={16} /></button> : <span className="config-action-placeholder" title={blockedReason} aria-label={blockedReason} />}
      </div> : null}
    </div>
    <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={remove} title={`Remove “${status.name}”?`} description={confirmDescription} confirmLabel="Remove status" busy={busy} />
  </>;
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
