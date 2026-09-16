"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthLayout } from "../../components/auth-layout";
import { Button, Field, Input } from "../../components/ui";
import { publicApiRequest } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [debugUrl, setDebugUrl] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await publicApiRequest<{ accepted: boolean; debugResetUrl?: string }>("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) });
      setDebugUrl(result.debugResetUrl ?? "");
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout asideTitle="Access should be simple, not fragile." asideCopy="Chapter access stays invitation-based, while password recovery remains straightforward for members.">
      <div className="auth-heading"><span className="auth-kicker-dark">Account recovery</span><h1>Reset your password</h1><p>Enter your account email and we’ll send a reset link when email delivery is configured.</p></div>
      {sent ? (
        <div className="success-panel"><div className="success-check">✓</div><h3>Check your email</h3><p>If an account exists for <strong>{email}</strong>, a reset link has been created.</p>{debugUrl ? <a href={debugUrl} className="button button-secondary button-md">Open local reset link</a> : null}</div>
      ) : (
        <form className="auth-form" onSubmit={submit}><Field label="Email address"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.edu" required /></Field><Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button></form>
      )}
      <div className="auth-links"><Link href="/login">Back to sign in</Link></div>
    </AuthLayout>
  );
}
