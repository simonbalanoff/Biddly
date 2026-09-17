"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "../../../components/app-shell";
import { Icon } from "../../../components/icons";
import { Badge, Button, CopyButton, EmptyState, Field, Input, Modal, Select, Spinner } from "../../../components/ui";
import { apiRequest } from "../../../lib/api";
import { useAuth } from "../../../providers/auth-provider";
import styles from "./storage.module.css";

type StorageWorkspace = {
  id: string;
  name: string;
  organization: { id: string; name: string; shortName?: string | null; isActive: boolean };
  university: { id: string; name: string; shortName?: string | null; isActive: boolean };
};

type StorageObject = {
  key: string;
  size: number;
  lastModified?: string | null;
  eTag?: string | null;
  category: string;
  referenced: boolean;
  workspace: StorageWorkspace | null;
};

type WorkspaceUsage = StorageWorkspace & {
  objectCount: number;
  totalBytes: number;
  orphanedObjects: number;
  quotaBytes: number | null;
  quotaPercent: number | null;
  quotaExceeded: boolean;
};

type StorageInventory = {
  configured: boolean;
  bucket: string | null;
  truncated: boolean;
  summary: { totalObjects: number; totalBytes: number; referencedObjects: number; orphanedObjects: number; missingReferences: number };
  workspaces: WorkspaceUsage[];
  objects: StorageObject[];
  missingReferenceDetails: Array<{ key: string; chapterId: string; recruitmentCycleId: string; workspace: StorageWorkspace | null }>;
};

type StorageActivity = {
  id: string;
  action: string;
  targetId?: string | null;
  metadata?: unknown;
  createdAt: string;
  actor: { firstName: string; lastName: string; email: string };
};

type StorageStatus = "ALL" | "REFERENCED" | "ORPHANED";
type StorageSort = "NEWEST" | "LARGEST" | "KEY" | "WORKSPACE";

