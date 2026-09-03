import React, { useState } from 'react';
import styled from 'styled-components';

interface DropdownProps {
  sortFunction: (value: string) => void;
  icon: string;
  values: string[];
}

const DropdownContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const DropdownButton = styled.button`
  background-color: transparent;
  border: none;
  cursor: pointer;
  border-radius: var(--ethora-radius-sm, 8px);

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

const DropdownIcon = styled.span`
  margin-left: 5px;
`;

const DropdownList = styled.ul`
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1;
  list-style-type: none;
  padding: var(--ethora-space-1, 4px) 0;
  margin: 0;
  background-color: var(--ethora-color-bg, #fff);
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-radius: var(--ethora-radius-sm, 8px);
  box-shadow: var(--ethora-shadow-md, 0 4px 12px rgba(16, 24, 40, 0.1));
`;

const DropdownItem = styled.li`
  padding: var(--ethora-space-2, 8px) var(--ethora-space-3, 12px);
  cursor: pointer;
  font-size: var(--ethora-font-size-sm, 14px);
  color: var(--ethora-color-text, #141414);

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }
`;

const DropdownMenu: React.FC<DropdownProps> = ({
  sortFunction,
  icon,
  values,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleItemClick = (value: string) => {
    sortFunction(value);
    setIsOpen(false);
  };

  return (
    <DropdownContainer>
      <DropdownButton onClick={() => setIsOpen(!isOpen)}>
        {icon && <DropdownIcon>{icon}</DropdownIcon>}
      </DropdownButton>
      {isOpen && (
        <DropdownList>
          {values.map((value) => (
            <DropdownItem key={value} onClick={() => handleItemClick(value)}>
              {value}
            </DropdownItem>
          ))}
        </DropdownList>
      )}
    </DropdownContainer>
  );
};

export default DropdownMenu;
