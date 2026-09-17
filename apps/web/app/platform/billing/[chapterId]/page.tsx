"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Breadcrumbs, PageHeader } from "../../../../components/app-shell";
import { Icon } from "../../../../components/icons";
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Spinner } from "../../../../components/ui";
import { apiRequest } from "../../../../lib/api";
import type { BillingTerm, PlatformBillingDetail } from "../../../../lib/billing-types";
import { useAuth } from "../../../../providers/auth-provider";
import styles from "./detail.module.css";

export default function PlatformBillingDetailPage() {
  const params = useParams<{ chapterId: string }>();
  const { context } = useAuth();
  const [data, setData] = useState<PlatformBillingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [planOpen, setPlanOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [cancelNowOpen, setCancelNowOpen] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<BillingTerm>("SEMESTER");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await apiRequest<PlatformBillingDetail>(`/platform/billing/${params.chapterId}`);
      setData(next);
      setCustomerName(next.customer?.name || "");
      setCustomerEmail(next.customer?.email || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Stripe billing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (context?.user.platformRole === "PLATFORM_ADMIN") void load();
  }, [context?.user.platformRole, params.chapterId]);

  const run = async (key: string, path: string, init: RequestInit = {}, success?: string) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const next = await apiRequest<PlatformBillingDetail>(path, init);
      setData(next);
      if (success) setNotice(success);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update Stripe billing");
      return false;
    } finally {
      setBusy("");
    }
  };

  const createCheckout = async () => {
    if (!data) return;
    setBusy("checkout");
    setError("");
    setCheckoutUrl("");
    try {
      const result = await apiRequest<{ url: string | null }>(`/platform/billing/${data.chapter.id}/checkout`, { method: "POST", body: JSON.stringify({ term: selectedTerm }) });
      if (!result.url) throw new Error("Stripe did not return a checkout URL");
      setCheckoutUrl(result.url);
      setNotice("Stripe checkout link created. Send it to the chapter administrator to complete payment.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create Stripe checkout");
    } finally {
      setBusy("");
    }
  };

  const current = data?.currentSubscription ?? null;
  const selectedPlan = useMemo(() => data?.plans.find((plan) => plan.term === selectedTerm) ?? null, [data?.plans, selectedTerm]);

  if (context?.user.platformRole !== "PLATFORM_ADMIN") return <AppShell><div className="panel panel-spacious"><EmptyState icon="shield" title="Platform access required" copy="This page is only available to Biddly platform administrators." /></div></AppShell>;
  if (loading && !data) return <AppShell><div className="detail-loading"><Spinner /><span>Syncing Stripe billing…</span></div></AppShell>;
  if (!data) return <AppShell><Breadcrumbs items={[{ label: "Billing", href: "/platform/billing" }, { label: "Workspace" }]} /><div className="panel panel-spacious"><EmptyState icon="billing" title="Billing record unavailable" copy={error || "This workspace could not be loaded."} /></div></AppShell>;

  return <AppShell>
    <Breadcrumbs items={[{ label: "Billing", href: "/platform/billing" }, { label: data.chapter.name }]} />
    <PageHeader eyebrow={`${data.chapter.organization.shortName || data.chapter.organization.name} · ${data.chapter.university.shortName || data.chapter.university.name}`} title={data.chapter.name} description="Stripe customer, subscription, invoices, and support actions for this workspace." actions={<><Link href={`/platform/chapters/${data.chapter.id}`} className="button button-secondary button-md">Workspace</Link><Button variant="secondary" icon="activity" disabled={Boolean(busy)} onClick={() => void run("sync", `/platform/billing/${data.chapter.id}/sync`, { method: "POST" }, "Stripe state reconciled with Biddly.")}>{busy === "sync" ? "Syncing…" : "Sync Stripe"}</Button></>} />

    {data.testMode ? <div className="form-alert page-alert">Stripe test mode is active.</div> : null}
    {data.stripeError ? <div className="form-alert form-alert-error page-alert">Stripe sync issue: {data.stripeError}</div> : null}
    {error ? <div className="form-alert form-alert-error page-alert">{error}</div> : null}
    {notice ? <div className="form-alert form-alert-success page-alert">{notice}</div> : null}

    <section className={styles.summary}>
      <Summary label="Billing status" value={current ? pretty(current.status) : "No subscription"} detail={current ? current.providerStatus ? `Stripe: ${pretty(current.providerStatus)}` : "Stripe subscription" : "No Stripe subscription attached"} tone={statusTone(current?.status)} />
      <Summary label="Plan" value={current ? termLabel(current.term) : "—"} detail={current ? `${formatMoney(current.unitAmount, current.currency)}${current.billingInterval ? ` / ${current.billingInterval}` : ""}` : "Checkout required"} />
      <Summary label="Renewal" value={current ? current.cancelAtPeriodEnd ? "Ending" : "Automatic" : "—"} detail={current ? `${current.cancelAtPeriodEnd ? "Ends" : "Renews"} ${formatDate(current.periodEnd)}` : "No billing period"} tone={current?.cancelAtPeriodEnd ? "warning" : "neutral"} />
      <Summary label="Customer" value={data.customer?.email || "Not attached"} detail={data.customer?.id || "No Stripe customer"} />
    </section>

    <div className={styles.grid}>
      <section className="panel">
        <div className="panel-header"><div><span className="section-kicker">Stripe customer</span><h2>Billing account</h2><p>Manage customer identity here. Payment methods stay inside Stripe.</p></div><Button variant="secondary" size="sm" disabled={!data.customer} onClick={() => setCustomerOpen(true)}>Edit customer</Button></div>
        <div className={styles.details}>
          <Detail label="Customer name" value={data.customer?.name || "Not provided"} />
          <Detail label="Billing email" value={data.customer?.email || "Not provided"} />
          <Detail label="Delinquent" value={data.customer?.delinquent ? "Yes" : "No"} attention={Boolean(data.customer?.delinquent)} />
          <Detail label="Stripe customer ID" value={data.customer?.id || "Not attached"} mono />
        </div>
        {data.dashboard.customer ? <div className={styles.panelFooter}><a className="button button-secondary button-sm" href={data.dashboard.customer} target="_blank" rel="noreferrer">Open customer in Stripe</a></div> : null}
      </section>

      <section className="panel">
        <div className="panel-header"><div><span className="section-kicker">Subscription</span><h2>Recurring billing</h2><p>All changes below are sent directly to Stripe.</p></div></div>
        {current ? <><div className={styles.details}>
          <Detail label="Plan" value={termLabel(current.term)} />
          <Detail label="Period" value={`${formatDate(current.periodStart)} – ${formatDate(current.periodEnd)}`} />
          <Detail label="Cancel at period end" value={current.cancelAtPeriodEnd ? "Yes" : "No"} />
          <Detail label="Last synced" value={current.lastSyncedAt ? formatDateTime(current.lastSyncedAt) : "Not yet"} />
          <Detail label="Stripe subscription ID" value={current.providerSubscriptionId || "—"} mono />
        </div><div className={styles.actionBar}>
          <Button variant="secondary" size="sm" onClick={() => { setSelectedTerm(current.term); setPlanOpen(true); }}>Change plan</Button>
          {current.cancelAtPeriodEnd ? <Button size="sm" disabled={Boolean(busy)} onClick={() => void run("resume", `/platform/billing/${data.chapter.id}/resume`, { method: "POST" }, "Automatic renewal restored in Stripe.")}>{busy === "resume" ? "Restoring…" : "Restore renewal"}</Button> : <Button variant="secondary" size="sm" disabled={Boolean(busy)} onClick={() => void run("cancel", `/platform/billing/${data.chapter.id}/cancel`, { method: "POST" }, "Cancellation scheduled at the end of the Stripe billing period.")}>{busy === "cancel" ? "Scheduling…" : "Cancel at renewal"}</Button>}
          <Button variant="danger" size="sm" onClick={() => { setCancelConfirm(""); setCancelNowOpen(true); }}>Cancel now</Button>
          {data.dashboard.subscription ? <a className="button button-ghost button-sm" href={data.dashboard.subscription} target="_blank" rel="noreferrer">Open in Stripe</a> : null}
        </div></> : <div className={styles.emptySubscription}><Icon name="billing" size={20} /><div><strong>No Stripe subscription</strong><span>Create a checkout link for the chapter administrator instead of manually creating a Biddly subscription record.</span></div><Button onClick={() => { setSelectedTerm("SEMESTER"); setCheckoutUrl(""); setCheckoutOpen(true); }}>Create checkout</Button></div>}
      </section>
    </div>

    <section className="panel">
      <div className="panel-header"><div><span className="section-kicker">Invoices</span><h2>Stripe billing history</h2><p>Recent invoices for this workspace's Stripe customer.</p></div></div>
      {data.invoices.length ? <div className={styles.invoices}>{data.invoices.map((invoice) => <div className={styles.invoice} key={invoice.id}><div><strong>{invoice.number || "Stripe invoice"}</strong><span>{formatDate(invoice.createdAt)} · {invoice.id}</span></div><div><strong>{formatMoney(invoice.amountPaid || invoice.amountDue, invoice.currency)}</strong><Badge tone={invoiceTone(invoice.status)}>{pretty(invoice.status)}</Badge></div><div>{invoice.hostedInvoiceUrl ? <a className="button button-secondary button-sm" href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">View</a> : null}{invoice.invoicePdf ? <a className="button button-ghost button-sm" href={invoice.invoicePdf} target="_blank" rel="noreferrer">PDF</a> : null}{invoice.dashboardUrl ? <a className="button button-ghost button-sm" href={invoice.dashboardUrl} target="_blank" rel="noreferrer">Stripe</a> : null}</div></div>)}</div> : <div className={styles.empty}><EmptyState icon="billing" title="No Stripe invoices yet" copy="Invoices will appear here after the chapter completes Stripe checkout or a billing cycle runs." /></div>}
    </section>

    <Modal open={planOpen} onClose={() => setPlanOpen(false)} title="Change Stripe plan" subtitle="This updates the live Stripe subscription, then syncs Biddly." footer={<><Button variant="secondary" onClick={() => setPlanOpen(false)}>Cancel</Button><Button disabled={Boolean(busy) || selectedTerm === current?.term} onClick={async () => { const ok = await run("plan", `/platform/billing/${data.chapter.id}/plan`, { method: "POST", body: JSON.stringify({ term: selectedTerm }) }, "Stripe plan updated."); if (ok) setPlanOpen(false); }}>{busy === "plan" ? "Updating…" : "Change plan"}</Button></>}>
      <div className={styles.modalStack}><Select value={selectedTerm} onChange={(value) => setSelectedTerm(value as BillingTerm)} options={data.plans.map((plan) => ({ value: plan.term, label: `${termLabel(plan.term)} · ${formatMoney(plan.unitAmount, plan.currency)}${plan.interval ? ` / ${plan.interval}` : ""}` }))} /><div className="form-alert">Stripe can reset the billing date or create an immediate charge when moving between different billing intervals. Review the resulting invoice after the change.</div>{selectedPlan ? <div className={styles.preview}><span>Selected plan</span><strong>{termLabel(selectedPlan.term)}</strong><small>{formatMoney(selectedPlan.unitAmount, selectedPlan.currency)}{selectedPlan.interval ? ` / ${selectedPlan.interval}` : ""}</small></div> : null}</div>
    </Modal>

    <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Create Stripe checkout" subtitle="Generate a secure checkout link for this chapter workspace." footer={<><Button variant="secondary" onClick={() => setCheckoutOpen(false)}>Close</Button><Button disabled={Boolean(busy)} onClick={() => void createCheckout()}>{busy === "checkout" ? "Creating…" : "Create checkout link"}</Button></>}>
      <div className={styles.modalStack}><Field label="Plan"><Select value={selectedTerm} onChange={(value) => setSelectedTerm(value as BillingTerm)} options={data.plans.map((plan) => ({ value: plan.term, label: `${termLabel(plan.term)} · ${formatMoney(plan.unitAmount, plan.currency)}` }))} /></Field>{checkoutUrl ? <div className={styles.checkoutResult}><Input readOnly value={checkoutUrl} /><div><Button variant="secondary" size="sm" onClick={() => void navigator.clipboard.writeText(checkoutUrl)}>Copy link</Button><a className="button button-ghost button-sm" href={checkoutUrl} target="_blank" rel="noreferrer">Open checkout</a></div></div> : null}</div>
    </Modal>

    <Modal open={customerOpen} onClose={() => setCustomerOpen(false)} title="Update Stripe customer" subtitle="Updates the customer identity in Stripe. It does not expose or change saved payment methods." footer={<><Button variant="secondary" onClick={() => setCustomerOpen(false)}>Cancel</Button><Button disabled={Boolean(busy) || (!customerName.trim() && !customerEmail.trim())} onClick={async () => { const ok = await run("customer", `/platform/billing/${data.chapter.id}/customer`, { method: "PATCH", body: JSON.stringify({ name: customerName, email: customerEmail }) }, "Stripe customer updated."); if (ok) setCustomerOpen(false); }}>{busy === "customer" ? "Saving…" : "Save customer"}</Button></>}>
      <div className={styles.modalStack}><Field label="Customer name"><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></Field><Field label="Billing email"><Input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} /></Field></div>
    </Modal>

    <Modal open={cancelNowOpen} onClose={() => setCancelNowOpen(false)} title="Cancel subscription immediately" subtitle="This ends the Stripe subscription now rather than at the next renewal." footer={<><Button variant="secondary" onClick={() => setCancelNowOpen(false)}>Back</Button><Button variant="danger" disabled={Boolean(busy) || cancelConfirm !== "CANCEL NOW"} onClick={async () => { const ok = await run("cancel-now", `/platform/billing/${data.chapter.id}/subscription`, { method: "DELETE", body: JSON.stringify({ confirm: "CANCEL NOW" }) }, "Stripe subscription canceled immediately."); if (ok) setCancelNowOpen(false); }}>{busy === "cancel-now" ? "Canceling…" : "Cancel immediately"}</Button></>}>
      <div className={styles.modalStack}><div className="form-alert form-alert-error">This action takes effect immediately in Stripe. Use end-of-period cancellation unless support specifically requires an immediate stop.</div><Field label="Type CANCEL NOW to confirm"><Input value={cancelConfirm} onChange={(event) => setCancelConfirm(event.target.value)} autoComplete="off" /></Field></div>
    </Modal>
  </AppShell>;
}

function Summary({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "success" | "warning" | "danger" | "neutral" }) { return <div className={styles.summaryItem}><span>{label}</span><div><strong>{value}</strong>{tone !== "neutral" ? <Badge tone={tone}>{tone === "success" ? "Good" : tone === "danger" ? "Action" : "Notice"}</Badge> : null}</div><small>{detail}</small></div>; }
function Detail({ label, value, mono = false, attention = false }: { label: string; value: string; mono?: boolean; attention?: boolean }) { return <div className={styles.detail}><span>{label}</span><strong className={`${mono ? styles.mono : ""} ${attention ? styles.attention : ""}`}>{value}</strong></div>; }
function statusTone(status?: string): "success" | "warning" | "danger" | "neutral" { if (status === "ACTIVE" || status === "TRIAL") return "success"; if (status === "PAST_DUE") return "danger"; if (status === "CANCELED" || status === "EXPIRED") return "warning"; return "neutral"; }
function invoiceTone(status: string): "success" | "warning" | "danger" | "neutral" { if (status === "paid") return "success"; if (status === "open") return "warning"; if (status === "uncollectible") return "danger"; return "neutral"; }
function termLabel(term: string) { return term === "ACADEMIC_YEAR" ? "Academic year" : "Semester"; }
function pretty(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function formatDateTime(value: string) { return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
function formatMoney(amount: number | null, currency: string | null) { if (amount === null) return "Price unavailable"; try { return new Intl.NumberFormat(undefined, { style: "currency", currency: (currency || "usd").toUpperCase() }).format(amount / 100); } catch { return `${(amount / 100).toFixed(2)} ${(currency || "USD").toUpperCase()}`; } }
