"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";

export function Button({
    variant = "primary",
    size = "md",
    icon,
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
    icon?: Parameters<typeof Icon>[0]["name"];
}) {
    return (
        <button
            className={`button button-${variant} button-${size} ${className}`}
            {...props}
        >
            {icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
            {props.children}
        </button>
    );
}

export function Field({
    label,
    hint,
    error,
    children,
}: {
    label: string;
    hint?: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <label className="field">
            <span className="field-label">{label}</span>
            {children}
            {error ? (
                <span className="field-error">{error}</span>
            ) : hint ? (
                <span className="field-hint">{hint}</span>
            ) : null}
        </label>
    );
}

export function Input({
    className = "",
    ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input className={`input ${className}`} {...props} />;
}

export function Textarea({
    className = "",
    ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea className={`textarea ${className}`} {...props} />;
}

export type SelectOption = {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
};

type DropdownPosition = {
    left: number;
    top?: number;
    bottom?: number;
    width: number;
    maxHeight: number;
    accent: string;
};

function useDropdownPosition(
    open: boolean,
    triggerRef: React.RefObject<HTMLElement | null>,
) {
    const [position, setPosition] = useState<DropdownPosition | null>(null);

    useLayoutEffect(() => {
        if (!open || !triggerRef.current) {
            setPosition(null);
            return;
        }

        const update = () => {
            const trigger = triggerRef.current;
            if (!trigger) return;
            const rect = trigger.getBoundingClientRect();
            const viewportPadding = 12;
            const gap = 6;
            const desiredMaxHeight = 292;
            const minUsefulHeight = 140;
            const below =
                window.innerHeight - rect.bottom - viewportPadding - gap;
            const above = rect.top - viewportPadding - gap;
            const openAbove = below < minUsefulHeight && above > below;
            const availableHeight = Math.max(96, openAbove ? above : below);
            const width = Math.min(
                Math.max(rect.width, 168),
                window.innerWidth - viewportPadding * 2,
            );
            const left = Math.min(
                Math.max(viewportPadding, rect.left),
                Math.max(
                    viewportPadding,
                    window.innerWidth - width - viewportPadding,
                ),
            );
            const computed = window.getComputedStyle(trigger);
            const accent =
                computed.getPropertyValue("--dropdown-accent").trim() ||
                computed.getPropertyValue("--chapter-primary").trim() ||
                computed.getPropertyValue("--public-primary").trim() ||
                "#2563eb";

            setPosition({
                left,
                width,
                accent,
                maxHeight: Math.min(desiredMaxHeight, availableHeight),
                ...(openAbove
                    ? { bottom: window.innerHeight - rect.top + gap }
                    : { top: rect.bottom + gap }),
            });
        };

        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        const observer = new ResizeObserver(update);
        observer.observe(triggerRef.current);

        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
            observer.disconnect();
        };
    }, [open, triggerRef]);

    return position;
}

function useOutsideDropdown(
    open: boolean,
    triggerRef: React.RefObject<HTMLElement | null>,
    menuRef: React.RefObject<HTMLElement | null>,
    close: () => void,
) {
    useEffect(() => {
        if (!open) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                triggerRef.current?.contains(target) ||
                menuRef.current?.contains(target)
            )
                return;
            close();
        };
        document.addEventListener("mousedown", handlePointerDown);
        return () =>
            document.removeEventListener("mousedown", handlePointerDown);
    }, [close, menuRef, open, triggerRef]);
}

function DropdownPortal({
    children,
    position,
    menuRef,
    className = "",
}: {
    children: React.ReactNode;
    position: DropdownPosition | null;
    menuRef: React.RefObject<HTMLDivElement | null>;
    className?: string;
}) {
    if (!position || typeof document === "undefined") return null;
    return createPortal(
        <div
            ref={menuRef}
            className={`dropdown-menu ${className}`}
            style={
                {
                    position: "fixed",
                    zIndex: 2000,
                    left: position.left,
                    width: position.width,
                    maxHeight: position.maxHeight,
                    ...(position.top !== undefined
                        ? { top: position.top }
                        : {}),
                    ...(position.bottom !== undefined
                        ? { bottom: position.bottom }
                        : {}),
                    "--dropdown-accent": position.accent,
                } as React.CSSProperties
            }
        >
            {children}
        </div>,
        document.body,
    );
}

