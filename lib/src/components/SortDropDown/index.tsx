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
  padding: 0;
  margin: 0;
  background-color: #fff;
  border: 1px solid #ccc;
`;

const DropdownItem = styled.li`
  padding: 10px;
  cursor: pointer;

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