export default function PlatformStoragePage() {
  const { context } = useAuth();
  const [inventory, setInventory] = useState<StorageInventory | null>(null);
  const [activity, setActivity] = useState<StorageActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StorageStatus>("ALL");
  const [workspaceId, setWorkspaceId] = useState("ALL");
  const [sort, setSort] = useState<StorageSort>("NEWEST");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupDays, setCleanupDays] = useState("7");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [storage, recentActivity] = await Promise.all([
        apiRequest<StorageInventory>("/platform/storage"),
        apiRequest<StorageActivity[]>("/platform/storage/activity").catch(() => [])
      ]);
      setInventory(storage);
      setActivity(recentActivity);
      setSelected(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load storage");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (context?.user.platformRole === "PLATFORM_ADMIN") void load();
  }, [context?.user.platformRole]);

  const workspaceOptions = useMemo(() => inventory ? inventory.workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name, description: `${workspace.organization.shortName || workspace.organization.name} · ${workspace.university.shortName || workspace.university.name}` })).sort((a, b) => a.label.localeCompare(b.label)) : [], [inventory]);

  const filteredObjects = useMemo(() => {
    if (!inventory) return [];
    const q = search.trim().toLowerCase();
    const objects = inventory.objects.filter((object) => {
      const workspace = object.workspace;
      const haystack = `${object.key} ${object.category} ${workspace?.name || ""} ${workspace?.organization.name || ""} ${workspace?.organization.shortName || ""} ${workspace?.university.name || ""} ${workspace?.university.shortName || ""}`.toLowerCase();
      return (!q || haystack.includes(q)) && (status === "ALL" || (status === "REFERENCED" ? object.referenced : !object.referenced)) && (workspaceId === "ALL" || workspace?.id === workspaceId);
    });
    return [...objects].sort((a, b) => {
      if (sort === "LARGEST") return b.size - a.size || a.key.localeCompare(b.key);
      if (sort === "KEY") return a.key.localeCompare(b.key);
      if (sort === "WORKSPACE") return (a.workspace?.name || "Unassigned").localeCompare(b.workspace?.name || "Unassigned") || a.key.localeCompare(b.key);
      return new Date(b.lastModified || 0).getTime() - new Date(a.lastModified || 0).getTime();
    });
  }, [inventory, search, sort, status, workspaceId]);

  const selectableOrphans = useMemo(() => filteredObjects.filter((object) => !object.referenced), [filteredObjects]);
  const selectedObjects = useMemo(() => inventory?.objects.filter((object) => selected.has(object.key)) ?? [], [inventory, selected]);
  const selectedBytes = selectedObjects.reduce((sum, object) => sum + object.size, 0);
  const hasFilters = Boolean(search.trim()) || status !== "ALL" || workspaceId !== "ALL" || sort !== "NEWEST";

  const toggleSelected = (key: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const selectVisibleOrphans = () => setSelected(new Set(selectableOrphans.map((object) => object.key)));

  const deleteSelected = async () => {
    if (!selected.size) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ deleted: string[]; skippedReferenced: string[]; errors: Array<{ key: string }> }>("/platform/storage/delete", { method: "POST", body: JSON.stringify({ keys: [...selected], confirm: "DELETE" }) });
      setNotice(`${result.deleted.length} ${result.deleted.length === 1 ? "object" : "objects"} deleted${result.skippedReferenced.length ? `; ${result.skippedReferenced.length} skipped because they are still referenced` : ""}.`);
      setDeleteOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete storage objects");
    } finally {
      setBusy(false);
    }
  };

  const cleanup = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ deleted: string[]; errors: Array<{ key: string }>; matched: number }>("/platform/storage/cleanup", { method: "POST", body: JSON.stringify({ workspaceId: workspaceId === "ALL" ? null : workspaceId, olderThanDays: Math.max(0, Number(cleanupDays) || 0), confirm: "DELETE ORPHANS" }) });
      setNotice(`${result.deleted.length} safe orphan ${result.deleted.length === 1 ? "object" : "objects"} deleted.`);
      setCleanupOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to clean orphaned objects");
    } finally {
      setBusy(false);
    }
  };

  const clearFilters = () => { setSearch(""); setStatus("ALL"); setWorkspaceId("ALL"); setSort("NEWEST"); };

  if (context?.user.platformRole !== "PLATFORM_ADMIN") return <AppShell><div className="panel panel-spacious"><EmptyState icon="shield" title="Platform access required" copy="This page is only available to Biddly platform administrators." /></div></AppShell>;

  return (
    <AppShell>
      <PageHeader eyebrow="Biddly admin" title="Storage" description="Inspect private object storage, diagnose broken references, and safely clean files Biddly no longer uses." actions={<Button variant="secondary" icon="activity" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>} />
      {error ? <div className="form-alert form-alert-error page-alert">{error}</div> : null}
      {notice ? <div className="form-alert form-alert-success page-alert">{notice}</div> : null}

      {loading && !inventory ? <div className="detail-loading"><Spinner /><span>Reading storage…</span></div> : inventory && !inventory.configured ? <section className="panel panel-spacious"><EmptyState icon="storage" title="Object storage is not configured" copy="Add the R2 account, access key, secret key, and bucket environment variables before using the storage viewer." /></section> : inventory ? <>
        <section className={styles.storageOverview}>
          <div className={styles.storageIdentity}><div className={styles.storageIcon}><Icon name="storage" size={21} /></div><div><span>Private object storage</span><strong>{inventory.bucket || "R2 bucket"}</strong><p>Cleanup is guarded by a live database reference check. Biddly never previews PNM photos here.</p></div><Badge tone="success">Connected</Badge></div>
          <div className={styles.summaryStrip}><SummaryItem label="Stored" value={formatBytes(inventory.summary.totalBytes)} detail={`${inventory.summary.totalObjects} objects`} /><SummaryItem label="In use" value={String(inventory.summary.referencedObjects)} detail="Referenced by Biddly" /><SummaryItem label="Orphaned" value={String(inventory.summary.orphanedObjects)} detail="Safe cleanup candidates" tone={inventory.summary.orphanedObjects ? "warning" : "neutral"} /><SummaryItem label="Missing" value={String(inventory.summary.missingReferences)} detail="DB refs without an object" tone={inventory.summary.missingReferences ? "danger" : "neutral"} /></div>
        </section>

        {inventory.truncated ? <div className={styles.notice}><Icon name="activity" size={16} /><span>The bucket contains more than 5,000 objects. Cleanup should be performed in smaller workspace-scoped passes.</span></div> : null}

        {inventory.missingReferenceDetails.length ? <section className={`panel ${styles.diagnosticPanel}`}><div className={styles.sectionHeader}><div><span className="section-kicker">Diagnostics</span><h2>Missing storage references</h2><p>These database references point to files that do not currently exist in the bucket. No candidate identity is exposed here.</p></div></div><div className={styles.diagnosticList}>{inventory.missingReferenceDetails.slice(0, 20).map((item) => <div className={styles.diagnosticRow} key={`${item.key}-${item.chapterId}`}><Icon name="activity" size={15} /><div><strong>{item.key}</strong><span>{item.workspace ? `${item.workspace.name} · ${item.workspace.organization.shortName || item.workspace.organization.name}` : "Workspace unavailable"}</span></div>{item.workspace ? <Link href={`/platform/chapters/${item.workspace.id}`}>View workspace</Link> : null}</div>)}</div></section> : null}

        <section className={`panel ${styles.workspaceUsage}`}><div className={styles.sectionHeader}><div><span className="section-kicker">Usage by workspace</span><h2>Where storage is being used</h2><p>Quotas are optional and can be configured from each workspace admin view.</p></div></div>{inventory.workspaces.length ? <div className="data-table-wrap"><table className={`data-table ${styles.usageTable}`}><thead><tr><th>Workspace</th><th>Objects</th><th>Storage</th><th>Quota</th><th>Orphaned</th><th /></tr></thead><tbody>{inventory.workspaces.map((workspace) => <tr key={workspace.id}><td><div className="table-primary"><strong>{workspace.name}</strong><small>{workspace.organization.shortName || workspace.organization.name} · {workspace.university.shortName || workspace.university.name}</small></div></td><td>{workspace.objectCount}</td><td>{formatBytes(workspace.totalBytes)}</td><td>{workspace.quotaBytes ? <div className={styles.quotaCell}><Badge tone={workspace.quotaExceeded ? "danger" : workspace.quotaPercent && workspace.quotaPercent >= 80 ? "warning" : "neutral"}>{workspace.quotaPercent}%</Badge><small>{formatBytes(workspace.quotaBytes)}</small></div> : <span className={styles.muted}>No quota</span>}</td><td>{workspace.orphanedObjects ? <Badge tone="warning">{workspace.orphanedObjects}</Badge> : <span className={styles.muted}>None</span>}</td><td className={styles.actionCell}><Link href={`/platform/chapters/${workspace.id}`} className={styles.workspaceLink}>View workspace<Icon name="chevron" size={14} /></Link></td></tr>)}</tbody></table></div> : <div className={styles.emptyWrap}><EmptyState icon="storage" title="No workspace objects" copy="No stored objects are currently associated with a chapter workspace." /></div>}</section>

        <section className={`panel ${styles.objectDirectory}`}>
          <div className={styles.sectionHeader}><div><span className="section-kicker">Object directory</span><h2>Stored objects</h2><p>{filteredObjects.length === inventory.objects.length ? `${inventory.objects.length} objects` : `${filteredObjects.length} of ${inventory.objects.length} objects shown`}</p></div><div className={styles.headerActions}>{selected.size ? <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>Delete {selected.size} selected</Button> : null}<Button variant="secondary" size="sm" onClick={() => setCleanupOpen(true)} disabled={!inventory.summary.orphanedObjects}>Clean orphans</Button>{hasFilters ? <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button> : null}</div></div>
          <div className={styles.toolbar}><label className={styles.searchBox}><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search storage objects" placeholder="Search object key or workspace" /></label><div className={styles.statusFilter}><button type="button" className={status === "ALL" ? styles.statusFilterActive : ""} onClick={() => setStatus("ALL")}>All</button><button type="button" className={status === "REFERENCED" ? styles.statusFilterActive : ""} onClick={() => setStatus("REFERENCED")}>In use</button><button type="button" className={status === "ORPHANED" ? styles.statusFilterActive : ""} onClick={() => setStatus("ORPHANED")}>Orphaned</button></div><Select compact searchable value={workspaceId} onChange={setWorkspaceId} ariaLabel="Filter storage by workspace" leadingIcon="users" className={styles.workspaceSelect} options={[{ value: "ALL", label: "All workspaces" }, ...workspaceOptions]} /><Select compact value={sort} onChange={(value) => setSort(value as StorageSort)} ariaLabel="Sort storage objects" leadingIcon="filter" className={styles.sortSelect} options={[{ value: "NEWEST", label: "Newest first" }, { value: "LARGEST", label: "Largest first" }, { value: "KEY", label: "Object key" }, { value: "WORKSPACE", label: "Workspace" }]} /></div>
          {selectableOrphans.length ? <div className={styles.selectionBar}><span>{selected.size ? `${selected.size} selected · ${formatBytes(selectedBytes)}` : `${selectableOrphans.length} visible orphan ${selectableOrphans.length === 1 ? "object" : "objects"}`}</span><div><Button variant="ghost" size="sm" onClick={selectVisibleOrphans}>Select visible orphans</Button>{selected.size ? <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear selection</Button> : null}</div></div> : null}
          {filteredObjects.length ? <div className="data-table-wrap"><table className={`data-table ${styles.objectTable}`}><thead><tr><th className={styles.checkCell}></th><th>Object</th><th>Workspace</th><th>State</th><th>Size</th><th>Modified</th><th /></tr></thead><tbody>{filteredObjects.map((object) => <tr key={object.key}><td className={styles.checkCell}>{!object.referenced ? <input type="checkbox" checked={selected.has(object.key)} onChange={() => toggleSelected(object.key)} aria-label={`Select ${object.key}`} /> : null}</td><td><div className={styles.objectCell}><strong title={object.key}>{object.key.split("/").at(-1) || object.key}</strong><span title={object.key}>{object.key}</span></div></td><td>{object.workspace ? <div className="table-primary"><strong>{object.workspace.name}</strong><small>{object.workspace.organization.shortName || object.workspace.organization.name}</small></div> : <span className={styles.muted}>Unassigned</span>}</td><td><Badge tone={object.referenced ? "success" : "warning"}>{object.referenced ? "In use" : "Orphaned"}</Badge></td><td>{formatBytes(object.size)}</td><td>{object.lastModified ? formatDate(object.lastModified) : "—"}</td><td className={styles.actionCell}><CopyButton value={object.key} label="Copy key" variant="ghost" /></td></tr>)}</tbody></table></div> : <div className={styles.emptyWrap}><EmptyState icon="search" title="No storage objects match" copy="Try clearing a filter or changing your search." action={hasFilters ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined} /></div>}
        </section>

        {activity.length ? <section className={`panel ${styles.activityPanel}`}><div className={styles.sectionHeader}><div><span className="section-kicker">Cleanup history</span><h2>Recent storage administration</h2></div></div><div className={styles.activityList}>{activity.slice(0, 10).map((item) => <div className={styles.activityRow} key={item.id}><div><strong>{prettyAction(item.action)}</strong><span>{item.actor.firstName} {item.actor.lastName}</span></div><time>{formatDate(item.createdAt)}</time></div>)}</div></section> : null}
      </> : null}

      <Modal open={deleteOpen} onClose={() => { if (!busy) setDeleteOpen(false); }} title="Delete orphaned storage objects" subtitle="The API will verify that every object is still unreferenced immediately before deletion." footer={<><Button variant="secondary" disabled={busy} onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" disabled={busy || !selected.size} onClick={() => void deleteSelected()}>{busy ? "Deleting…" : `Delete ${selected.size} objects`}</Button></>}><div className="form-alert form-alert-error">Only objects that are not referenced by Biddly can be deleted. Referenced objects are automatically skipped even if they were selected from stale data.</div><div className={styles.deleteSummary}><strong>{selected.size} objects</strong><span>{formatBytes(selectedBytes)}</span></div></Modal>

      <Modal open={cleanupOpen} onClose={() => { if (!busy) setCleanupOpen(false); }} title="Clean orphaned storage" subtitle={workspaceId === "ALL" ? "Clean safe orphans across all workspaces." : "Clean safe orphans in the selected workspace only."} footer={<><Button variant="secondary" disabled={busy} onClick={() => setCleanupOpen(false)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={() => void cleanup()}>{busy ? "Cleaning…" : "Delete safe orphans"}</Button></>}><Field label="Only delete objects older than"><div className={styles.daysInput}><Input type="number" min="0" max="3650" value={cleanupDays} onChange={(event) => setCleanupDays(event.target.value)} /><span>days</span></div></Field><div className="form-alert">A live database reference check is performed before deletion. A value of 7 days provides a buffer for interrupted upload flows.</div></Modal>
    </AppShell>
  );
}

function SummaryItem({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "warning" | "danger" }) { return <div className={`${styles.summaryItem} ${tone !== "neutral" ? styles[`summary${capitalize(tone)}`] : ""}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function formatBytes(bytes: number) { if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); const value = bytes / 1024 ** index; return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function prettyAction(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase()); }