export function Select(props: {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    emptyText?: string;
    compact?: boolean;
    searchable?: boolean;
    clearable?: boolean;
    clearLabel?: string;
    leadingIcon?: Parameters<typeof Icon>[0]["name"];
    className?: string;
    ariaLabel?: string;
    required?: boolean;
}) {
    const shouldSearch = props.searchable ?? props.options.length > 12;
    if (shouldSearch) {
        return (
            <SearchSelect
                {...props}
                clearLabel={
                    props.clearable
                        ? (props.clearLabel ?? "Clear selection")
                        : undefined
                }
            />
        );
    }
    return <BasicSelect {...props} />;
}

function BasicSelect({
    value,
    onChange,
    options,
    placeholder = "Select an option",
    disabled = false,
    emptyText = "No options available",
    compact = false,
    clearable = false,
    clearLabel = "Clear selection",
    leadingIcon,
    className = "",
    ariaLabel,
    required = false,
}: {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    emptyText?: string;
    compact?: boolean;
    clearable?: boolean;
    clearLabel?: string;
    leadingIcon?: Parameters<typeof Icon>[0]["name"];
    className?: string;
    ariaLabel?: string;
    required?: boolean;
}) {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const selected = useMemo(
        () => options.find((option) => option.value === value) ?? null,
        [options, value],
    );
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const position = useDropdownPosition(open, triggerRef);

    const selectableOptions = useMemo(() => {
        const rows =
            clearable && value
                ? [{ value: "", label: clearLabel }, ...options]
                : options;
        return rows;
    }, [clearLabel, clearable, options, value]);

    const close = () => setOpen(false);
    useOutsideDropdown(open, triggerRef, menuRef, close);

    useEffect(() => {
        if (!open) return;
        const selectedIndex = selectableOptions.findIndex(
            (option) => option.value === value && !option.disabled,
        );
        setActiveIndex(
            selectedIndex >= 0
                ? selectedIndex
                : Math.max(
                      0,
                      selectableOptions.findIndex((option) => !option.disabled),
                  ),
        );
    }, [open, selectableOptions, value]);

    const move = (direction: 1 | -1) => {
        if (!selectableOptions.length) return;
        let next = activeIndex;
        for (let count = 0; count < selectableOptions.length; count += 1) {
            next =
                (next + direction + selectableOptions.length) %
                selectableOptions.length;
            if (!selectableOptions[next]?.disabled) {
                setActiveIndex(next);
                break;
            }
        }
    };

    const choose = (option: SelectOption) => {
        if (option.disabled) return;
        onChange(option.value);
        setOpen(false);
        triggerRef.current?.focus();
    };

    return (
        <div
            className={`dropdown ${compact ? "dropdown-compact" : ""} ${disabled ? "dropdown-disabled" : ""} ${className}`}
        >
            <button
                ref={triggerRef}
                type="button"
                className={`dropdown-trigger ${open ? "dropdown-trigger-open" : ""} ${selected ? "dropdown-trigger-selected" : ""}`}
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-required={required || undefined}
                disabled={disabled}
                onClick={() => setOpen((current) => !current)}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                        event.preventDefault();
                        if (!open) setOpen(true);
                        else move(1);
                    } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        if (!open) setOpen(true);
                        else move(-1);
                    } else if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (!open) setOpen(true);
                        else if (selectableOptions[activeIndex])
                            choose(selectableOptions[activeIndex]);
                    } else if (event.key === "Escape") {
                        setOpen(false);
                    } else if (event.key === "Home" && open) {
                        event.preventDefault();
                        const index = selectableOptions.findIndex(
                            (option) => !option.disabled,
                        );
                        if (index >= 0) setActiveIndex(index);
                    } else if (event.key === "End" && open) {
                        event.preventDefault();
                        for (
                            let index = selectableOptions.length - 1;
                            index >= 0;
                            index -= 1
                        ) {
                            if (!selectableOptions[index]?.disabled) {
                                setActiveIndex(index);
                                break;
                            }
                        }
                    }
                }}
            >
                {leadingIcon ? (
                    <Icon
                        name={leadingIcon}
                        size={compact ? 14 : 16}
                        className="dropdown-leading-icon"
                    />
                ) : null}
                <span className="dropdown-trigger-copy">
                    <span
                        className={
                            selected ? "dropdown-value" : "dropdown-placeholder"
                        }
                    >
                        {selected?.label ?? placeholder}
                    </span>
                    {!compact && selected?.description ? (
                        <small>{selected.description}</small>
                    ) : null}
                </span>
                <Icon name="chevron" size={14} className="dropdown-chevron" />
            </button>
            {open ? (
                <DropdownPortal position={position} menuRef={menuRef}>
                    <div
                        className="dropdown-options"
                        role="listbox"
                        aria-label={ariaLabel}
                    >
                        {selectableOptions.length ? (
                            selectableOptions.map((option, index) => (
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={option.value === value}
                                    key={`${option.value}-${option.label}`}
                                    disabled={option.disabled}
                                    className={`dropdown-option ${index === activeIndex ? "dropdown-option-active" : ""} ${option.value === value ? "dropdown-option-selected" : ""}`}
                                    onMouseEnter={() => {
                                        if (!option.disabled)
                                            setActiveIndex(index);
                                    }}
                                    onClick={() => choose(option)}
                                >
                                    <span>
                                        <strong>{option.label}</strong>
                                        {option.description ? (
                                            <small>{option.description}</small>
                                        ) : null}
                                    </span>
                                    {option.value === value ? (
                                        <Icon name="check" size={15} />
                                    ) : null}
                                </button>
                            ))
                        ) : (
                            <div className="dropdown-empty">{emptyText}</div>
                        )}
                    </div>
                </DropdownPortal>
            ) : null}
        </div>
    );
}

