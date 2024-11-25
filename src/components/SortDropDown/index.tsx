import React, { useState } from 'react';
import styled, { css } from 'styled-components';

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
  display: flex;
  align-items: center;
`;

const DropdownIcon = styled.span`
  margin-left: 5px;
`;

const ActiveValue = styled.span`
  margin-left: 10px;
  font-weight: bold;
`;

const DropdownList = styled.ul<{ isOpen: boolean }>`
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1;
  list-style-type: none;
  padding: 0;
  margin: 0;
  background-color: #fff;
  border: 1px solid #ccc;
  max-height: 0;
  overflow: hidden;
  transition:
    max-height 0.3s ease,
    opacity 0.3s ease;
  opacity: 0;

  ${({ isOpen }) =>
    isOpen &&
    css`
      max-height: 200px; /* Adjust max height based on content */
      opacity: 1;
    `}
`;

const DropdownItem = styled.li`
  padding: 10px;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #f2f2f2;
  }
`;

const DropdownMenu: React.FC<DropdownProps> = ({
  sortFunction,
  icon,
  values,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(values[0] || 'Default');

  const handleItemClick = (value: string) => {
    setActiveValue(value);
    sortFunction(value);
    setIsOpen(false);
  };

  const toggleDropdown = () => setIsOpen(!isOpen);

  const handleClickOutside = (event: MouseEvent) => {
    if (!(event.target as HTMLElement).closest('[data-dropdown]')) {
      setIsOpen(false);
    }
  };

  React.useEffect(() => {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  return (
    <DropdownContainer data-dropdown>
      <DropdownButton onClick={toggleDropdown}>
        {icon && <DropdownIcon>{icon}</DropdownIcon>}
        <ActiveValue>{activeValue}</ActiveValue>
      </DropdownButton>
      <DropdownList isOpen={isOpen}>
        {values.map((value) => (
          <DropdownItem key={value} onClick={() => handleItemClick(value)}>
            {value}
          </DropdownItem>
        ))}
      </DropdownList>
    </DropdownContainer>
  );
};

export default DropdownMenu;
