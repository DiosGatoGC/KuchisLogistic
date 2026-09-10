"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  initialSelectIndex,
  moveSelectIndex,
  selectedOptionLabel,
  selectValueAt,
} from "./select-model";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  opensUp: boolean;
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = "Selecciona una opción",
  disabled = false,
  required = false,
  error,
  description,
  className = "",
}: {
  id?: string;
  label: string;
  value: T | "";
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  description?: string;
  className?: string;
}) {
  const generatedId = useId();
  const controlId = id ?? `select-${generatedId}`;
  const listboxId = `${controlId}-listbox`;
  const errorId = error ? `${controlId}-error` : undefined;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isOpen = open && !disabled;

  const close = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const viewportPadding = 8;
    const gap = 6;
    const desiredHeight = Math.min(276, options.length * 44 + 8);
    const below = viewportBottom - rect.bottom - viewportPadding - gap;
    const above = rect.top - viewportTop - viewportPadding - gap;
    const opensUp = below < Math.min(desiredHeight, 132) && above > below;
    const available = Math.max(88, Math.min(276, opensUp ? above : below));
    const width = Math.min(rect.width, viewportWidth - viewportPadding * 2);
    const left = Math.max(
      viewportLeft + viewportPadding,
      Math.min(rect.left, viewportRight - width - viewportPadding),
    );
    const panelHeight = Math.min(desiredHeight, available);
    setPosition({
      top: opensUp
        ? Math.max(viewportTop + viewportPadding, rect.top - panelHeight - gap)
        : rect.bottom + gap,
      left,
      width,
      maxHeight: available,
      opensUp,
    });
  }, [options.length]);

  const openMenu = useCallback(() => {
    if (disabled || options.every((option) => option.disabled)) return;
    setActiveIndex(initialSelectIndex(options, value));
    setOpen(true);
  }, [disabled, options, value]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    const handleViewportChange = (event?: Event) => {
      if (event?.type === "scroll" && panelRef.current?.contains(event.target as Node)) return;
      updatePosition();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);
    document.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
      document.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [close, isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  const choose = (index: number) => {
    const nextValue = selectValueAt(options, index);
    if (nextValue === null) return;
    onChange(nextValue as T);
    close();
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "Tab") {
      close();
      return;
    }
    if (event.key === "Escape") {
      if (!isOpen) return;
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
        return;
      }
      setActiveIndex((current) => moveSelectIndex(options, current, event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isOpen) openMenu();
      else choose(activeIndex);
    }
  };

  const selectedLabel = selectedOptionLabel(options, value, placeholder);
  const activeOption = options[activeIndex];
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div ref={rootRef} className={`field select-field ${className}`.trim()} data-open={isOpen} data-placeholder={!value}>
      <label className="field__label" htmlFor={controlId}>{label}</label>
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        className="input select-field__trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen && activeOption ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-required={required || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => isOpen ? close() : openMenu()}
        onKeyDown={handleKeyDown}
      >
        <span>{selectedLabel}</span>
        <span className="select-field__chevron" aria-hidden="true">⌄</span>
      </button>
      {description && <p id={descriptionId} className="field__description">{description}</p>}
      {error && <p id={errorId} className="field__error" role="alert">{error}</p>}

      {isOpen && position && createPortal(
        <div
          ref={panelRef}
          id={listboxId}
          className="select-field__menu"
          role="listbox"
          aria-label={label}
          data-placement={position.opensUp ? "top" : "bottom"}
          style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(node) => { optionRefs.current[index] = node; }}
              id={`${listboxId}-option-${index}`}
              type="button"
              className="select-field__option"
              role="option"
              tabIndex={-1}
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              disabled={option.disabled}
              data-active={index === activeIndex}
              onPointerMove={() => { if (!option.disabled) setActiveIndex(index); }}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {option.value === value && <span className="select-field__check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
