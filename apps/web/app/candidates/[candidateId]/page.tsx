"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, Breadcrumbs } from "../../../components/app-shell";
import { Icon } from "../../../components/icons";
import { Badge, Button, EmptyState, Modal, Score, Select, Spinner, StatusDot, Textarea } from "../../../components/ui";
import { apiRequest } from "../../../lib/api";
import type { Candidate, CandidateComment, RecruitmentCycle } from "../../../lib/types";
import { useAuth } from "../../../providers/auth-provider";
import threadStyles from "./discussion.module.css";

export default function CandidateDetailPage() {
  const params = useParams<{ candidateId: string }>();
  const router = useRouter();
  const { context } = useAuth();
  const candidateId = params.candidateId;
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [cycle, setCycle] = useState<RecruitmentCycle | null>(null);
  const [comments, setComments] = useState<CandidateComment[]>([]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<number | null>(null);
  const [scoreBusy, setScoreBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const canManage = context?.membership?.role === "MODERATOR" || context?.membership?.role === "CHAPTER_ADMIN";
  const memberMode = context?.membership?.role === "MEMBER" && context.user.platformRole !== "PLATFORM_ADMIN";
  const settings = context?.chapter?.settings;
  const readOnlyHistory = Boolean(cycle && cycle.status !== "ACTIVE");
  const readOnlySubscription = context?.subscriptionAccess?.mode === "READ_ONLY";
  const readOnly = readOnlyHistory || readOnlySubscription;

  const loadComments = async () => {
    try {
      setComments(await apiRequest<CandidateComment[]>(`/candidates/${candidateId}/comments`));
    } catch {
      setComments([]);
    }
  };

  const load = async () => {
    try {
      const candidateData = await apiRequest<Candidate>(`/candidates/${candidateId}`);
      setCandidate(candidateData);
      setScore(candidateData.myEvaluation?.score ?? null);
      const cycleData = await apiRequest<RecruitmentCycle>(`/recruitment-cycles/${candidateData.recruitmentCycleId}`);
      setCycle(cycleData);
      await loadComments();
      if (candidateData.hasPhoto) {
        try {
          const photo = await apiRequest<{ url: string }>(`/candidates/${candidateId}/photo`);
          setPhotoUrl(photo.url);
        } catch {}
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load PNM");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!context) return;
    void load();
  }, [candidateId, context?.membership?.role]);

  const scoreMin = settings?.scoreMin ?? 1;
  const scoreMax = settings?.scoreMax ?? 10;
  const scoreStep = settings?.scoreStep ?? 1;
  const possibleScores = useMemo(() => {
    const values: number[] = [];
    if ((scoreMax - scoreMin) / scoreStep > 20) return values;
    for (let value = scoreMin; value <= scoreMax + scoreStep / 10; value += scoreStep) values.push(Number(value.toFixed(4)));
    return values;
  }, [scoreMin, scoreMax, scoreStep]);

  const saveScore = async (nextScore: number) => {
    setScore(nextScore);
    setScoreBusy(true);
    try {
      await apiRequest(`/candidates/${candidateId}/evaluations`, { method: "POST", body: JSON.stringify({ score: nextScore }) });
      const updated = await apiRequest<Candidate>(`/candidates/${candidateId}`);
      setCandidate(updated);
      await loadComments();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save score");
    } finally {
      setScoreBusy(false);
    }
  };

  const changeStatus = async (statusId: string) => {
    setStatusBusy(true);
    try {
      await apiRequest(`/candidates/${candidateId}/status`, { method: "PATCH", body: JSON.stringify({ statusId }) });
      await load();
    } finally {
      setStatusBusy(false);
    }
  };

  const toggleArchive = async () => {
    if (!candidate) return;
    setActionBusy(true);
    try {
      await apiRequest(`/candidates/${candidateId}/${candidate.archivedAt ? "restore" : "archive"}`, { method: "POST" });
      if (!candidate.archivedAt) router.replace("/candidates");
      else await load();
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) return <AppShell><div className="detail-loading"><Spinner /><span>Loading PNM…</span></div></AppShell>;
  if (!candidate) return <AppShell><div className="panel panel-spacious"><EmptyState title="PNM unavailable" copy={error || "This record could not be loaded."} action={<Link href="/candidates" className="button button-secondary button-md">Back to PNMs</Link>} /></div></AppShell>;

  if (memberMode) {
    const profileItems = (candidate.customValues ?? []).filter((item) => formatCustomValue(item.value) !== "Not provided");
    return (
      <AppShell>
        <div className="member-detail-page">
          <Link href="/candidates" className="member-detail-back"><Icon name="chevron" size={15} /><span>Back to PNMs</span></Link>

          <section className="member-detail-hero">
            <div className="member-detail-photo">{photoUrl ? <img src={photoUrl} alt={`${candidate.firstName} ${candidate.lastName}`} /> : <span>{candidate.firstName[0]}{candidate.lastName[0]}</span>}</div>
            <div className="member-detail-identity">
              <div className="member-detail-status"><StatusDot color={candidate.status.color} /><span>{candidate.status.name}</span></div>
              <h1>{candidate.firstName} {candidate.lastName}</h1>
              <p>Review their profile, add your rating, and share useful recruitment context with the chapter.</p>
            </div>
          </section>

          {error ? <div className="form-alert form-alert-error member-pnm-alert">{error}<button type="button" onClick={() => setError("")}>Dismiss</button></div> : null}

          <div className="member-detail-layout">
            <div className="member-detail-main">
              <section className="panel member-profile-panel">
                <div className="panel-header"><div><span className="section-kicker">Profile</span><h2>About {candidate.firstName}</h2></div></div>
                {profileItems.length ? <div className="member-profile-grid">{profileItems.map((item) => <ProfileItem key={item.id} label={item.field.label} value={formatCustomValue(item.value)} wide={item.field.type === "LONG_TEXT"} />)}</div> : <div className="member-profile-empty">No additional profile information has been added yet.</div>}
              </section>

              {settings?.commentsEnabled ? <Discussion candidateId={candidateId} comments={comments} setComments={setComments} repliesEnabled={Boolean(settings.repliesEnabled)} reactionsEnabled={Boolean(settings.reactionsEnabled)} canModerate={false} currentUserId={context.user.id} readOnly={readOnly} scoreMax={scoreMax} showAuthorScores={false} /> : <section className="panel"><EmptyState icon="message" title="Discussion is turned off" copy="Your chapter has disabled PNM comments for this recruitment cycle." /></section>}
            </div>

            <aside className="member-detail-side">
              <section className="panel member-rating-panel">
                <div className="member-rating-panel-heading"><span>Your rating</span><strong>{score !== null ? `${formatScore(score)} / ${formatScore(scoreMax)}` : "Not rated"}</strong></div>
                {possibleScores.length ? <div className="member-detail-score-buttons">{possibleScores.map((value) => <button type="button" key={value} disabled={scoreBusy} onClick={() => void saveScore(value)} className={score === value ? "score-button score-button-active" : "score-button"}>{formatScore(value)}</button>)}</div> : <div className="score-slider-wrap"><input type="range" min={scoreMin} max={scoreMax} step={scoreStep} value={score ?? scoreMin} onChange={(event) => setScore(Number(event.target.value))} onPointerUp={() => { if (score !== null) void saveScore(score); }} onKeyUp={() => { if (score !== null) void saveScore(score); }} /><strong>{score ?? "—"}</strong></div>}
                <div className="member-rating-panel-footer">{scoreBusy ? <><Spinner size={13} /><span>Saving rating…</span></> : score !== null ? <><Icon name="check" size={14} /><span>Your rating is saved</span></> : <span>Select a score to rate this PNM</span>}</div>
              </section>
              <div className="member-detail-note"><Icon name="message" size={17} /><div><strong>Keep the conversation useful</strong><span>Share specific interactions or context that helps the chapter make a better recruitment decision.</span></div></div>
            </aside>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Breadcrumbs items={readOnlyHistory && cycle ? [{ label: "Recruitment", href: "/recruitment" }, { label: cycle.name, href: `/recruitment/cycles/${cycle.id}` }, { label: "PNMs", href: `/candidates?cycleId=${cycle.id}` }, { label: `${candidate.firstName} ${candidate.lastName}` }] : [{ label: "PNMs", href: "/candidates" }, { label: `${candidate.firstName} ${candidate.lastName}` }]} />
      {readOnlyHistory ? <div className="history-notice"><Icon name="archive" size={16} /><div><strong>Historical record</strong><span>This PNM is being viewed from {cycle?.name}. Scores, status, discussion, and record actions are read-only.</span></div></div> : null}
      <section className="candidate-hero">
        <div className="candidate-hero-person">
          <div className="candidate-photo-large">{photoUrl ? <img src={photoUrl} alt={`${candidate.firstName} ${candidate.lastName}`} /> : <span>{candidate.firstName[0]}{candidate.lastName[0]}</span>}</div>
          <div className="candidate-hero-copy">
            <div className="candidate-title-row"><h1>{candidate.firstName} {candidate.lastName}</h1>{candidate.archivedAt ? <Badge>Archived</Badge> : null}</div>
            <div className="candidate-meta-line"><span><StatusDot color={candidate.status.color} />{candidate.status.name}</span>{candidate.email ? <a href={`mailto:${candidate.email}`}>{candidate.email}</a> : null}{candidate.phone ? <a href={`tel:${candidate.phone}`}>{formatPhone(candidate.phone)}</a> : null}</div>
          </div>
        </div>
        <div className="candidate-hero-score"><span>Chapter score</span><Score value={candidate.aggregate?.averageScore} max={scoreMax} count={candidate.aggregate?.evaluationCount ?? 0} large /></div>
      </section>

      {error ? <div className="form-alert form-alert-error page-alert">{error}<button type="button" onClick={() => setError("")}>Dismiss</button></div> : null}

      <div className="candidate-detail-grid">
        <div className="candidate-detail-main">
          <section className="panel score-panel">
            <div className="panel-header"><div><span className="section-kicker">Your evaluation</span><h2>{readOnly ? "Your submitted score" : "Score this PNM"}</h2></div>{!readOnly && scoreBusy ? <span className="saving-text"><Spinner size={14} /> Saving</span> : !readOnly && candidate.myEvaluation ? <span className="saved-text">Saved</span> : null}</div>
            {readOnly ? <div className="historical-score"><strong>{candidate.myEvaluation?.score ?? "—"}</strong><span>out of {scoreMax}</span></div> : possibleScores.length ? <div className="score-buttons">{possibleScores.map((value) => <button type="button" key={value} onClick={() => void saveScore(value)} className={score === value ? "score-button score-button-active" : "score-button"}>{value}</button>)}</div> : <div className="score-slider-wrap"><input type="range" min={scoreMin} max={scoreMax} step={scoreStep} value={score ?? scoreMin} onChange={(event) => setScore(Number(event.target.value))} onPointerUp={() => { if (score !== null) void saveScore(score); }} onKeyUp={() => { if (score !== null) void saveScore(score); }} /><strong>{score ?? "—"}</strong></div>}
            {!readOnly ? <div className="score-help"><span>{scoreMin} = lowest</span><span>{scoreMax} = highest</span></div> : null}
          </section>

          <section className="panel">
            <div className="panel-header"><div><span className="section-kicker">Profile</span><h2>PNM information</h2></div></div>
            <div className="profile-grid">
              <ProfileItem label="Email" value={candidate.email || "Not provided"} />
              <ProfileItem label="Phone" value={candidate.phone ? formatPhone(candidate.phone) : "Not provided"} />
              <ProfileItem label="Source" value={candidate.source === "PUBLIC_FORM" ? "Recruitment form" : candidate.source === "IMPORT" ? "Imported" : "Added manually"} />
              <ProfileItem label="Added" value={new Date(candidate.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })} />
              {candidate.customValues?.map((item) => <ProfileItem key={item.id} label={item.field.label} value={formatCustomValue(item.value)} wide={item.field.type === "LONG_TEXT"} />)}
            </div>
          </section>

          {settings?.commentsEnabled || canManage ? <Discussion candidateId={candidateId} comments={comments} setComments={setComments} repliesEnabled={Boolean(settings?.repliesEnabled)} reactionsEnabled={Boolean(settings?.reactionsEnabled)} canModerate={canManage} currentUserId={context?.user.id ?? ""} readOnly={readOnly} scoreMax={scoreMax} showAuthorScores /> : <section className="panel"><EmptyState icon="message" title="Discussion is turned off" copy="Your chapter has disabled PNM comments for this recruitment cycle." /></section>}
        </div>

        <aside className="candidate-detail-side">
          <section className="panel compact-panel">
            <div className="panel-header"><div><span className="section-kicker">Recruitment</span><h2>Status</h2></div></div>
            {canManage && !readOnly ? <Select compact className="candidate-status-select" value={candidate.statusId} disabled={statusBusy} onChange={(next) => void changeStatus(next)} options={(cycle?.statuses ?? []).map((status) => ({ value: status.id, label: status.name }))} /> : <div className="status-display"><StatusDot color={candidate.status.color} /><strong>{candidate.status.name}</strong></div>}
            <p className="panel-note">{readOnlyHistory ? "This status is preserved from the archived recruitment cycle." : readOnlySubscription ? "Status changes are disabled while the workspace is in read-only mode." : canManage ? "Changing status is recorded in the chapter audit history." : "Recruitment chairs and moderators manage pipeline status."}</p>
          </section>

          {candidate.statusHistory?.length ? <section className="panel compact-panel"><div className="panel-header"><div><span className="section-kicker">History</span><h2>Recent activity</h2></div></div><div className="timeline">{candidate.statusHistory.slice(0, 8).map((item) => <div className="timeline-item" key={item.id}><span className="timeline-dot" /><div><strong>{item.toStatus?.name ?? "Removed status"}</strong><span>{item.changedBy.firstName} {item.changedBy.lastName}</span><small>{new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></div></div>)}</div></section> : null}

          {canManage && !readOnly ? <section className="panel compact-panel danger-zone"><div><span className="section-kicker">Record</span><h2>{candidate.archivedAt ? "Restore PNM" : "Archive PNM"}</h2><p>{candidate.archivedAt ? "Restore this person to the active PNM list." : "Remove this person from normal recruitment views without deleting their history."}</p></div><Button variant={candidate.archivedAt ? "secondary" : "danger"} icon={candidate.archivedAt ? "archive" : "trash"} disabled={actionBusy} onClick={() => void toggleArchive()}>{candidate.archivedAt ? "Restore" : "Archive"}</Button></section> : null}
        </aside>
      </div>
    </AppShell>
  );
}

function ProfileItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`profile-item ${wide ? "profile-item-wide" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Discussion({ candidateId, comments, setComments, repliesEnabled, reactionsEnabled, canModerate, currentUserId, readOnly, scoreMax, showAuthorScores }: { candidateId: string; comments: CandidateComment[]; setComments: (comments: CandidateComment[]) => void; repliesEnabled: boolean; reactionsEnabled: boolean; canModerate: boolean; currentUserId: string; readOnly: boolean; scoreMax: number; showAuthorScores: boolean }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => setComments(await apiRequest<CandidateComment[]>(`/candidates/${candidateId}/comments`));

  const post = async (parentId: string | null, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await apiRequest(`/candidates/${candidateId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: trimmed, parentId })
    });
    await reload();
  };

  const postRoot = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await post(null, body);
      setBody("");
    } finally {
      setBusy(false);
    }
  };

  const react = async (commentId: string, emoji: string, active: boolean) => {
    await apiRequest(`/comments/${commentId}/reactions`, {
      method: active ? "DELETE" : "PUT",
      body: JSON.stringify({ emoji })
    });
    await reload();
  };

  const remove = async (commentId: string) => {
    await apiRequest(`/comments/${commentId}`, { method: "DELETE" });
    await reload();
  };

  const moderate = async (commentId: string, action: "HIDE" | "RESTORE" | "REMOVE") => {
    await apiRequest(`/comments/${commentId}/moderate`, {
      method: "POST",
      body: JSON.stringify({ action, reason: action === "RESTORE" ? null : "Moderated from PNM profile" })
    });
    await reload();
  };

  return (
    <section className={`panel discussion-panel ${threadStyles.discussionPanel}`}>
      <div className="panel-header">
        <div>
          <span className="section-kicker">Chapter feedback</span>
          <h2>Discussion</h2>
        </div>
        <Badge>{comments.length} {comments.length === 1 ? "thread" : "threads"}</Badge>
      </div>

      {!readOnly ? (
        <div className="comment-composer">
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add useful context for the chapter…" rows={3} />
          <div>
            <span>Keep feedback specific and recruitment-relevant.</span>
            <Button size="sm" disabled={busy || !body.trim()} onClick={() => void postRoot()}>{busy ? "Posting…" : "Post comment"}</Button>
          </div>
        </div>
      ) : null}

      {comments.length ? (
        <div className="comment-list">
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              depth={0}
              repliesEnabled={!readOnly && repliesEnabled}
              reactionsEnabled={!readOnly && reactionsEnabled}
              canModerate={!readOnly && canModerate}
              currentUserId={currentUserId}
              onReply={post}
              onReact={react}
              onDelete={remove}
              onModerate={moderate}
              scoreMax={scoreMax}
              showAuthorScores={showAuthorScores}
            />
          ))}
        </div>
      ) : (
        <div className="discussion-empty">{readOnly ? "No chapter feedback was recorded for this PNM." : "No chapter feedback yet. Add the first useful note."}</div>
      )}
    </section>
  );
}

