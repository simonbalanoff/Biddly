"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthLayout } from "../../components/auth-layout";
import { Button, Field, Input } from "../../components/ui";
import { publicApiRequest } from "../../lib/api";

export default function ResetPasswordClient({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    setError("");
    try {
      await publicApiRequest("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reset password");
    } finally {
      setBusy(false);
    }
  };

  return <AuthLayout>{done ? <div className="success-panel"><div className="success-check">✓</div><h3>Password updated</h3><p>You can now sign in with your new password.</p><Link href="/login" className="button button-primary button-md">Continue to sign in</Link></div> : <><div className="auth-heading"><span className="auth-kicker-dark">Choose a new password</span><h1>Reset password</h1><p>Use at least 10 characters so the account stays secure.</p></div><form className="auth-form" onSubmit={submit}><Field label="New password"><Input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></Field><Field label="Confirm password"><Input type="password" minLength={10} value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></Field>{error ? <div className="form-alert form-alert-error">{error}</div> : null}<Button type="submit" disabled={busy || !token}>{busy ? "Updating…" : "Update password"}</Button></form></>}</AuthLayout>;
}