export function SearchSelect({
    value,
    onChange,
    options,
    placeholder = "Start typing to search",
    emptyText = "No matches found",
    disabled = false,
    clearLabel,
    compact = false,
    leadingIcon,
    className = "",
    ariaLabel,
    required = false,
}: {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    emptyText?: string;
    disabled?: boolean;
    clearLabel?: string;
    compact?: boolean;
    leadingIcon?: Parameters<typeof Icon>[0]["name"];
    className?: string;
    ariaLabel?: string;
    required?: boolean;
}) {
    const triggerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const selected = useMemo(
        () => options.find((option) => option.value === value) ?? null,
        [options, value],
    );
    const [query, setQuery] = useState(selected?.label ?? "");
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const position = useDropdownPosition(open, triggerRef);

    useEffect(() => {
        if (!open) setQuery(selected?.label ?? "");
    }, [selected, open]);

    const close = () => {
        setOpen(false);
        setQuery(selected?.label ?? "");
    };
    useOutsideDropdown(open, triggerRef, menuRef, close);

    const filtered = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized || selected?.label === query) return options;
        return options.filter((option) =>
            `${option.label} ${option.description ?? ""}`
                .toLowerCase()
                .includes(normalized),
        );
    }, [options, query, selected]);

    const rows = useMemo(() => {
        const items: SelectOption[] = [...filtered];
        if (clearLabel && !query.trim())
            items.unshift({ value: "", label: clearLabel });
        return items;
    }, [clearLabel, filtered, query]);

    useEffect(() => {
        if (!open) return;
        setActiveIndex(
            Math.max(
                0,
                rows.findIndex(
                    (option) => option.value === value && !option.disabled,
                ),
            ),
        );
    }, [open, rows, value]);

    const move = (direction: 1 | -1) => {
        if (!rows.length) return;
        let next = activeIndex;
        for (let count = 0; count < rows.length; count += 1) {
            next = (next + direction + rows.length) % rows.length;
            if (!rows[next]?.disabled) {
                setActiveIndex(next);
                break;
            }
        }
    };

    const choose = (option: SelectOption) => {
        if (option.disabled) return;
        onChange(option.value);
        setQuery(option.value ? option.label : "");
        setOpen(false);
        inputRef.current?.focus();
    };

    return (
        <div
            className={`dropdown dropdown-searchable ${compact ? "dropdown-compact" : ""} ${disabled ? "dropdown-disabled" : ""} ${className}`}
        >
            <div
                ref={triggerRef}
                className={`dropdown-trigger dropdown-search-trigger ${open ? "dropdown-trigger-open" : ""}`}
            >
                {leadingIcon ? (
                    <Icon
                        name={leadingIcon}
                        size={compact ? 14 : 16}
                        className="dropdown-leading-icon"
                    />
                ) : (
                    <Icon
                        name="search"
                        size={compact ? 14 : 16}
                        className="dropdown-leading-icon"
                    />
                )}
                <input
                    ref={inputRef}
                    value={query}
                    placeholder={placeholder}
                    disabled={disabled}
                    role="combobox"
                    aria-label={ariaLabel}
                    aria-expanded={open}
                    aria-autocomplete="list"
                    aria-required={required || undefined}
                    onFocus={() => {
                        setOpen(true);
                        setActiveIndex(0);
                    }}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        if (value) onChange("");
                        setOpen(true);
                        setActiveIndex(0);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                            event.preventDefault();
                            if (!open) setOpen(true);
                            else move(1);
                        } else if (event.key === "ArrowUp") {
                            event.preventDefault();
                            if (!open) setOpen(true);
                            else move(-1);
                        } else if (
                            event.key === "Enter" &&
                            open &&
                            rows[activeIndex]
                        ) {
                            event.preventDefault();
                            choose(rows[activeIndex]);
                        } else if (event.key === "Escape") {
                            event.preventDefault();
                            close();
                        }
                    }}
                />
                {selected ? (
                    <button
                        type="button"
                        className="dropdown-clear"
                        aria-label="Clear selection"
                        disabled={disabled}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                            onChange("");
                            setQuery("");
                            setOpen(true);
                            inputRef.current?.focus();
                        }}
                    >
                        <Icon name="x" size={14} />
                    </button>
                ) : (
                    <Icon
                        name="chevron"
                        size={14}
                        className="dropdown-chevron"
                    />
                )}
            </div>
            {open && !disabled ? (
                <DropdownPortal position={position} menuRef={menuRef}>
                    <div
                        className="dropdown-options"
                        role="listbox"
                        aria-label={ariaLabel}
                    >
                        {rows.length ? (
                            rows.map((option, index) => (
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={option.value === value}
                                    key={`${option.value}-${option.label}`}
                                    disabled={option.disabled}
                                    className={`dropdown-option ${index === activeIndex ? "dropdown-option-active" : ""} ${option.value === value ? "dropdown-option-selected" : ""}`}
                                    onMouseEnter={() => {
                                        if (!option.disabled)
                                            setActiveIndex(index);
                                    }}
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onClick={() => choose(option)}
                                >
                                    <span>
                                        <strong>{option.label}</strong>
                                        {option.description ? (
                                            <small>{option.description}</small>
                                        ) : null}
                                    </span>
                                    {option.value === value ? (
                                        <Icon name="check" size={15} />
                                    ) : null}
                                </button>
                            ))
                        ) : (
                            <div className="dropdown-empty">{emptyText}</div>
                        )}
                    </div>
                </DropdownPortal>
            ) : null}
        </div>
    );
}

