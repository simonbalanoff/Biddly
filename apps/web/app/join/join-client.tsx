"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Field, Input, Spinner } from "../../components/ui";
import { publicApiRequest, setStoredSession } from "../../lib/api";
import type { Role, Session } from "../../lib/types";
import { useAuth } from "../../providers/auth-provider";
import styles from "./join.module.css";

type Invite = {
    email?: string | null;
    label?: string | null;
    role: Role;
    expiresAt?: string | null;
    maxUses?: number | null;
    useCount: number;
    chapter: {
        id: string;
        name: string;
        organization: {
            name: string;
            shortName?: string | null;
            primaryColor?: string | null;
            secondaryColor?: string | null;
            accentColor?: string | null;
            logoUrl?: string | null;
            crestUrl?: string | null;
        };
        university: { name: string; shortName?: string | null };
        branding?: {
            primaryColor?: string | null;
            secondaryColor?: string | null;
            accentColor?: string | null;
            logoUrl?: string | null;
            crestUrl?: string | null;
        } | null;
    };
};

const DEFAULT_PRIMARY = "#2563eb";
const DEFAULT_SECONDARY = "#eff6ff";
const DEFAULT_ACCENT = "#60a5fa";

export default function JoinClient({ token }: { token: string }) {
    const router = useRouter();
    const { refreshContext } = useAuth();
    const [invite, setInvite] = useState<Invite | null>(null);
    const [email, setEmail] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!token) {
            setError("This invitation link is incomplete.");
            setLoading(false);
            return;
        }

        publicApiRequest<Invite>(
            `/auth/chapter-invites/${encodeURIComponent(token)}`,
        )
            .then((data) => {
                setInvite(data);
                setEmail(data.email ?? "");
            })
            .catch((caught) =>
                setError(
                    caught instanceof Error
                        ? caught.message
                        : "Unable to load invitation",
                ),
            )
            .finally(() => setLoading(false));
    }, [token]);

    const theme = useMemo(() => {
        const primary = normalizeColor(
            invite?.chapter.branding?.primaryColor ??
                invite?.chapter.organization.primaryColor,
            DEFAULT_PRIMARY,
        );

        const secondary = normalizeColor(
            invite?.chapter.branding?.secondaryColor ??
                invite?.chapter.organization.secondaryColor,
            DEFAULT_SECONDARY,
        );

        const accent = normalizeColor(
            invite?.chapter.branding?.accentColor ??
                invite?.chapter.organization.accentColor,
            DEFAULT_ACCENT,
        );

        return {
            primary,
            secondary,
            accent,
            onPrimary: readableTextColor(primary),
            onAccent: readableTextColor(accent),
        };
    }, [invite]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError("");

        try {
            const result = await publicApiRequest<{ session: Session }>(
                "/auth/chapter-invites/accept",
                {
                    method: "POST",
                    body: JSON.stringify({
                        token,
                        email,
                        firstName,
                        lastName,
                        password,
                    }),
                },
            );
            setStoredSession(result.session);
            await refreshContext();
            router.replace("/dashboard");
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : "Unable to accept invitation",
            );
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.loading}>
                <Spinner />
                <span>Loading chapter invitation…</span>
            </div>
        );
    }

    if (!invite) {
        return (
            <main className={styles.invalidPage}>
                <div className={styles.invalidCard}>
                    <div className={styles.biddlyWordmark}>Biddly</div>
                    <h1>Invitation unavailable</h1>
                    <p>
                        {error ||
                            "This chapter invitation could not be loaded. It may have expired or been revoked."}
                    </p>
                </div>
            </main>
        );
    }

    const branding = invite.chapter.branding;

    const markUrl =
        branding?.crestUrl ||
        branding?.logoUrl ||
        invite.chapter.organization.crestUrl ||
        invite.chapter.organization.logoUrl ||
        null;
    const organizationName =
        invite.chapter.organization.shortName ||
        invite.chapter.organization.name;
    const universityName =
        invite.chapter.university.shortName || invite.chapter.university.name;
    const remainingUses =
        invite.maxUses === null
            ? null
            : Math.max(0, invite.maxUses == undefined ? 0 : invite.maxUses - invite.useCount);

    return (
        <main
            className={styles.page}
            style={
                {
                    "--invite-primary": theme.primary,
                    "--invite-secondary": theme.secondary,
                    "--invite-accent": theme.accent,
                    "--invite-on-primary": theme.onPrimary,
                    "--invite-on-accent": theme.onAccent,
                } as React.CSSProperties
            }
        >
            <section className={styles.formPanel}>
                <div className={styles.topbar}>
                    <span className={styles.biddlyWordmark}>Biddly</span>
                    <span className={styles.topbarDivider} />
                    <span className={styles.topbarChapter}>
                        {invite.chapter.name}
                    </span>
                </div>

                <div className={styles.formWrap}>
                    <div className={styles.mobileIdentity}>
                        <ChapterMark
                            markUrl={markUrl}
                            chapterName={invite.chapter.name}
                        />
                        <div>
                            <strong>{invite.chapter.name}</strong>
                            <span>
                                {organizationName} · {universityName}
                            </span>
                        </div>
                    </div>

                    <div className={styles.heading}>
                        <span className={styles.eyebrow}>
                            Chapter invitation
                        </span>
                        <h1>Join {invite.chapter.name}</h1>
                        <p>
                            Create your Biddly account to enter this
                            chapter&apos;s private recruitment workspace.
                        </p>
                    </div>

                    <div className={styles.inviteSummary}>
                        <Badge tone="neutral">{formatRole(invite.role)}</Badge>
                        {invite.label ? <span>{invite.label}</span> : null}
                        {remainingUses !== null ? (
                            <span>
                                {remainingUses}{" "}
                                {remainingUses === 1 ? "use" : "uses"} remaining
                            </span>
                        ) : (
                            <span>Reusable invite</span>
                        )}
                    </div>

                    <form className={styles.form} onSubmit={submit}>
                        <Field
                            label="Email address"
                            hint={
                                invite.email
                                    ? "This invitation is restricted to this email address."
                                    : "Use the email you want associated with your Biddly account."
                            }
                        >
                            <Input
                                type="email"
                                value={email}
                                onChange={(event) =>
                                    setEmail(event.target.value)
                                }
                                disabled={Boolean(invite.email)}
                                required
                            />
                        </Field>

                        <div className={styles.nameGrid}>
                            <Field label="First name">
                                <Input
                                    value={firstName}
                                    onChange={(event) =>
                                        setFirstName(event.target.value)
                                    }
                                    autoComplete="given-name"
                                    required
                                />
                            </Field>
                            <Field label="Last name">
                                <Input
                                    value={lastName}
                                    onChange={(event) =>
                                        setLastName(event.target.value)
                                    }
                                    autoComplete="family-name"
                                    required
                                />
                            </Field>
                        </div>

                        <Field
                            label="Create password"
                            hint="Use at least 10 characters."
                        >
                            <Input
                                type="password"
                                minLength={10}
                                value={password}
                                onChange={(event) =>
                                    setPassword(event.target.value)
                                }
                                autoComplete="new-password"
                                required
                            />
                        </Field>

                        {error ? (
                            <div className="form-alert form-alert-error">
                                {error}
                            </div>
                        ) : null}

                        <Button
                            type="submit"
                            className={styles.submit}
                            disabled={busy || !email.trim()}
                        >
                            {busy
                                ? "Joining chapter…"
                                : "Create account & join chapter"}
                        </Button>
                    </form>

                    <p className={styles.privacy}>
                        Your account will only belong to this chapter workspace.
                    </p>
                </div>

                <div className={styles.footer}>
                    Biddly · Recruitment operations for Greek life
                </div>
            </section>

            <aside className={styles.chapterPanel}>
                <div className={styles.accentBar} />
                <div className={styles.chapterPanelInner}>
                    <ChapterMark
                        markUrl={markUrl}
                        chapterName={invite.chapter.name}
                        large
                    />
                    <span className={styles.chapterKicker}>
                        {organizationName}
                    </span>
                    <h2>{invite.chapter.name}</h2>
                    <p>{invite.chapter.university.name}</p>

                    <div className={styles.chapterCard}>
                        <span>You&apos;ve been invited to join</span>
                        <strong>
                            {invite.chapter.name}&apos;s recruitment workspace
                        </strong>
                        <p>
                            Once you create your account, you&apos;ll go
                            directly into the chapter&apos;s active recruitment
                            cycle.
                        </p>
                    </div>
                </div>
            </aside>
        </main>
    );
}

function ChapterMark({
    markUrl,
    chapterName,
    large = false,
}: {
    markUrl: string | null;
    chapterName: string;
    large?: boolean;
}) {
    return (
        <div
            className={`${styles.chapterMark} ${large ? styles.chapterMarkLarge : ""}`}
        >
            {markUrl ? (
                <img src={markUrl} alt={`${chapterName} crest`} />
            ) : (
                <span>{chapterInitials(chapterName)}</span>
            )}
        </div>
    );
}

function formatRole(role: Role) {
    if (role === "CHAPTER_ADMIN") return "Chapter admin";
    if (role === "MODERATOR") return "Moderator";
    return "Member";
}

function chapterInitials(name: string) {
    return (
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("") || "B"
    );
}

function normalizeColor(value: string | null | undefined, fallback: string) {
    if (!value) return fallback;
    const trimmed = value.trim();
    return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback;
}

function readableTextColor(hex: string) {
    const value = hex.replace("#", "");
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    return luminance > 0.63 ? "#101828" : "#ffffff";
}
