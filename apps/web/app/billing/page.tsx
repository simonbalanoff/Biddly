"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "../../components/app-shell";
import { Icon } from "../../components/icons";
import { Badge, Button, EmptyState, Modal, Select, Spinner } from "../../components/ui";
import { apiRequest } from "../../lib/api";
import type { BillingPlan, BillingTerm, ChapterBillingState } from "../../lib/billing-types";
import { useAuth } from "../../providers/auth-provider";
import styles from "./billing.module.css";

export default function BillingPage() {
  const { context, refreshContext } = useAuth();
  const [billing, setBilling] = useState<ChapterBillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<BillingTerm>("SEMESTER");

  const load = async (syncCheckout = true) => {
    setError("");
    try {
      if (syncCheckout && typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get("session_id");
        if (params.get("checkout") === "success" && sessionId) {
          setBusy("checkout");
          const state = await apiRequest<ChapterBillingState>("/chapter/billing/checkout/complete", { method: "POST", body: JSON.stringify({ sessionId }) });
          setBilling(state);
          await refreshContext();
          setMessage("Subscription activated and synced from Stripe.");
          window.history.replaceState({}, "", "/billing");
          return;
        }
        if (params.get("checkout") === "cancelled") {
          setMessage("Checkout was canceled. No subscription changes were made.");
          window.history.replaceState({}, "", "/billing");
        }
      }
      setBilling(await apiRequest<ChapterBillingState>("/chapter/billing"));
      await refreshContext();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load billing");
    } finally {
      setLoading(false);
      setBusy("");
    }
  };

  useEffect(() => {
    if (context?.membership?.role === "CHAPTER_ADMIN") void load();
  }, [context?.membership?.role]);

  const run = async (key: string, path: string, body?: unknown, success?: string) => {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      const next = await apiRequest<ChapterBillingState>(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      setBilling(next);
      await refreshContext();
      if (success) setMessage(success);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update billing");
      return false;
    } finally {
      setBusy("");
    }
  };

  const startCheckout = async (term: BillingTerm) => {
    setBusy(`checkout-${term}`);
    setError("");
    try {
      const result = await apiRequest<{ url: string | null }>("/chapter/billing/checkout", { method: "POST", body: JSON.stringify({ term }) });
      if (!result.url) throw new Error("Stripe did not return a checkout URL");
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start Stripe checkout");
      setBusy("");
    }
  };

  const openPortal = async () => {
    setBusy("portal");
    setError("");
    try {
      const result = await apiRequest<{ url: string }>("/chapter/billing/portal", { method: "POST" });
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open Stripe billing portal");
      setBusy("");
    }
  };

  const current = billing?.currentSubscription ?? null;
  const selectedPlan = useMemo(() => billing?.plans.find((plan) => plan.term === selectedTerm) ?? null, [billing?.plans, selectedTerm]);

  if (context?.membership?.role !== "CHAPTER_ADMIN") return <AppShell><div className="panel panel-spacious"><EmptyState icon="billing" title="Chapter administrator access required" copy="Only chapter administrators can manage the workspace subscription." /></div></AppShell>;
  if (loading) return <AppShell><div className="detail-loading"><Spinner /><span>Loading billing…</span></div></AppShell>;

  return <AppShell>
    <PageHeader eyebrow="Workspace billing" title="Subscription" description="Manage your Biddly plan, payment details, invoices, and renewal directly through Stripe." actions={<Button variant="secondary" icon="activity" disabled={Boolean(busy)} onClick={() => void run("sync", "/chapter/billing/sync", undefined, "Billing synced from Stripe.")}>{busy === "sync" ? "Syncing…" : "Sync Stripe"}</Button>} />

    {billing?.testMode ? <div className="form-alert page-alert">Stripe is connected in test mode. No live charges will be created.</div> : null}
    {billing?.stripeError ? <div className="form-alert form-alert-error page-alert">Stripe sync issue: {billing.stripeError}</div> : null}
    {error ? <div className="form-alert form-alert-error page-alert">{error}</div> : null}
    {message ? <div className="form-alert form-alert-success page-alert">{message}</div> : null}

    {!billing?.configured ? <div className="panel panel-spacious"><EmptyState icon="billing" title="Billing is not configured" copy="Biddly has not finished connecting Stripe for this environment yet." /></div> : current ? <>
      <section className={styles.hero}>
        <div className={styles.heroIcon}><Icon name="billing" size={22} /></div>
        <div className={styles.heroCopy}>
          <div className={styles.heroTitle}><h2>{termLabel(current.term)}</h2><Badge tone={statusTone(current.status)}>{statusLabel(current.status)}</Badge>{current.cancelAtPeriodEnd ? <Badge tone="warning">Ends at renewal</Badge> : null}</div>
          <p>{subscriptionDescription(current.status, current.cancelAtPeriodEnd)}</p>
          <div className={styles.heroMeta}><span><strong>{formatMoney(current.unitAmount, current.currency)}</strong>{current.billingInterval ? ` / ${current.billingInterval}` : ""}</span><span>{current.cancelAtPeriodEnd ? "Access through" : "Next renewal"} <strong>{formatDate(current.periodEnd)}</strong></span></div>
        </div>
        <div className={styles.heroActions}>
          <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void openPortal()}>{busy === "portal" ? "Opening…" : "Payment & billing details"}</Button>
          {current.cancelAtPeriodEnd ? <Button disabled={Boolean(busy)} onClick={() => void run("resume", "/chapter/billing/resume", undefined, "Automatic renewal restored.")}>{busy === "resume" ? "Restoring…" : "Keep subscription"}</Button> : <Button variant="danger" disabled={Boolean(busy)} onClick={() => setCancelOpen(true)}>Cancel renewal</Button>}
        </div>
      </section>

      {current.status === "PAST_DUE" ? <section className={styles.attention}><Icon name="activity" size={20} /><div><strong>Payment needs attention</strong><span>Stripe reports an incomplete or past-due payment. Update the payment method or pay the outstanding invoice to keep billing current.</span></div><Button size="sm" onClick={() => void openPortal()}>Fix payment</Button></section> : null}

      <div className={styles.grid}>
        <section className="panel">
          <div className="panel-header"><div><span className="section-kicker">Plan</span><h2>Subscription details</h2><p>Stripe is the source of truth for this workspace.</p></div><Button variant="secondary" size="sm" onClick={() => { setSelectedTerm(current.term); setChangePlanOpen(true); }}>Change plan</Button></div>
          <div className={styles.detailList}>
            <Detail label="Plan" value={termLabel(current.term)} />
            <Detail label="Stripe status" value={current.providerStatus ? pretty(current.providerStatus) : statusLabel(current.status)} />
            <Detail label="Current period" value={`${formatDate(current.periodStart)} – ${formatDate(current.periodEnd)}`} />
            <Detail label="Renewal" value={current.cancelAtPeriodEnd ? "Will not renew" : "Automatic"} />
            <Detail label="Last synced" value={current.lastSyncedAt ? formatDateTime(current.lastSyncedAt) : "Not synced yet"} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><span className="section-kicker">Account</span><h2>Billing contact</h2><p>Payment methods remain securely managed by Stripe.</p></div></div>
          <div className={styles.detailList}>
            <Detail label="Name" value={billing.customer?.name || "Not provided"} />
            <Detail label="Email" value={billing.customer?.email || "Not provided"} />
            <Detail label="Account" value={billing.customer?.delinquent ? "Payment issue" : "In good standing"} />
            <Detail label="Stripe customer" value={billing.customer?.id || "Not attached"} mono />
          </div>
        </section>
      </div>
    </> : <section className={styles.startCard}>
      <div><span className="section-kicker">Get started</span><h2>Choose a Biddly subscription</h2><p>Checkout, payment collection, receipts, and recurring billing are handled securely by Stripe.</p></div>
      <div className={styles.planGrid}>{billing?.plans.map((plan) => <PlanCard key={plan.term} plan={plan} busy={busy === `checkout-${plan.term}`} onChoose={() => void startCheckout(plan.term)} />)}</div>
    </section>}

    {billing?.invoices.length ? <section className="panel">
      <div className="panel-header"><div><span className="section-kicker">History</span><h2>Invoices</h2><p>Receipts and billing history from Stripe.</p></div></div>
      <div className={styles.invoiceList}>{billing.invoices.map((invoice) => <div className={styles.invoiceRow} key={invoice.id}><div><strong>{invoice.number || "Stripe invoice"}</strong><span>{formatDate(invoice.createdAt)}</span></div><div className={styles.invoiceAmount}><strong>{formatMoney(invoice.amountPaid || invoice.amountDue, invoice.currency)}</strong><Badge tone={invoiceTone(invoice.status)}>{pretty(invoice.status)}</Badge></div><div className={styles.invoiceActions}>{invoice.hostedInvoiceUrl ? <a className="button button-secondary button-sm" href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">View</a> : null}{invoice.invoicePdf ? <a className="button button-ghost button-sm" href={invoice.invoicePdf} target="_blank" rel="noreferrer">PDF</a> : null}</div></div>)}</div>
    </section> : null}

    <Modal open={changePlanOpen} onClose={() => setChangePlanOpen(false)} title="Change subscription plan" subtitle="The change is made directly in Stripe and then synced back to Biddly." footer={<><Button variant="secondary" onClick={() => setChangePlanOpen(false)}>Cancel</Button><Button disabled={Boolean(busy) || selectedTerm === current?.term} onClick={async () => { const ok = await run("plan", "/chapter/billing/plan", { term: selectedTerm }, "Subscription plan updated in Stripe."); if (ok) setChangePlanOpen(false); }}>{busy === "plan" ? "Updating…" : "Change plan"}</Button></>}>
      <div className={styles.modalStack}><Select value={selectedTerm} onChange={(value) => setSelectedTerm(value as BillingTerm)} options={(billing?.plans ?? []).map((plan) => ({ value: plan.term, label: `${termLabel(plan.term)} · ${formatMoney(plan.unitAmount, plan.currency)}${plan.interval ? ` / ${plan.interval}` : ""}` }))} /><div className="form-alert">Changing between different Stripe billing intervals can reset the billing date and may create an immediate charge. Stripe determines the final billing behavior.</div>{selectedPlan ? <div className={styles.planPreview}><span>New plan</span><strong>{termLabel(selectedPlan.term)}</strong><small>{formatMoney(selectedPlan.unitAmount, selectedPlan.currency)}{selectedPlan.interval ? ` / ${selectedPlan.interval}` : ""}</small></div> : null}</div>
    </Modal>

    <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel automatic renewal" subtitle="Your workspace keeps its paid access through the end of the current Stripe billing period." footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep subscription</Button><Button variant="danger" disabled={Boolean(busy)} onClick={async () => { const ok = await run("cancel", "/chapter/billing/cancel", undefined, "Automatic renewal canceled."); if (ok) setCancelOpen(false); }}>{busy === "cancel" ? "Canceling…" : "Cancel renewal"}</Button></>}>
      <p className="modal-copy">The subscription will remain active through <strong>{current ? formatDate(current.periodEnd) : "the current period"}</strong>. You can restore automatic renewal any time before then.</p>
    </Modal>
  </AppShell>;
}

function PlanCard({ plan, busy, onChoose }: { plan: BillingPlan; busy: boolean; onChoose: () => void }) {
  return <div className={styles.planCard}><div><Badge tone="accent">{termLabel(plan.term)}</Badge><strong>{formatMoney(plan.unitAmount, plan.currency)}</strong><span>{plan.interval ? `per ${plan.intervalCount && plan.intervalCount > 1 ? `${plan.intervalCount} ${plan.interval}s` : plan.interval}` : "Recurring subscription"}</span></div><Button disabled={!plan.active || busy} onClick={onChoose}>{busy ? "Opening Stripe…" : "Choose plan"}</Button></div>;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className={styles.detail}><span>{label}</span><strong className={mono ? styles.mono : undefined}>{value}</strong></div>;
}

function termLabel(term: BillingTerm) {
  return term === "ACADEMIC_YEAR" ? "Academic year" : "Semester";
}

function statusLabel(status: string) {
  return pretty(status);
}

function pretty(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "ACTIVE" || status === "TRIAL") return "success";
  if (status === "PAST_DUE") return "danger";
  if (status === "CANCELED" || status === "EXPIRED") return "warning";
  return "neutral";
}

function invoiceTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "paid") return "success";
  if (status === "open") return "warning";
  if (status === "uncollectible") return "danger";
  return "neutral";
}

function subscriptionDescription(status: string, cancelAtPeriodEnd: boolean) {
  if (cancelAtPeriodEnd) return "Automatic renewal is off. Your current paid access remains active through the end of this billing period.";
  if (status === "PAST_DUE") return "Stripe needs payment attention for this subscription.";
  if (status === "TRIAL") return "Your Stripe trial is active.";
  return "Your subscription is active and renews automatically through Stripe.";
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null) return "Price unavailable";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: (currency || "usd").toUpperCase() }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${(currency || "USD").toUpperCase()}`;
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
