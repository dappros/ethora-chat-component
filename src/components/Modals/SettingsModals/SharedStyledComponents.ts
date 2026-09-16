import styled from 'styled-components';
import { CenterContainer, Label } from '../styledModalComponents';
import Button, { ButtonProps } from '../../styled/Button';
import { reducedMotion } from '../../../styles/motion';

export const SharedSettingsCenterContainer = styled(CenterContainer)`
  display: flex;
  box-sizing: border-box;
  align-items: flex-start;
  gap: 32px;
`;

export const SharedSettingsColumnContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
`;

export const SharedSettingsSectionContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const SharedSettingsStyledLabel = styled(Label)`
  font-weight: 600;
  text-align: start;
  flex-wrap: wrap;
  display: flex;
  align-items: center;
`;

export const RowWrapper = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

export const SharedSettingsLabelData = styled(Label)`
  font-size: 12px;
  text-align: start;
  color: var(--ethora-color-text-muted, #8c8c8c);
`;

/**
 * A settings action rendered as its own outlined row rather than an inline
 * link, so "download my data" / "delete my account" read as deliberate,
 * separately-weighted decisions - not just more text in the card. The
 * border colour is caller-driven (primary for a normal action, the danger
 * token for the destructive one), everything else - radius, padding,
 * weight, the hover/focus feedback - comes from the shared tokens so both
 * read as the same kind of control.
 */
export const SharedSettingsStyledButton = styled(Button)<{
  borderColor: string;
}>`
  min-height: 44px;
  display: flex;
  flex-direction: column;
  gap: var(--ethora-space-1, 4px);
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 100%;
  padding: var(--ethora-space-2, 8px) var(--ethora-space-4, 16px);
  border-radius: var(--ethora-radius-md, 12px);
  border: 1px solid ${({ borderColor }) => borderColor};
  font-weight: var(--ethora-font-weight-semibold, 600);
  transition: background-color var(--ethora-motion-fast, 150ms),
    box-shadow var(--ethora-motion-fast, 150ms);

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }

  &:active {
    box-shadow: var(--ethora-shadow-sm, 0 1px 2px rgba(16, 24, 40, 0.06));
  }

  ${reducedMotion}
`;

/** A quiet, boxed disclosure - the read-only counterpart to the button
 * above, so a fact ("your data may be retained on-chain") doesn't compete
 * visually with an action the person can take. */
export const SharedSettingsInfoPanel = styled.div<{ bgColor: string }>`
  display: flex;
  align-items: flex-start;
  background-color: ${({ bgColor }) => bgColor};
  padding: var(--ethora-space-4, 16px);
  border-radius: var(--ethora-radius-md, 12px);
  gap: var(--ethora-space-2, 8px);
`;

export const SharedSettingsInfoText = styled.div`
  font-size: var(--ethora-font-size-xs, 12px);
  line-height: var(--ethora-line-height-normal, 1.5);
  color: var(--ethora-color-text, #141414);
  display: flex;
  text-align: start;
`;
