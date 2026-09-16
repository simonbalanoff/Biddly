"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "../components/app-shell";
import { Icon } from "../components/icons";
import { Badge, Button, EmptyState, Field, Select } from "../components/ui";
import { apiRequest, downloadCsv } from "../lib/api";
import type { RecruitmentCycle } from "../lib/types";
import { useAuth } from "../providers/auth-provider";

type AuditLog = {
  id: string;
  action: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  actor?: { firstName: string; lastName: string; email: string } | null;
};

export default function DataPage() {
  const { context } = useAuth();
  const cycleId = context?.chapter?.activeRecruitmentCycle?.id;
  const [cycle, setCycle] = useState<RecruitmentCycle | null>(null);
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [audit, setAudit] = useState<AuditLog[]>([]);

  useEffect(() => {
    if (!cycleId) return;
    Promise.all([
      apiRequest<RecruitmentCycle>(`/recruitment-cycles/${cycleId}`),
      apiRequest<{ items: AuditLog[] }>("/chapter/audit-logs?page=1&pageSize=20")
    ]).then(([cycleData, logs]) => {
      setCycle(cycleData);
      setAudit(logs.items.filter((item) => item.action === "IMPORT_COMPLETED" || item.action === "EXPORT_CREATED"));
    });
  }, [cycleId]);

  const targets = useMemo(() => [
    { value: "", label: "Do not import" },
    { value: "fullName", label: "Full name" },
    { value: "firstName", label: "First name" },
    { value: "lastName", label: "Last name" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "status", label: "Status" },
    ...(cycle?.fieldDefinitions.map((field) => ({ value: `custom:${field.key}`, label: field.label })) ?? [])
  ], [cycle]);

  const chooseFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setFilename(file.name);
    const firstLine = text.split(/\r?\n/)[0] ?? "";
    const cols = parseHeader(firstLine);
    setHeaders(cols);
    const next: Record<string, string> = {};
    for (const header of cols) {
      const normalized = header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (["name", "full name", "pnm name"].includes(normalized)) next[header] = "fullName";
      else if (["first", "first name", "firstname"].includes(normalized)) next[header] = "firstName";
      else if (["last", "last name", "lastname"].includes(normalized)) next[header] = "lastName";
      else if (normalized.includes("email")) next[header] = "email";
      else if (normalized.includes("phone") || normalized.includes("cell")) next[header] = "phone";
      else if (normalized === "status" || normalized === "stage") next[header] = "status";
      else {
        const custom = cycle?.fieldDefinitions.find((field) => field.label.toLowerCase() === header.toLowerCase() || field.key.toLowerCase() === header.toLowerCase().replace(/\s+/g, "_"));
        if (custom) next[header] = `custom:${custom.key}`;
      }
    }
    setMapping(next);
    setMessage("");
  };

  const importCsv = async () => {
    setBusy(true); setMessage("");
    try {
      const activeMapping = Object.fromEntries(Object.entries(mapping).filter(([, value]) => value));
      const result = await apiRequest<{ imported: number }>("/chapter/imports/candidates", { method: "POST", body: JSON.stringify({ csv, mapping: activeMapping }) });
      setMessage(`Imported ${result.imported} ${result.imported === 1 ? "PNM" : "PNMs"} successfully.`);
      setCsv(""); setFilename(""); setHeaders([]); setMapping({});
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Import failed");
    } finally { setBusy(false); }
  };

  const exportCsv = async (includeArchived = false) => {
    setBusy(true); setMessage("");
    try {
      await downloadCsv(`/chapter/exports/candidates.csv?includeArchived=${includeArchived ? "true" : "false"}`, `biddly-${cycle?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "recruitment"}.csv`);
      setMessage("Export downloaded.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Export failed");
    } finally { setBusy(false); }
  };

  return <AppShell>
    <PageHeader title="Import & export" description="Bring an existing PNM list into Biddly or download clean chapter data when you need it." />
    {!cycleId ? <div className="panel panel-spacious"><EmptyState icon="data" title="No active recruitment cycle" copy="Imports and exports operate on the chapter’s active recruitment cycle." /></div> : <div className="data-page-grid">
      <section className="panel data-action-card">
        <div className="data-action-icon"><Icon name="upload" /></div>
        <div><span className="section-kicker">Import</span><h2>Bring in a CSV</h2><p>Upload an existing spreadsheet and map each column to Biddly fields before anything is added.</p></div>
        {!csv ? <label className="file-drop"><input type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} /><Icon name="upload" size={22} /><strong>Choose CSV file</strong><span>Up to 5,000 PNMs per import</span></label> : <div className="file-selected"><div><Icon name="data" /><span><strong>{filename}</strong><small>{headers.length} columns detected</small></span></div><Button variant="ghost" size="sm" onClick={() => { setCsv(""); setHeaders([]); setFilename(""); }}>Remove</Button></div>}
        {headers.length ? <div className="mapping-section"><div className="mapping-title"><strong>Map columns</strong><span>Match your CSV to Biddly.</span></div><div className="mapping-list">{headers.map((header) => <div className="mapping-row" key={header}><span>{header}</span><Icon name="chevron" size={14} /><Select compact searchable value={mapping[header] ?? ""} onChange={(next) => setMapping((current) => ({ ...current, [header]: next }))} placeholder="Choose field" clearable clearLabel="Do not import" options={targets.map((target) => ({ value: target.value, label: target.label }))} /></div>)}</div><Button disabled={busy || !Object.values(mapping).some(Boolean)} onClick={() => void importCsv()}>{busy ? "Importing…" : "Import PNMs"}</Button></div> : null}
      </section>

      <section className="panel data-action-card">
        <div className="data-action-icon"><Icon name="download" /></div>
        <div><span className="section-kicker">Export</span><h2>Export recruitment data</h2><p>Download a clean CSV containing contact info, statuses, chapter scores, evaluation counts, and every configured PNM field.</p></div>
        <div className="export-summary"><div><span>Active cycle</span><strong>{cycle?.name}</strong></div><div><span>Configured fields</span><strong>{cycle?.fieldDefinitions.length ?? 0}</strong></div><div><span>PNMs</span><strong>{cycle?._count.candidates ?? 0}</strong></div></div>
        <div className="export-actions"><Button icon="download" disabled={busy} onClick={() => void exportCsv(false)}>Export active PNMs</Button><Button variant="secondary" disabled={busy} onClick={() => void exportCsv(true)}>Include archived PNMs</Button></div>
      </section>
    </div>}
    {message ? <div className={`form-alert page-alert ${message.toLowerCase().includes("fail") || message.toLowerCase().includes("unable") ? "form-alert-error" : "form-alert-success"}`}>{message}</div> : null}
    {audit.length ? <section className="panel"><div className="panel-header"><div><span className="section-kicker">History</span><h2>Recent data activity</h2></div></div><div className="activity-list">{audit.slice(0, 10).map((item) => <div className="activity-row" key={item.id}><span className="activity-icon"><Icon name={item.action === "IMPORT_COMPLETED" ? "upload" : "download"} /></span><div><strong>{item.action === "IMPORT_COMPLETED" ? "Candidate import" : "CSV export"}</strong><span>{item.actor ? `${item.actor.firstName} ${item.actor.lastName}` : "Chapter admin"} · {new Date(item.createdAt).toLocaleString()}</span></div>{typeof item.metadata?.candidateCount === "number" ? <Badge>{String(item.metadata.candidateCount)} PNMs</Badge> : null}</div>)}</div></section> : null}
  </AppShell>;
}

function parseHeader(line: string) {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current.trim()); current = "";
    } else current += char;
  }
  result.push(current.trim());
  return result.filter(Boolean);
}
