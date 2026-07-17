import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import {
  setLangSource,
  setTranslateSendEnabled,
  setTranslateMode,
} from '../../roomStore/chatSettingsSlice';
import { GlobeIcon } from '../../assets/icons';
import { LANGUAGE_OPTIONS } from '../../helpers/constants/LANGUAGE_OPTIONS';
import { Iso639_1Codes } from '../../types/models/language.model';
import { useT } from '../../i18n/useT';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import {
  canReaderChooseTranslateMode,
  resolveTranslateMode,
} from '../../utils/translateModePolicy';
import Switch from './Switch';
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

const TranslateToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 14px;
`;

const TranslateToggleLabel = styled.span`
  font-size: 15px;
  color: #141414;
`;

const TranslateDisclaimer = styled.p`
  margin: -8px 14px 4px;
  font-size: 12px;
  line-height: 1.4;
  color: #8c8c8c;
`;

const Divider = styled.div`
  height: 1px;
  background: rgba(0, 0, 0, 0.08);
  margin: 4px 0;
`;

const ModeSwitchRow = styled.div`
  display: flex;
  gap: 8px;
  padding: 0 14px 4px;
`;

const ModeButton = styled.button<{ $selected: boolean; $accent: string }>`
  flex: 1;
  padding: 8px 0;
  border-radius: 8px;
  border: 1px solid
    ${({ $selected, $accent }) => ($selected ? $accent : 'rgba(0, 0, 0, 0.12)')};
  background: ${({ $selected, $accent }) => ($selected ? `${$accent}1a` : 'transparent')};
  color: ${({ $selected, $accent }) => ($selected ? $accent : '#141414')};
  font-size: 14px;
  font-weight: ${({ $selected }) => ($selected ? 600 : 400)};
  cursor: pointer;

  &:hover {
    background: ${({ $selected, $accent }) => ($selected ? `${$accent}1a` : 'rgba(0, 0, 0, 0.04)')};
  }
`;

export const LanguageSelectorButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dispatch = useDispatch();
  const t = useT();
  const { config, translateSendEnabled, translateMode } = useChatSettingState();
  const langSource = useSelector(
    (state: RootState) => state.chatSettingStore.langSource
  );
  const accentColor = config?.colors?.primary || '#0052CD';
  const translatesEnabled = !!config?.translates?.enabled;
  // Undefined (reader never touched the toggle) reads as ON - matches the
  // send-path default in useSendMessage, so the switch shows the state
  // that's actually in effect rather than defaulting to a misleading "off".
  const sendEnabled = translateSendEnabled !== false;
  // false whenever the host pinned config.translates.forceType: true - the
  // switcher below must not render at all in that case, not just be inert.
  const canChooseMode = canReaderChooseTranslateMode(config?.translates);
  const effectiveMode = resolveTranslateMode(config?.translates, translateMode);
  // Default true: hosts that don't set this keep the language list they
  // already have. Set to false to keep only the enable/disable toggle -
  // for hosts driving the reader's language externally via readerLocale.
  const showLanguageList = config?.translates?.showLanguageList !== false;

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
              <CloseButton onClick={() => setIsOpen(false)} aria-label={t('action.cancel')}>
                &times;
              </CloseButton>
              <ModalTitle>{t('language.select')}</ModalTitle>
              {translatesEnabled && (
                <>
                  <TranslateToggleRow>
                    <TranslateToggleLabel>
                      {t('translation.enableToggleLabel')}
                    </TranslateToggleLabel>
                    <Switch
                      checked={sendEnabled}
                      bgColor={accentColor}
                      onToggle={(isOn) =>
                        dispatch(setTranslateSendEnabled(isOn))
                      }
                    />
                  </TranslateToggleRow>
                  <TranslateDisclaimer>
                    {t('translation.enableToggleDisclaimer')}
                  </TranslateDisclaimer>
                  {canChooseMode && (
                    <ModeSwitchRow role="radiogroup" aria-label={t('translation.modeLabel')}>
                      <ModeButton
                        type="button"
                        role="radio"
                        aria-checked={effectiveMode === 'auto'}
                        $selected={effectiveMode === 'auto'}
                        $accent={accentColor}
                        onClick={() => dispatch(setTranslateMode('auto'))}
                      >
                        {t('translation.modeAuto')}
                      </ModeButton>
                      <ModeButton
                        type="button"
                        role="radio"
                        aria-checked={effectiveMode === 'manual'}
                        $selected={effectiveMode === 'manual'}
                        $accent={accentColor}
                        onClick={() => dispatch(setTranslateMode('manual'))}
                      >
                        {t('translation.modeManual')}
                      </ModeButton>
                    </ModeSwitchRow>
                  )}
                  {showLanguageList && <Divider />}
                </>
              )}
              {showLanguageList && (
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
              )}
            </LanguageModalContainer>
          </LanguageModalBackground>,
          document.body
        )}
    </>
  );
};

export default LanguageSelectorButton;
