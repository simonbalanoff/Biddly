"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthLayout } from "../../components/auth-layout";
import { Button, Field, Input } from "../../components/ui";
import { getStoredSession } from "../../lib/api";
import { useAuth } from "../../providers/auth-provider";

export default function LoginPage() {
    const router = useRouter();
    const { context, loading, login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!loading && getStoredSession() && context) {
            router.replace(context.membership?.role === "MEMBER" && context.user.platformRole !== "PLATFORM_ADMIN" ? "/candidates" : "/dashboard");
        }
    }, [context, loading, router]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setBusy(true);

        try {
            const next = await login(email, password);
            router.replace(next.membership?.role === "MEMBER" && next.user.platformRole !== "PLATFORM_ADMIN" ? "/candidates" : "/dashboard");
        } catch (caught) {
            setError(
                caught instanceof Error ? caught.message : "Unable to sign in",
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthLayout>
            <div className="auth-heading">
                <span className="auth-kicker-dark">Welcome back</span>
                <h1>Sign in to Biddly</h1>
                <p>
                    Access your chapter workspace and continue where you left
                    off.
                </p>
            </div>

            <form className="auth-form" onSubmit={submit}>
                <Field label="Email address">
                    <Input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@school.edu"
                        required
                    />
                </Field>

                <Field label="Password">
                    <Input
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="••••••••••••"
                        required
                    />
                </Field>

                {error ? (
                    <div className="form-alert form-alert-error">{error}</div>
                ) : null}

                <Button type="submit" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                </Button>
            </form>

            <div className="auth-links">
                <Link href="/forgot-password">Forgot your password?</Link>
                <span>
                    New to Biddly? Use your chapter invitation link to get
                    started.
                </span>
            </div>
        </AuthLayout>
    );
}
