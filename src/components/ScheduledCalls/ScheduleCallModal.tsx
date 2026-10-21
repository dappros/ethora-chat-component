import React, { useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../roomStore';
import {
  closeScheduleModal,
  forgetDetails,
} from '../../roomStore/scheduledCallSlice';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { useT } from '../../i18n/useT';
import { useToast } from '../../context/ToastContext';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import {
  DEFAULT_DURATION_MINUTES,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  ScheduleFormErrors,
  ScheduleFormValues,
  combineLocalDateTime,
  defaultScheduleStart,
  durationOptions,
  localTimeZone,
  toLocalDateInput,
  toLocalTimeInput,
  validateScheduleForm,
} from '../../calls/scheduledCall';
import { formatScheduledDuration } from '../../calls/scheduledCallFormat';
import {
  ScheduledCallApiError,
  createScheduledCall,
  updateScheduledCall,
} from '../../networking/api-requests/scheduledCalls.api';
import type {
  ScheduledCallKind,
  UpdateScheduledCallInput,
} from '../../types/models/scheduledCall.model';
import {
  CloseButton,
  GroupContainer,
  ModalTitle,
} from '../Modals/styledModalComponents';
import {
  PresenceModalBackground,
  PresenceModalContainer,
} from '../Modals/motionVariants';
import Button from '../styled/Button';

// "Schedule call" form, also used to edit an existing call (creator or room
// owner). Date and time are the viewer's local ones; the time zone name goes
// along so the calendar entry and the invite read right for everyone.

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  color: var(--ethora-color-text, #141414);
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  min-width: 0;
  flex: 1;
`;

const inputCss = `
  font: inherit;
  font-weight: 400;
  font-size: 15px;
  padding: 9px 12px;
  border-radius: var(--ethora-radius-sm, 8px);
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  background: var(--ethora-color-bg, #fff);
  color: var(--ethora-color-text, #141414);
  box-sizing: border-box;
  width: 100%;
  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 1px;
  }
`;

const Input = styled.input<{ $invalid?: boolean }>`
  ${inputCss}
  ${({ $invalid }) => $invalid && 'border-color: var(--ethora-color-danger, #d92d20);'}
`;
const Select = styled.select<{ $invalid?: boolean }>`
  ${inputCss}
  ${({ $invalid }) => $invalid && 'border-color: var(--ethora-color-danger, #d92d20);'}
`;
const TextArea = styled.textarea<{ $invalid?: boolean }>`
  ${inputCss}
  resize: vertical;
  min-height: 64px;
  ${({ $invalid }) => $invalid && 'border-color: var(--ethora-color-danger, #d92d20);'}
`;

const Row = styled.div`
  display: flex;
  gap: 12px;
  width: 100%;
  @media (max-width: 480px) {
    flex-direction: column;
  }
`;

const ErrorText = styled.div`
  font-size: 13px;
  font-weight: 400;
  color: var(--ethora-color-danger, #d92d20);
`;

const Muted = styled.div`
  font-size: 12px;
  font-weight: 400;
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

const Radios = styled.div`
  display: flex;
  gap: 16px;
  font-weight: 400;
  font-size: 14px;
`;

export const ScheduleCallModal: React.FC = () => {
  const modal = useSelector((state: RootState) => state.scheduledCall?.scheduleModal);
  if (!modal) return null;
  return <ScheduleCallForm key={modal.editing?.scheduledCall.slug || 'new'} />;
};

const ScheduleCallForm: React.FC = () => {
  const dispatch = useDispatch();
  const t = useT();
  const { showToast } = useToast();
  const { config } = useChatSettingState();
  const modal = useSelector((state: RootState) => state.scheduledCall?.scheduleModal)!;
  const editing = modal.editing?.scheduledCall ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const close = () => dispatch(closeScheduleModal());
  useModalDismiss({ onClose: close, containerRef });

  const initial = useMemo<ScheduleFormValues>(() => {
    const start = editing ? new Date(editing.startAt) : defaultScheduleStart();
    return {
      title: editing?.title ?? '',
      description: editing?.description ?? '',
      date: toLocalDateInput(start),
      time: toLocalTimeInput(start),
      durationMinutes: editing?.durationMinutes ?? DEFAULT_DURATION_MINUTES,
      kind: editing?.kind ?? 'video',
    };
    // The form is keyed by the call, so the first value is the only one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [values, setValues] = useState<ScheduleFormValues>(initial);
  const [errors, setErrors] = useState<ScheduleFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const audioAllowed = config?.videoCalls?.enableAudioCalls === true || values.kind === 'audio';
  const set = <K extends keyof ScheduleFormValues>(
    key: K,
    value: ScheduleFormValues[K]
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  const timeChanged =
    !editing || values.date !== initial.date || values.time !== initial.time;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const found = validateScheduleForm(values, Date.now(), {
      skipPastCheck: !timeChanged,
    });
    setErrors(found);
    setSaveError(null);
    if (Object.keys(found).length > 0) return;
    const start = combineLocalDateTime(values.date, values.time)!;
    const title = values.title.trim() || t('scheduledCall.default.title');
    setSaving(true);
    try {
      if (editing) {
        const patch: UpdateScheduledCallInput = {};
        if (title !== editing.title) patch.title = title;
        if (values.description !== (editing.description ?? '')) {
          patch.description = values.description;
        }
        if (timeChanged) patch.startAt = start.toISOString();
        if (values.durationMinutes !== editing.durationMinutes) {
          patch.durationMinutes = values.durationMinutes;
        }
        if (values.kind !== editing.kind) patch.kind = values.kind;
        if (Object.keys(patch).length > 0) {
          await updateScheduledCall(editing.slug, patch);
          dispatch(forgetDetails(editing.slug));
        }
        showToast({
          id: Date.now().toString(),
          title: t('toast.success'),
          message: t('scheduledCall.toast.updated'),
          type: 'success',
        });
      } else {
        const chatName = modal.roomJid.split('@')[0];
        await createScheduledCall({
          chatName,
          title,
          description: values.description.trim() || undefined,
          startAt: start.toISOString(),
          durationMinutes: values.durationMinutes,
          timezone: localTimeZone(),
          kind: values.kind,
        });
        showToast({
          id: Date.now().toString(),
          title: t('toast.success'),
          message: t('scheduledCall.toast.scheduled'),
          type: 'success',
        });
      }
      close();
    } catch (error) {
      const api = error instanceof ScheduledCallApiError ? error : null;
      if (api?.code === 'START_IN_PAST') {
        // The server's clock disagrees with the form's: same message as the
        // client-side check.
        setErrors({ startPast: true });
      } else {
        setSaveError(
          api?.status === 403
            ? t('scheduledCall.error.forbidden')
            : t('scheduledCall.form.error.save')
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const tz = localTimeZone();
  const kinds: ScheduledCallKind[] = audioAllowed ? ['video', 'audio'] : ['video'];

  return (
    <PresenceModalBackground data-testid="schedule-call-modal">
      <PresenceModalContainer ref={containerRef} style={{ maxWidth: 480 }}>
        <CloseButton
          type="button"
          onClick={close}
          style={{ fontSize: 24 }}
          aria-label={t('action.close')}
        >
          &times;
        </CloseButton>
        <ModalTitle>
          {editing
            ? t('scheduledCall.form.titleEdit')
            : t('scheduledCall.form.titleCreate')}
        </ModalTitle>
        <Form onSubmit={handleSubmit} noValidate>
          <Field>
            {t('scheduledCall.form.title')}
            <Input
              type="text"
              value={values.title}
              maxLength={MAX_TITLE_LENGTH + 1}
              placeholder={t('scheduledCall.form.titlePlaceholder')}
              onChange={(e) => set('title', e.target.value)}
              $invalid={Boolean(errors.title)}
              data-testid="schedule-call-title"
            />
            {errors.title && (
              <ErrorText role="alert">{t('scheduledCall.form.error.title')}</ErrorText>
            )}
          </Field>
          <Row>
            <Field>
              {t('scheduledCall.form.date')}
              <Input
                type="date"
                value={values.date}
                onChange={(e) => set('date', e.target.value)}
                $invalid={Boolean(errors.start || errors.startPast)}
                data-testid="schedule-call-date"
              />
            </Field>
            <Field>
              {t('scheduledCall.form.time')}
              <Input
                type="time"
                value={values.time}
                onChange={(e) => set('time', e.target.value)}
                $invalid={Boolean(errors.start || errors.startPast)}
                data-testid="schedule-call-time"
              />
            </Field>
          </Row>
          {(errors.start || errors.startPast) && (
            <ErrorText role="alert">
              {errors.start
                ? t('scheduledCall.form.error.start')
                : t('scheduledCall.form.error.startPast')}
            </ErrorText>
          )}
          {tz && <Muted>{t('scheduledCall.form.timezone', { tz })}</Muted>}
          <Row>
            <Field>
              {t('scheduledCall.form.duration')}
              <Select
                value={values.durationMinutes}
                onChange={(e) => set('durationMinutes', Number(e.target.value))}
                $invalid={Boolean(errors.duration)}
                data-testid="schedule-call-duration"
              >
                {durationOptions(initial.durationMinutes).map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatScheduledDuration(minutes, t)}
                  </option>
                ))}
              </Select>
              {errors.duration && (
                <ErrorText role="alert">
                  {t('scheduledCall.form.error.duration')}
                </ErrorText>
              )}
            </Field>
            <Field as="div">
              {t('scheduledCall.form.type')}
              <Radios role="radiogroup" aria-label={t('scheduledCall.form.type')}>
                {kinds.map((kind) => (
                  <label key={kind} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="radio"
                      name="schedule-call-kind"
                      value={kind}
                      checked={values.kind === kind}
                      onChange={() => set('kind', kind)}
                    />
                    {kind === 'audio'
                      ? t('scheduledCall.kind.audio')
                      : t('scheduledCall.kind.video')}
                  </label>
                ))}
              </Radios>
            </Field>
          </Row>
          <Field>
            {t('scheduledCall.form.description')}
            <TextArea
              value={values.description}
              maxLength={MAX_DESCRIPTION_LENGTH + 1}
              onChange={(e) => set('description', e.target.value)}
              $invalid={Boolean(errors.description)}
            />
            {errors.description && (
              <ErrorText role="alert">
                {t('scheduledCall.form.error.description')}
              </ErrorText>
            )}
          </Field>
          {saveError && <ErrorText role="alert">{saveError}</ErrorText>}
          <GroupContainer style={{ gap: 12 }}>
            <Button
              type="button"
              onClick={close}
              text={t('action.cancel')}
              style={{ width: '100%' }}
              variant="outlined"
            />
            <Button
              type="submit"
              text={
                editing
                  ? t('scheduledCall.form.submitEdit')
                  : t('scheduledCall.form.submitCreate')
              }
              style={{ width: '100%' }}
              variant="filled"
              loading={saving}
              disabled={saving}
              data-testid="schedule-call-submit"
            />
          </GroupContainer>
        </Form>
      </PresenceModalContainer>
    </PresenceModalBackground>
  );
};

export default ScheduleCallModal;
