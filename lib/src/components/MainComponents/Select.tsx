import React, { useCallback, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { useT } from '../../i18n/useT';
import { fadeInAnimation } from '../../styles/motion';
import { useModalDismiss } from '../../hooks/useModalDismiss';

const rotateUp = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(180deg);
  }
`;

const rotateDown = keyframes`
  from {
    transform: rotate(180deg);
  }
  to {
    transform: rotate(0deg);
  }
`;

const SelectWrapper = styled.div`
  position: relative;
  width: 100%;
`;

const SelectBox = styled.div<{ $isOpen: boolean; $borderColor?: string }>`
  border: 1px solid
    ${({ $borderColor, $isOpen }) =>
      $isOpen
        ? $borderColor || 'var(--ethora-color-primary, #0052cd)'
        : $borderColor || 'var(--ethora-color-border, #e6e8ec)'};
  padding: 0 16px;
  height: 48px;
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  background-color: var(--ethora-color-bg, #fff);
  color: var(--ethora-color-text, #141414);
  font-size: var(--ethora-font-size, 16px);
  border-radius: var(--ethora-radius-md, 16px);
  transition:
    border-color var(--ethora-motion-fast, 150ms) var(--ethora-motion-ease, ease),
    box-shadow var(--ethora-motion-fast, 150ms) var(--ethora-motion-ease, ease);

  ${({ $isOpen }) =>
    $isOpen &&
    css`
      outline: 2px solid var(--ethora-color-primary, #0052cd);
      outline-offset: 1px;
    `}

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 1px;
  }
`;

const Placeholder = styled.span`
  color: var(--ethora-color-text-muted, #8c8c8c);
`;

const Icon = styled.span<{ $isOpen: boolean }>`
  margin-left: 10px;
  display: inline-block;
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-size: 12px;
  animation: ${(props) => (props.$isOpen ? rotateUp : rotateDown)} 0.3s ease
    forwards;
`;

const Dropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  background-color: var(--ethora-color-bg, #fff);
  max-height: 200px;
  overflow-y: auto;
  margin-top: 4px;
  border-radius: var(--ethora-radius-md, 16px);
  box-shadow: var(--ethora-shadow-md, 0 4px 12px rgba(16, 24, 40, 0.1));
  z-index: 100;
  ${fadeInAnimation}
`;

const SearchBox = styled.input`
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-bottom: 1px solid var(--ethora-color-border, #e6e8ec);
  outline: none;
  box-sizing: border-box;
  font-size: var(--ethora-font-size-sm, 14px);
  background: transparent;
  color: var(--ethora-color-text, #141414);

  &::placeholder {
    color: var(--ethora-color-text-muted, #8c8c8c);
  }
`;

const DropdownItem = styled.div<{ $selected?: boolean }>`
  padding: 12px 16px;
  cursor: pointer;
  font-size: var(--ethora-font-size-sm, 14px);
  color: var(--ethora-color-text, #141414);
  background-color: ${({ $selected }) =>
    $selected ? 'var(--ethora-color-primary-soft, #e7edf9)' : 'transparent'};
  transition: background-color var(--ethora-motion-fast, 150ms);

  &:hover {
    background-color: ${({ $selected }) =>
      $selected
        ? 'var(--ethora-color-primary-soft, #e7edf9)'
        : 'var(--ethora-color-bg-hover, #f0f2f5)'};
  }
`;

interface SelectProps {
  options: { name: string; id: string }[];
  placeholder: string;
  onSelect: (selected: { name: string; id: string }) => void;
  accentColor?: string;
  selectedValue?: { name: string; id: string };
}

const Select: React.FC<SelectProps> = ({
  options,
  placeholder,
  onSelect,
  accentColor,
  selectedValue,
}) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<{ name: string; id: string } | null>(
    selectedValue
  );
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const toggleDropdown = () => setIsOpen((prev) => !prev);

  const handleSelect = (option: { name: string; id: string }) => {
    setSelected(option);
    onSelect(option);
    setIsOpen(false);
    setSearchTerm('');
  };

  const filteredOptions = options.filter((option) =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Dismissal (Escape on the topmost layer, outside press, and closing when
  // any other menu or modal opens) comes from the shared layer stack instead
  // of a private mousedown listener, so this select behaves like every other
  // overlay in the chat UI.
  const closeDropdown = useCallback(() => setIsOpen(false), []);

  useModalDismiss({
    enabled: isOpen,
    onClose: closeDropdown,
    kind: 'menu',
    insideRefs: [wrapperRef],
    closeOnOutsidePress: true,
  });

  const handleBoxKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleDropdown();
    } else if (event.key === 'Escape' && isOpen) {
      setIsOpen(false);
    }
  };

  const handleItemKeyDown = (
    event: React.KeyboardEvent,
    option: { name: string; id: string }
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect(option);
    }
  };

  return (
    <SelectWrapper ref={wrapperRef}>
      <SelectBox
        $isOpen={isOpen}
        onClick={toggleDropdown}
        onKeyDown={handleBoxKeyDown}
        $borderColor={accentColor}
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selected ? (
          <span>{selected.name}</span>
        ) : (
          <Placeholder>{placeholder}</Placeholder>
        )}
        <Icon style={{ color: accentColor }} $isOpen={isOpen}>
          {'▼'}
        </Icon>
      </SelectBox>
      {isOpen && (
        <Dropdown role="listbox">
          <SearchBox
            type="text"
            placeholder={t('search.placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <DropdownItem
                key={option.id}
                onClick={() => handleSelect(option)}
                onKeyDown={(e) => handleItemKeyDown(e, option)}
                role="option"
                tabIndex={0}
                aria-selected={selected?.id === option.id}
                $selected={selected?.id === option.id}
              >
                {option.name}
              </DropdownItem>
            ))
          ) : (
            <DropdownItem>{t('select.noOptions')}</DropdownItem>
          )}
        </Dropdown>
      )}
    </SelectWrapper>
  );
};

export default Select;
