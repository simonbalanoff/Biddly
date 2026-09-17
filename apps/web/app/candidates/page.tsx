"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Breadcrumbs, PageHeader } from "../../components/app-shell";
import { Icon } from "../../components/icons";
import { Badge, Button, EmptyState, Field, Input, Modal, Score, Select, Skeleton, StatusDot } from "../../components/ui";
import { apiRequest } from "../../lib/api";
import type { Candidate, CandidateField, CandidateList, RecruitmentCycle } from "../../lib/types";
import { useAuth } from "../../providers/auth-provider";

type MemberView = "grid" | "list";

export default function CandidatesPage() {
  const { context } = useAuth();
  const memberMode = context?.membership?.role === "MEMBER" && context.user.platformRole !== "PLATFORM_ADMIN";
  return memberMode ? <MemberCandidatesPage /> : <ManagedCandidatesPage />;
}

function MemberCandidatesPage() {
  const { context } = useAuth();
  const cycleId = context?.chapter?.activeRecruitmentCycle?.id;
  const [cycle, setCycle] = useState<RecruitmentCycle | null>(null);
  const [data, setData] = useState<CandidateList | null>(null);
  const [q, setQ] = useState("");
  const [statusId, setStatusId] = useState("");
  const [sort, setSort] = useState("status");
  const [view, setView] = useState<MemberView>("grid");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [ratingBusy, setRatingBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("biddly-member-pnm-view");
    if (saved === "grid" || saved === "list") setView(saved);
  }, []);

  useEffect(() => {
    if (!cycleId) {
      setCycle(null);
      setLoading(false);
      return;
    }
    apiRequest<RecruitmentCycle>(`/recruitment-cycles/${cycleId}`).then(setCycle).catch(() => setCycle(null));
  }, [cycleId]);

  const loadCandidates = async () => {
    if (!cycleId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: view === "grid" ? "36" : "50",
        sort
      });
      if (q.trim()) params.set("q", q.trim());
      if (statusId) params.set("statusId", statusId);
      setData(await apiRequest<CandidateList>(`/candidates?${params.toString()}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load PNMs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCandidates(); }, 180);
    return () => window.clearTimeout(timer);
  }, [cycleId, page, q, sort, statusId, view]);

  const scoreMin = context?.chapter?.settings?.scoreMin ?? 1;
  const scoreMax = context?.chapter?.settings?.scoreMax ?? 10;
  const scoreStep = context?.chapter?.settings?.scoreStep ?? 1;
  const ratingOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    const count = Math.floor((scoreMax - scoreMin) / scoreStep + 0.000001) + 1;
    for (let index = 0; index < Math.min(count, 100); index += 1) {
      const score = Number((scoreMin + scoreStep * index).toFixed(4));
      options.push({ value: String(score), label: formatMemberScore(score) });
    }
    return options;
  }, [scoreMax, scoreMin, scoreStep]);

  const changeView = (next: MemberView) => {
    setView(next);
    setPage(1);
    window.localStorage.setItem("biddly-member-pnm-view", next);
  };

  const rate = async (candidate: Candidate, nextValue: string) => {
    const score = Number(nextValue);
    if (!Number.isFinite(score)) return;
    const previous = candidate.myEvaluation ?? null;
    setRatingBusy(candidate.id);
    setError("");
    setData((current) => current ? {
      ...current,
      items: current.items.map((item) => item.id === candidate.id ? { ...item, myEvaluation: { score, updatedAt: new Date().toISOString() } } : item)
    } : current);
    try {
      await apiRequest(`/candidates/${candidate.id}/evaluations`, { method: "POST", body: JSON.stringify({ score }) });
    } catch (caught) {
      setData((current) => current ? {
        ...current,
        items: current.items.map((item) => item.id === candidate.id ? { ...item, myEvaluation: previous } : item)
      } : current);
      setError(caught instanceof Error ? caught.message : "Unable to save rating");
    } finally {
      setRatingBusy(null);
    }
  };

  const filtered = Boolean(q.trim() || statusId);

  return (
    <AppShell>
      <header className="member-pnm-heading">
        <div><span>{cycle?.name ?? context?.chapter?.activeRecruitmentCycle?.name ?? "Active recruitment"}</span><h1>PNMs</h1><p>Find who you’re looking for and add your rating.</p></div>
      </header>

      {error ? <div className="form-alert form-alert-error member-pnm-alert">{error}</div> : null}

      {!cycleId ? <div className="member-empty-panel"><EmptyState icon="candidate" title="No active recruitment cycle" copy="Your chapter will see PNMs here once an administrator starts recruitment." /></div> : <>
        <div className="member-pnm-toolbar">
          <div className="member-pnm-search"><Icon name="search" size={19} /><input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} aria-label="Search PNMs" placeholder="Search PNMs by name…" /></div>
          <Select compact className="member-pnm-filter" leadingIcon="filter" value={statusId} onChange={(next) => { setStatusId(next); setPage(1); }} placeholder="All statuses" clearable clearLabel="All statuses" options={(cycle?.statuses ?? []).map((status) => ({ value: status.id, label: status.name }))} ariaLabel="Filter by status" />
          <Select compact className="member-pnm-sort" value={sort} onChange={(next) => { setSort(next); setPage(1); }} options={[{ value: "status", label: "Pipeline order" }, { value: "name", label: "Name A–Z" }, { value: "recent", label: "Recently added" }]} ariaLabel="Sort PNMs" />
          <div className="member-view-toggle" role="group" aria-label="PNM view">
            <button type="button" className={view === "grid" ? "active" : ""} onClick={() => changeView("grid")} aria-pressed={view === "grid"} aria-label="Grid view"><Icon name="grid" size={17} /></button>
            <button type="button" className={view === "list" ? "active" : ""} onClick={() => changeView("list")} aria-pressed={view === "list"} aria-label="List view"><Icon name="list" size={17} /></button>
          </div>
        </div>

        {loading ? <MemberCandidatesLoading view={view} /> : data?.items.length ? view === "grid" ? <div className="member-pnm-grid">{data.items.map((candidate) => <MemberCandidateCard key={candidate.id} candidate={candidate} ratingOptions={ratingOptions} ratingBusy={ratingBusy === candidate.id} scoreMax={scoreMax} onRate={rate} />)}</div> : <div className="member-pnm-list">{data.items.map((candidate) => <MemberCandidateRow key={candidate.id} candidate={candidate} ratingOptions={ratingOptions} ratingBusy={ratingBusy === candidate.id} scoreMax={scoreMax} onRate={rate} />)}</div> : <div className="member-empty-panel"><EmptyState icon="candidate" title={filtered ? "No matching PNMs" : "No PNMs yet"} copy={filtered ? "Try changing your search or filters." : "PNMs will appear here as your chapter adds them to recruitment."} /></div>}

        {data && data.totalPages > 1 ? <div className="member-pagination"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><span>{data.page} of {data.totalPages}</span><Button variant="secondary" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div> : null}
      </>}
    </AppShell>
  );
}

function MemberCandidateCard({ candidate, ratingOptions, ratingBusy, scoreMax, onRate }: { candidate: Candidate; ratingOptions: Array<{ value: string; label: string }>; ratingBusy: boolean; scoreMax: number; onRate: (candidate: Candidate, value: string) => Promise<void> }) {
  return <article className="member-pnm-card">
    <div className="member-pnm-photo">
      {candidate.photoUrl ? <img src={candidate.photoUrl} alt={`${candidate.firstName} ${candidate.lastName}`} /> : <div className="member-pnm-photo-fallback"><span>{candidate.firstName[0]}{candidate.lastName[0]}</span><small>No photo</small></div>}
      <div className="member-pnm-status"><StatusDot color={candidate.status.color} /><span>{candidate.status.name}</span></div>
    </div>
    <div className="member-pnm-card-body">
      <h2>{candidate.firstName} {candidate.lastName}</h2>
      <div className="member-rating-row"><div><span>Your rating</span>{candidate.myEvaluation ? <small>{formatMemberScore(candidate.myEvaluation.score)} / {formatMemberScore(scoreMax)}</small> : <small>Not rated yet</small>}</div><Select compact className="member-rating-select" value={candidate.myEvaluation ? String(candidate.myEvaluation.score) : ""} onChange={(next) => void onRate(candidate, next)} placeholder={ratingBusy ? "Saving…" : "Rate"} disabled={ratingBusy} options={ratingOptions} ariaLabel={`Rate ${candidate.firstName} ${candidate.lastName}`} /></div>
    </div>
  </article>;
}

function MemberCandidateRow({ candidate, ratingOptions, ratingBusy, scoreMax, onRate }: { candidate: Candidate; ratingOptions: Array<{ value: string; label: string }>; ratingBusy: boolean; scoreMax: number; onRate: (candidate: Candidate, value: string) => Promise<void> }) {
  return <article className="member-pnm-row">
    <div className="member-pnm-row-photo">{candidate.photoUrl ? <img src={candidate.photoUrl} alt={`${candidate.firstName} ${candidate.lastName}`} /> : <span>{candidate.firstName[0]}{candidate.lastName[0]}</span>}</div>
    <div className="member-pnm-row-copy"><strong>{candidate.firstName} {candidate.lastName}</strong><span><StatusDot color={candidate.status.color} />{candidate.status.name}</span></div>
    <div className="member-pnm-row-rating"><div><span>Your rating</span><small>{candidate.myEvaluation ? `${formatMemberScore(candidate.myEvaluation.score)} / ${formatMemberScore(scoreMax)}` : "Not rated"}</small></div><Select compact className="member-rating-select" value={candidate.myEvaluation ? String(candidate.myEvaluation.score) : ""} onChange={(next) => void onRate(candidate, next)} placeholder={ratingBusy ? "Saving…" : "Rate"} disabled={ratingBusy} options={ratingOptions} ariaLabel={`Rate ${candidate.firstName} ${candidate.lastName}`} /></div>
  </article>;
}

function MemberCandidatesLoading({ view }: { view: MemberView }) {
  if (view === "list") return <div className="member-pnm-list">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="member-pnm-row-skeleton" />)}</div>;
  return <div className="member-pnm-grid">{Array.from({ length: 12 }).map((_, index) => <Skeleton key={index} className="member-pnm-card-skeleton" />)}</div>;
}

function formatMemberScore(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function ManagedCandidatesPage() {
  const { context } = useAuth();
  const activeCycleId = context?.chapter?.activeRecruitmentCycle?.id;
  const [requestedCycleId, setRequestedCycleId] = useState<string | null>(null);
  const cycleId = requestedCycleId || activeCycleId;
  const [cycle, setCycle] = useState<RecruitmentCycle | null>(null);
  const [data, setData] = useState<CandidateList | null>(null);
  const [q, setQ] = useState("");
  const [statusId, setStatusId] = useState("");
  const [sort, setSort] = useState("status");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const canManage = context?.membership?.role === "MODERATOR" || context?.membership?.role === "CHAPTER_ADMIN";

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const initialStatus = params.get("status") ?? "";
      const initialCycleId = params.get("cycleId");
      if (initialStatus) setStatusId(initialStatus);
      if (initialCycleId) setRequestedCycleId(initialCycleId);
    }
  }, []);

  useEffect(() => {
    if (!cycleId) {
      setLoading(false);
      return;
    }
    apiRequest<RecruitmentCycle>(`/recruitment-cycles/${cycleId}`).then(setCycle).catch(() => null);
  }, [cycleId]);

  const loadCandidates = async () => {
    if (!cycleId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25", sort });
      if (requestedCycleId) params.set("cycleId", requestedCycleId);
      if (requestedCycleId) params.set("archived", "all");
      if (q.trim()) params.set("q", q.trim());
      if (statusId) params.set("statusId", statusId);
      const next = await apiRequest<CandidateList>(`/candidates?${params.toString()}`);
      setData(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCandidates(); }, 220);
    return () => window.clearTimeout(timer);
  }, [cycleId, requestedCycleId, q, statusId, sort, page]);

  const scoreMax = context?.chapter?.settings?.scoreMax ?? 10;
  const activeFilter = useMemo(() => cycle?.statuses.find((status) => status.id === statusId), [cycle, statusId]);
  const cycleScoped = Boolean(requestedCycleId);
  const historical = Boolean(requestedCycleId && requestedCycleId !== activeCycleId);
  const subscriptionReadOnly = context?.subscriptionAccess?.mode === "READ_ONLY";
  const canCreate = canManage && !historical && !subscriptionReadOnly;

  return (
    <AppShell>
      {cycleScoped && cycle ? <Breadcrumbs items={[{ label: "Recruitment", href: "/recruitment" }, { label: cycle.name, href: `/recruitment/cycles/${cycle.id}` }, { label: "PNMs" }]} /> : null}
      <PageHeader title={historical && cycle ? `${cycle.name} PNMs` : "PNMs"} description={data ? `${data.total} ${data.total === 1 ? "person" : "people"} in ${cycle?.name ?? context?.chapter?.activeRecruitmentCycle?.name ?? "the active recruitment cycle"}.` : historical ? "Review the PNMs captured in this recruitment cycle." : "Search, evaluate, and move PNMs through recruitment."} actions={canCreate ? <Button icon="plus" onClick={() => setCreateOpen(true)}>Add PNM</Button> : undefined} />
      {historical ? <div className="history-notice"><Icon name="archive" size={16} /><div><strong>Historical cycle</strong><span>This view is read-only until the cycle is restored and made active again.</span></div></div> : null}

      {!cycleId ? <div className="panel panel-spacious"><EmptyState icon="workflow" title="No active recruitment cycle" copy="PNMs will be available once a chapter admin activates a recruitment cycle." /></div> : <>
        <div className="candidate-toolbar">
          <div className="search-field"><Icon name="search" size={18} /><input value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} aria-label="Search PNMs" placeholder="Search name, email, or phone…" /></div>
          <div className="toolbar-group">
            <Select compact className="toolbar-select" leadingIcon="filter" value={statusId} onChange={(next) => { setStatusId(next); setPage(1); }} placeholder="All statuses" clearable options={(cycle?.statuses ?? []).map((status) => ({ value: status.id, label: status.name }))} />
            <Select compact className="toolbar-select sort-select" value={sort} onChange={(next) => { setSort(next); setPage(1); }} options={[{ value: "status", label: "Pipeline order" }, { value: "recent", label: "Recently added" }, { value: "name", label: "Name" }, { value: "score_desc", label: "Highest score" }, { value: "score_asc", label: "Lowest score" }]} />
          </div>
        </div>

        {activeFilter ? <div className="active-filter"><span><StatusDot color={activeFilter.color} />Showing {activeFilter.name}</span><button type="button" onClick={() => setStatusId("")}>Clear</button></div> : null}

        <div className="panel table-panel">
          {loading ? <div className="table-loading">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="table-row-skeleton" />)}</div> : data?.items.length ? <div className="data-table-wrap"><table className="data-table candidate-table"><thead><tr><th>PNM</th><th>Status</th><th>Chapter score</th><th>Your score</th><th>Added</th><th /></tr></thead><tbody>{data.items.map((candidate) => <tr key={candidate.id}><td><Link className="candidate-cell" href={`/candidates/${candidate.id}${cycleScoped && cycleId ? `?cycleId=${cycleId}` : ""}`}><span className="candidate-initials candidate-initials-sm">{candidate.firstName[0]}{candidate.lastName[0]}</span><span><strong>{candidate.firstName} {candidate.lastName}</strong><small>{candidate.email || candidate.phone || "No contact info"}</small></span></Link></td><td><span className="status-label"><StatusDot color={candidate.status.color} />{candidate.status.name}</span></td><td><Score value={candidate.aggregate?.averageScore} max={scoreMax} count={candidate.aggregate?.evaluationCount} /></td><td>{candidate.myEvaluation ? <Badge tone="accent">{candidate.myEvaluation.score}/{scoreMax}</Badge> : <span className="muted-cell">Not scored</span>}</td><td><span className="muted-cell">{new Date(candidate.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></td><td><Link className="row-action" href={`/candidates/${candidate.id}${cycleScoped && cycleId ? `?cycleId=${cycleId}` : ""}`} aria-label={`Open ${candidate.firstName} ${candidate.lastName}`}><Icon name="chevron" size={16} /></Link></td></tr>)}</tbody></table></div> : <EmptyState title={q || statusId ? "No matching PNMs" : "No PNMs yet"} copy={q || statusId ? "Try a different search or clear the current filter." : "PNMs added manually, by CSV, or through your recruitment form will appear here."} action={canCreate && !q && !statusId ? <Button icon="plus" onClick={() => setCreateOpen(true)}>Add first PNM</Button> : undefined} />}
          {data && data.totalPages > 1 ? <div className="pagination"><span>Page {data.page} of {data.totalPages}</span><div><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div> : null}
        </div>
      </>}

      {canCreate ? <CreateCandidateModal open={createOpen} onClose={() => setCreateOpen(false)} fields={cycle?.fieldDefinitions ?? []} onCreated={async () => { setCreateOpen(false); await loadCandidates(); }} /> : null}
    </AppShell>
  );
}

function CreateCandidateModal({ open, onClose, fields, onCreated }: { open: boolean; onClose: () => void; fields: CandidateField[]; onCreated: () => Promise<void> }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setValues({}); setError("");
    }
  }, [open]);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await apiRequest("/candidates", { method: "POST", body: JSON.stringify({ firstName, lastName, email: email || null, phone: phone || null, customFields: values }) });
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add PNM");
    } finally {
      setBusy(false);
    }
  };

  return <Modal open={open} onClose={onClose} title="Add a PNM" subtitle="Create a new person in the active recruitment cycle." footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy || !firstName.trim() || !lastName.trim()}>{busy ? "Adding…" : "Add PNM"}</Button></>}><div className="form-grid form-grid-2"><Field label="First name"><Input value={firstName} onChange={(event) => setFirstName(event.target.value)} /></Field><Field label="Last name"><Input value={lastName} onChange={(event) => setLastName(event.target.value)} /></Field></div><div className="form-grid form-grid-2"><Field label="Email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field><Field label="Phone"><Input value={phone} onChange={(event) => setPhone(event.target.value)} /></Field></div>{fields.length ? <div className="modal-section"><h3>Chapter fields</h3><div className="form-grid">{fields.map((field) => <CustomFieldInput key={field.id} field={field} value={values[field.key]} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />)}</div></div> : null}{error ? <div className="form-alert form-alert-error">{error}</div> : null}</Modal>;
}

function CustomFieldInput({ field, value, onChange }: { field: CandidateField; value: unknown; onChange: (value: unknown) => void }) {
  const choices = field.options?.choices ?? [];
  if (field.type === "BOOLEAN") return <Field label={field.label}><Select value={value === undefined ? "" : value ? "true" : "false"} onChange={(next) => onChange(next === "true")} placeholder="Select" options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} /></Field>;
  if (field.type === "SELECT") return <Field label={field.label}><Select value={String(value ?? "")} onChange={onChange} placeholder="Select" searchable={choices.length > 8} options={choices.map((choice) => ({ value: choice, label: choice }))} /></Field>;
  if (field.type === "MULTI_SELECT") return <Field label={field.label} hint="Separate multiple values with commas."><Input value={Array.isArray(value) ? value.join(", ") : String(value ?? "")} onChange={(event) => onChange(event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></Field>;
  if (field.type === "LONG_TEXT") return <Field label={field.label}><textarea className="textarea" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} /></Field>;
  const type = field.type === "NUMBER" || field.type === "YEAR" ? "number" : field.type === "EMAIL" ? "email" : field.type === "DATE" ? "date" : "text";
  return <Field label={field.label}><Input type={type} value={String(value ?? "")} onChange={(event) => onChange(type === "number" && event.target.value ? Number(event.target.value) : event.target.value)} /></Field>;
}
