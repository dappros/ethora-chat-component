import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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

// Reported bug: the backdrop only dimmed the chat column and left the
// room-list sidebar untouched, with the modal card off-center as a result -
// as if the fixed backdrop's containing block were ChatContainer rather
// than the viewport. Isolated CSS repros of the suspected cause
// (ChatContainer's `overflow: hidden`) did NOT reproduce that clipping -
// plain `overflow: hidden` does not constrain a `position: fixed`
// descendant - so the exact mechanism in the live app is unconfirmed.
// Rendering via a portal to `document.body` sidesteps the entire ancestor
// chain regardless of which property was actually responsible, which is
// the standard fix for "this fixed overlay is somehow bounded by an
// ancestor" - see the createPortal call below. z-index stays bumped as a
// second guard against the unrelated stacking-order tie with RoomList's
// burger-menu sidebar (also z-index: 1000).
const LanguageModalBackground = styled(ModalBackground)`
  z-index: 1300;
`;

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

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <LanguageModalBackground onClick={() => setIsOpen(false)}>
            <LanguageModalContainer onClick={(e) => e.stopPropagation()}>
              <CloseButton style={{width: '8px'}} onClick={() => setIsOpen(false)} aria-label={t('action.cancel')}>
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
          </LanguageModalBackground>,
          document.body
        )}
    </>
  );
};

export default LanguageSelectorButton;