export function CopyButton({
    value,
    label = "Copy link",
    variant = "secondary",
    size = "sm",
    className = "",
}: {
    value: string;
    label?: string;
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
    className?: string;
}) {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    useEffect(
        () => () => {
            if (timeoutRef.current !== null)
                window.clearTimeout(timeoutRef.current);
        },
        [],
    );

    const copy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        if (timeoutRef.current !== null)
            window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => setCopied(false), 1800);
    };

    return (
        <Button
            type="button"
            variant={variant}
            size={size}
            icon={copied ? "check" : "copy"}
            className={`${className} ${copied ? "copy-button-copied" : ""}`}
            onClick={() => void copy()}
        >
            {copied ? "Copied" : label}
        </Button>
    );
}

export function Badge({
    children,
    tone = "neutral",
}: {
    children: React.ReactNode;
    tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
    return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusDot({ color }: { color?: string | null }) {
    return (
        <span
            className="status-dot"
            style={{ background: color || "#8a9099" }}
        />
    );
}

export function EmptyState({
    icon = "candidate",
    title,
    copy,
    action,
}: {
    icon?: Parameters<typeof Icon>[0]["name"];
    title: string;
    copy: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="empty-state">
            <div className="empty-icon">
                <Icon name={icon} size={22} />
            </div>
            <h3>{title}</h3>
            <p>{copy}</p>
            {action ? <div className="empty-action">{action}</div> : null}
        </div>
    );
}

export function Modal({
    open,
    onClose,
    title,
    subtitle,
    children,
    footer,
    width = "560px",
    scrollable = true,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    width?: string;
    scrollable?: boolean;
}) {
    useEffect(() => {
        if (!open) return;
        const listener = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", listener);
        return () => window.removeEventListener("keydown", listener);
    }, [open, onClose]);

    if (!open) return null;
    return (
        <div
            className="modal-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                className={`modal ${scrollable ? "" : "modal-no-scroll"}`}
                style={{ maxWidth: width }}
            >
                <div className="modal-header">
                    <div>
                        <h2>{title}</h2>
                        {subtitle ? <p>{subtitle}</p> : null}
                    </div>
                    <button
                        className="icon-button"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <Icon name="x" />
                    </button>
                </div>
                <div className="modal-body">{children}</div>
                {footer ? <div className="modal-footer">{footer}</div> : null}
            </div>
        </div>
    );
}

export function Toggle({
    checked,
    onChange,
    disabled,
    label,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    label?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`toggle ${checked ? "toggle-on" : ""}`}
        >
            <span />
        </button>
    );
}

export function Spinner({ size = 24 }: { size?: number }) {
    return <span className="spinner" style={{ width: size, height: size }} />;
}

export function Skeleton({ className = "" }: { className?: string }) {
    return <div className={`skeleton ${className}`} />;
}

export function Score({
    value,
    max = 10,
    count,
    large = false,
}: {
    value?: number | null;
    max?: number;
    count?: number;
    large?: boolean;
}) {
    const hasValue =
        value !== null &&
        value !== undefined &&
        Number.isFinite(value) &&
        (count === undefined || count > 0);
    const display = hasValue ? Number(value).toFixed(1) : "—";
    return (
        <div className={`score ${large ? "score-large" : ""}`}>
            <span className="score-value">{display}</span>
            <span className="score-max">/{max}</span>
            {count !== undefined ? (
                <span className="score-count">
                    {count} {count === 1 ? "score" : "scores"}
                </span>
            ) : null}
        </div>
    );
}

export function Avatar({
    firstName,
    lastName,
    size = 36,
}: {
    firstName: string;
    lastName: string;
    size?: number;
}) {
    return (
        <span
            className="avatar"
            style={{
                width: size,
                height: size,
                fontSize: Math.max(11, size * 0.33),
            }}
        >
            {firstName.charAt(0)}
            {lastName.charAt(0)}
        </span>
    );
}
