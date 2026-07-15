import React, { useState } from 'react';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { setLangSource } from '../../roomStore/chatSettingsSlice';
import { GlobeIcon } from '../../assets/icons';
import { LANGUAGE_OPTIONS } from '../../helpers/constants/LANGUAGE_OPTIONS';
import { Iso639_1Codes } from '../../types/models/language.model';
import { useT } from '../../i18n/useT';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import {
  ModalBackground,
  ModalContainer,
  ModalTitle,
  CloseButton,
} from '../Modals/styledModalComponents';

const IconButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background: rgba(0, 0, 0, 0.06);
  }
`;

// Reuses ModalContainer's existing responsive rules (full-width, tighter
// padding under 480px) rather than a bespoke bottom sheet - one modal
// pattern that already works on mobile across the app, instead of a second
// one to maintain.
const LanguageModalContainer = styled(ModalContainer)`
  align-items: stretch;
  padding: 24px;
  gap: 16px;
  max-width: 360px;

  @media (max-width: 480px) {
    padding: 20px;
  }
`;

const LanguageList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 60vh;
  overflow-y: auto;
`;

// Touch target sized for mobile (WCAG recommends >=44px).
const LanguageRow = styled.button<{ $selected: boolean; $accent: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 10px;
  border: none;
  background: ${({ $selected, $accent }) => ($selected ? `${$accent}1a` : 'transparent')};
  color: ${({ $selected, $accent }) => ($selected ? $accent : '#141414')};
  font-size: 15px;
  font-weight: ${({ $selected }) => ($selected ? 600 : 400)};
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${({ $selected, $accent }) => ($selected ? `${$accent}1a` : 'rgba(0, 0, 0, 0.04)')};
  }
`;

const Checkmark = styled.span`
  font-size: 15px;
  line-height: 1;
`;

/**
 * Globe-icon button for the chat header that opens a language picker modal.
 * Picking a language dispatches `setLangSource`, which drives both:
 *  - the reader's translation target (Message.tsx falls back to it when
 *    `config.translates.readerLocale` / `config.i18n.locale` aren't set),
 *  - the source language declared on the reader's own outgoing messages.
 *
 * `langSource` lives in `chatSettingStore`, which redux-persist already
 * persists (see roomStore/index.ts) - no separate storage needed here.
 */
export const LanguageSelectorButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dispatch = useDispatch();
  const t = useT();
  const { config } = useChatSettingState();
  const langSource = useSelector(
    (state: RootState) => state.chatSettingStore.langSource
  );
  const accentColor = config?.colors?.primary || '#0052CD';

  const handleSelect = (code: Iso639_1Codes) => {
    dispatch(setLangSource(code));
    setIsOpen(false);
  };

  return (
    <>
      <IconButton
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={t('language.select')}
        title={t('language.select')}
      >
        <GlobeIcon />
      </IconButton>

      {isOpen && (
        <ModalBackground onClick={() => setIsOpen(false)}>
          <LanguageModalContainer onClick={(e) => e.stopPropagation()}>
            <CloseButton onClick={() => setIsOpen(false)} aria-label={t('action.cancel')}>
              &times;
            </CloseButton>
            <ModalTitle>{t('language.select')}</ModalTitle>
            <LanguageList role="listbox">
              {LANGUAGE_OPTIONS.map((option) => {
                const selected = option.id === langSource;
                return (
                  <LanguageRow
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    $selected={selected}
                    $accent={accentColor}
                    onClick={() => handleSelect(option.id as Iso639_1Codes)}
                  >
                    {option.name}
                    {selected && <Checkmark aria-hidden="true">✓</Checkmark>}
                  </LanguageRow>
                );
              })}
            </LanguageList>
          </LanguageModalContainer>
        </ModalBackground>
      )}
    </>
  );
};

export default LanguageSelectorButton;
