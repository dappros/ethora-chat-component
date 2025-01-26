import React, { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';

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

const SelectBox = styled.div<{ isOpen: boolean; borderColor?: string }>`
  border: ${({ borderColor }) =>
    borderColor ? `1px solid ${borderColor}` : '1px solid #ccc'};
  padding: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  background-color: #fff;
  border-radius: 5px;
  box-shadow: ${(props) =>
    props.isOpen ? '0px 4px 8px rgba(0, 0, 0, 0.1)' : 'none'};
  transition: box-shadow 0.3s ease;
`;

const Placeholder = styled.span`
  color: #aaa;
`;

const Icon = styled.span<{ isOpen: boolean }>`
  margin-left: 10px;
  display: inline-block;
  animation: ${(props) => (props.isOpen ? rotateUp : rotateDown)} 0.3s ease
    forwards;
`;

const Dropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  border: 1px solid #ccc;
  background-color: #fff;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 5px;
  border-radius: 5px;
  box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
`;

const SearchBox = styled.input`
  width: 100%;
  padding: 10px;
  border: none;
  border-bottom: 1px solid #ccc;
  outline: none;
  box-sizing: border-box;
`;

const DropdownItem = styled.div`
  padding: 10px;
  cursor: pointer;

  &:hover {
    background-color: #f0f0f0;
  }
`;

interface SelectProps {
  options: { name: string; id: string }[];
  placeholder: string;
  onSelect: (selected: { name: string; id: string }) => void;
  accentColor?: string;
}

const Select: React.FC<SelectProps> = ({
  options,
  placeholder,
  onSelect,
  accentColor,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<{ name: string; id: string } | null>(
    null
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

  const handleOutsideClick = (event: MouseEvent) => {
    if (
      wrapperRef.current &&
      !wrapperRef.current.contains(event.target as Node)
    ) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    } else {
      document.removeEventListener('mousedown', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  return (
    <SelectWrapper ref={wrapperRef}>
      <SelectBox
        isOpen={isOpen}
        onClick={toggleDropdown}
        borderColor={accentColor}
      >
        {selected ? (
          <span>{selected.name}</span>
        ) : (
          <Placeholder>{placeholder}</Placeholder>
        )}
        <Icon style={{ color: accentColor }} isOpen={isOpen}>
          {'▼'}
        </Icon>
      </SelectBox>
      {isOpen && (
        <Dropdown>
          <SearchBox
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <DropdownItem
                key={option.id}
                onClick={() => handleSelect(option)}
              >
                {option.name}
              </DropdownItem>
            ))
          ) : (
            <DropdownItem>No options found</DropdownItem>
          )}
        </Dropdown>
      )}
    </SelectWrapper>
  );
};

export default Select;