const REACTION_CHOICES = ["👍", "❤️", "😂", "🔥", "💯", "👀", "🎉", "🙌", "🤝", "✅", "🤔", "⭐", "🚩", "😬", "👏", "💜"];

function CommentThread({ comment, depth, repliesEnabled, reactionsEnabled, canModerate, currentUserId, onReply, onReact, onDelete, onModerate, scoreMax, showAuthorScores }: { comment: CandidateComment; depth: number; repliesEnabled: boolean; reactionsEnabled: boolean; canModerate: boolean; currentUserId: string; onReply: (parentId: string, body: string) => Promise<void>; onReact: (commentId: string, emoji: string, active: boolean) => Promise<void>; onDelete: (commentId: string) => Promise<void>; onModerate: (commentId: string, action: "HIDE" | "RESTORE" | "REMOVE") => Promise<void>; scoreMax: number; showAuthorScores: boolean }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const reactionMenuRef = useRef<HTMLDivElement>(null);
  const reactionButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!reactionOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (reactionMenuRef.current?.contains(target) || reactionButtonRef.current?.contains(target)) return;
      setReactionOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [reactionOpen]);

  const groupedReactions = useMemo(() => {
    const grouped = new Map<string, { count: number; active: boolean }>();
    for (const reaction of comment.reactions ?? []) {
      const current = grouped.get(reaction.emoji) ?? { count: 0, active: false };
      current.count += 1;
      if (reaction.userId === currentUserId) current.active = true;
      grouped.set(reaction.emoji, current);
    }
    return Array.from(grouped.entries());
  }, [comment.reactions, currentUserId]);

  const submitReply = async () => {
    if (!replyBody.trim()) return;
    setReplyBusy(true);
    try {
      await onReply(comment.id, replyBody);
      setReplyBody("");
      setReplyOpen(false);
    } finally {
      setReplyBusy(false);
    }
  };

  const toggleReaction = async (emoji: string) => {
    const active = Boolean(comment.reactions?.some((reaction) => reaction.emoji === emoji && reaction.userId === currentUserId));
    setActionBusy(true);
    try {
      await onReact(comment.id, emoji, active);
      setReactionOpen(false);
    } finally {
      setActionBusy(false);
    }
  };

  const deleteComment = async () => {
    setActionBusy(true);
    try {
      await onDelete(comment.id);
      setDeleteOpen(false);
    } finally {
      setActionBusy(false);
    }
  };

  const moderateComment = async (action: "HIDE" | "RESTORE" | "REMOVE") => {
    setActionBusy(true);
    try {
      await onModerate(comment.id, action);
    } finally {
      setActionBusy(false);
    }
  };

  const isVisible = comment.state === "VISIBLE";
  const isOwn = comment.userId === currentUserId;
  const hasReplies = Boolean(comment.replies?.length);
  const itemLabel = depth > 0 ? "reply" : "comment";

  return (
    <article className={`comment-thread ${depth > 0 ? threadStyles.nestedThread : ""}`}>
      <div className={depth > 0 ? "reply" : "comment-main"}>
        <div className={`comment-avatar ${depth > 0 ? "comment-avatar-small" : ""}`}>{comment.user.firstName[0]}{comment.user.lastName[0]}</div>
        <div className="comment-content">
          <div className="comment-header">
            <strong>{comment.user.firstName} {comment.user.lastName}</strong>
            {showAuthorScores && comment.authorScore !== null && comment.authorScore !== undefined ? <span className={threadStyles.authorScore}>Rated {formatScore(comment.authorScore)} / {formatScore(scoreMax)}</span> : null}
            <span>{timeAgo(comment.createdAt)}</span>
            {!isVisible ? <Badge tone="warning">{comment.state.toLowerCase()}</Badge> : null}
          </div>

          <p>{comment.body}</p>

          <div className="comment-actions">
            {reactionsEnabled && isVisible ? (
              <div className={threadStyles.reactionArea}>
                {groupedReactions.map(([emoji, reaction]) => (
                  <button
                    key={emoji}
                    type="button"
                    className={reaction.active ? "reaction reaction-active" : "reaction"}
                    disabled={actionBusy}
                    onClick={() => void toggleReaction(emoji)}
                  >
                    <span>{emoji}</span>
                    <small>{reaction.count}</small>
                  </button>
                ))}
                <div className={threadStyles.reactionPickerWrap}>
                  <button
                    ref={reactionButtonRef}
                    type="button"
                    className={`${threadStyles.reactionAdd} ${reactionOpen ? threadStyles.reactionAddOpen : ""}`}
                    aria-label="Add reaction"
                    aria-expanded={reactionOpen}
                    disabled={actionBusy}
                    onClick={() => setReactionOpen((open) => !open)}
                  >
                    <span>☺</span>
                    <span>React</span>
                  </button>
                  {reactionOpen ? (
                    <div ref={reactionMenuRef} className={threadStyles.reactionPicker} role="menu" aria-label="Choose a reaction">
                      {REACTION_CHOICES.map((emoji) => {
                        const active = comment.reactions?.some((reaction) => reaction.emoji === emoji && reaction.userId === currentUserId);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            className={`${threadStyles.reactionPickerItem} ${active ? threadStyles.reactionPickerItemActive : ""}`}
                            onClick={() => void toggleReaction(emoji)}
                            aria-label={`React with ${emoji}`}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {repliesEnabled && isVisible ? <button type="button" className="comment-link" onClick={() => setReplyOpen((open) => !open)}>Reply</button> : null}
            {isOwn && isVisible ? <button type="button" className={`comment-link ${threadStyles.dangerLink}`} disabled={actionBusy} onClick={() => setDeleteOpen(true)}>Delete</button> : null}
            {canModerate ? isVisible ? <button type="button" className="comment-link" disabled={actionBusy} onClick={() => void moderateComment("HIDE")}>Hide</button> : <button type="button" className="comment-link" disabled={actionBusy} onClick={() => void moderateComment("RESTORE")}>Restore</button> : null}
          </div>

          {replyOpen && repliesEnabled && isVisible ? (
            <div className={threadStyles.inlineReplyComposer}>
              <Textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder={`Reply to ${comment.user.firstName}…`} rows={2} autoFocus />
              <div>
                <button type="button" className="comment-link" onClick={() => { setReplyOpen(false); setReplyBody(""); }}>Cancel</button>
                <Button size="sm" disabled={replyBusy || !replyBody.trim()} onClick={() => void submitReply()}>{replyBusy ? "Replying…" : "Reply"}</Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {comment.replies?.length ? (
        <div className="reply-list">
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              repliesEnabled={repliesEnabled}
              reactionsEnabled={reactionsEnabled}
              canModerate={canModerate}
              currentUserId={currentUserId}
              onReply={onReply}
              onReact={onReact}
              onDelete={onDelete}
              onModerate={onModerate}
              scoreMax={scoreMax}
              showAuthorScores={showAuthorScores}
            />
          ))}
        </div>
      ) : null}

      <Modal
        open={deleteOpen}
        onClose={() => { if (!actionBusy) setDeleteOpen(false); }}
        title={`Delete ${itemLabel}?`}
        subtitle="This action cannot be undone."
        width="440px"
        scrollable={false}
        footer={
          <>
            <Button type="button" variant="secondary" disabled={actionBusy} onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button type="button" variant="danger" icon="trash" disabled={actionBusy} onClick={() => void deleteComment()}>{actionBusy ? "Deleting…" : `Delete ${itemLabel}`}</Button>
          </>
        }
      >
        <div className={threadStyles.deleteConfirm}>
          <p>{hasReplies ? `This ${itemLabel} has replies, so its text will be replaced with a removed placeholder until those replies are also deleted.` : `This ${itemLabel} will be removed from the discussion immediately.`}</p>
          {hasReplies ? <span>Once the final reply beneath a removed comment is deleted, the empty placeholder will disappear automatically.</span> : null}
        </div>
      </Modal>
    </article>
  );
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatCustomValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "Not provided";
  return String(value);
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value;
}

function timeAgo(value: string) {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
