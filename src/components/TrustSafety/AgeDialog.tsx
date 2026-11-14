import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { useStore } from 'react-redux';
import { useT } from '../../i18n/useT';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { CHAT_ROOT_CLASS } from '../../styles/classNames';
import { declareMyAge } from '../../roomStore/trustSafetyThunks';
import type { AgeState } from '../../roomStore/trustSafetySlice';
import {
  AGE_LOCKED,
  errorCodeOf,
  statusOf,
} from '../../networking/api-requests/trustSafety.api';

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  background: var(--ethora-color-overlay, rgba(0, 0, 0, 0.55));
`;

const Panel = styled.div`
  box-sizing: border-box;
  width: min(100%, 400px);
  max-height: 100%;
  overflow: auto;
  padding: 20px;
  border-radius: var(--ethora-radius-lg, 16px);
  background: var(--ethora-color-bg, #ffffff);
  color: var(--ethora-color-text, #141414);
  border: 1px solid var(--ethora-color-border, rgba(140, 140, 140, 0.25));
  font-family: var(--ethora-font-family, inherit);
  cursor: default;
`;

const Title = styled.h2`
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
`;

const Description = styled.p`
  margin: 0 0 16px;
  font-size: var(--ethora-font-size-sm, 14px);
  line-height: 1.45;
  color: var(--ethora-color-text-secondary, #555555);
`;

const Label = styled.label`
  display: block;
  margin-bottom: 6px;
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: 600;
`;

const DateInput = styled.input`
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--ethora-radius-sm, 8px);
  border: 1px solid var(--ethora-color-border, rgba(140, 140, 140, 0.35));
  background: var(--ethora-color-bg-subtle, #f3f6fc);
  color: var(--ethora-color-text, #141414);
  font: inherit;

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 1px;
  }
`;

const ErrorText = styled.p`
  margin: 10px 0 0;
  font-size: var(--ethora-font-size-sm, 13px);
  color: var(--ethora-color-danger, #d92d20);
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
`;

const ActionButton = styled.button<{ $primary?: boolean }>`
  min-width: 96px;
  padding: 9px 16px;
  border-radius: var(--ethora-radius-md, 12px);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--ethora-color-primary, #0052cd);
  background: ${({ $primary }) =>
    $primary ? 'var(--ethora-color-primary, #0052cd)' : 'transparent'};
  color: ${({ $primary }) =>
    $primary
      ? 'var(--ethora-color-text-on-primary, #ffffff)'
      : 'var(--ethora-color-primary, #0052cd)'};

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

const pad = (value: number) => String(value).padStart(2, '0');

/** Today as YYYY-MM-DD in the viewer's own calendar. */
export const todayIso = (now = new Date()): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** A real calendar date, not in the future, not before 1900. */
export const isValidDateOfBirth = (value: string, now = new Date()): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1900) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false;
  }
  return value <= todayIso(now);
};

// Events inside the dialog must not reach the message bubble it was opened
// from (React bubbles through portals): a press here is not a long-press on
// the bubble, and a click is not a tap on the media cover.
const stop = (event: React.SyntheticEvent) => event.stopPropagation();

interface AgeDialogProps {
  onCancel: () => void;
  /** The declared age as the server stored it. */
  onDeclared: (age: AgeState) => void;
}

/**
 * Asks for a date of birth before age-gated content is shown. Only the birth
 * year and whether the viewer is an adult are kept by the server
 * (PUT /v2/users/me/age). A viewer who declared under 18 cannot change it
 * here (409 AGE_LOCKED); an administrator can reset it.
 */
export const AgeDialog: React.FC<AgeDialogProps> = ({ onCancel, onDeclared }) => {
  const t = useT();
  const store = useStore();
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Rendered into the chat's own root, so the theme tokens (light or dark)
  // apply; the page body is the fallback when there is none.
  useLayoutEffect(() => {
    const root =
      anchorRef.current?.closest<HTMLElement>(`.${CHAT_ROOT_CLASS}`) ??
      (typeof document !== 'undefined' ? document.body : null);
    setHost(root);
  }, []);

  useModalDismiss({ onClose: onCancel, containerRef: panelRef, enabled: Boolean(host) });

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    if (!isValidDateOfBirth(value)) {
      setError(t('ts.age.invalid'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const age = await declareMyAge(store, value);
      onDeclared(age);
    } catch (failure) {
      if (statusOf(failure) === 409 || errorCodeOf(failure) === AGE_LOCKED) {
        setError(t('ts.age.locked'));
      } else {
        setError(t('ts.age.error'));
      }
    } finally {
      setSaving(false);
    }
  };

  const dialog = (
    <Backdrop
      data-testid="age-dialog"
      onClick={stop}
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onCancel();
      }}
      onTouchStart={stop}
      onTouchEnd={stop}
      onTouchMove={stop}
      onContextMenu={stop}
    >
      <Panel
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <form onSubmit={submit} noValidate>
          <Title id={titleId}>{t('ts.age.title')}</Title>
          <Description id={descriptionId}>{t('ts.age.description')}</Description>
          <Label htmlFor={inputId}>{t('ts.age.dateOfBirth')}</Label>
          <DateInput
            id={inputId}
            type="date"
            value={value}
            max={todayIso()}
            min="1900-01-01"
            required
            aria-invalid={error ? 'true' : undefined}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
          />
          {error && <ErrorText role="alert">{error}</ErrorText>}
          <Actions>
            <ActionButton type="button" onClick={onCancel}>
              {t('ts.age.cancel')}
            </ActionButton>
            <ActionButton type="submit" $primary disabled={saving || !value}>
              {t('ts.age.confirm')}
            </ActionButton>
          </Actions>
        </form>
      </Panel>
    </Backdrop>
  );

  return (
    <>
      <span ref={anchorRef} hidden />
      {host ? createPortal(dialog, host) : null}
    </>
  );
};

export default AgeDialog;
