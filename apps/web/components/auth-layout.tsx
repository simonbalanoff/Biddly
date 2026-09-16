import { Brand } from "./brand";

export function AuthLayout({
    children,
    asideTitle = "Recruitment, organized.",
    asideCopy = "Keep your chapter aligned from first conversation to final decision with everything in one shared workspace.",
}: {
    children: React.ReactNode;
    asideTitle?: string;
    asideCopy?: string;
}) {
    return (
        <div className="auth-layout">
            <section className="auth-panel">
                <div className="auth-brand">
                    <Brand />
                </div>

                <div className="auth-form-wrap">{children}</div>

                <div className="auth-footer">
                    Biddly · Recruitment for Greek life
                </div>
            </section>

            <aside className="auth-aside">
                <div className="auth-aside-content">
                    <span className="auth-kicker">Your chapter workspace</span>

                    <h2>{asideTitle}</h2>

                    <p>{asideCopy}</p>

                    <div className="auth-proof">
                        <div>
                            <strong>Stay aligned</strong>
                            <span>
                                See PNMs, scores, feedback, and recruitment
                                progress in one place.
                            </span>
                        </div>

                        <div>
                            <strong>Move quickly</strong>
                            <span>
                                Give feedback and keep up with the chapter
                                without digging through messages or
                                spreadsheets.
                            </span>
                        </div>

                        <div>
                            <strong>Keep history</strong>
                            <span>
                                Recruitment cycles stay organized and available
                                when you need to look back.
                            </span>
                        </div>
                    </div>
                </div>
            </aside>
        </div>
    );
}
