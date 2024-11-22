import React, { useState, useRef, useEffect, ReactElement } from 'react';
import styled, { keyframes } from 'styled-components';
import { BurgerMenuIcon } from '../../assets/icons';
import Button from '../styled/Button';

interface MenuOption {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  styles?: React.CSSProperties;
}

interface DropdownMenuProps {
  options: MenuOption[];
  onClose?: any;
  openButton?: ReactElement;
  position?: 'left' | 'right';
  menuIcon?: React.ReactNode;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({
  options,
  openButton,
  position = 'right',
  menuIcon,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const menuPosition =
    position === 'right'
      ? { top: '60px', right: '-140px' }
      : { top: '60px', right: '0px' };

  const toggleMenu = () => setIsOpen((prev) => !prev);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <Container>
      {openButton ? (
        React.cloneElement(openButton, { ref: buttonRef, onClick: toggleMenu })
      ) : (
        <Button onClick={toggleMenu}>{menuIcon ?? <BurgerMenuIcon />}</Button>
      )}
      {isOpen && (
        <Menu ref={menuRef} style={menuPosition}>
          {options.map((option, index) => (
            <>
              <MenuItem
                key={index}
                onClick={() => {
                  option.onClick();
                  setIsOpen(false);
                }}
              >
                {option.icon}
                <Label style={{ ...option?.styles }}>{option.label}</Label>
              </MenuItem>
              {index < options?.length - 1 && <Divider />}
            </>
          ))}
        </Menu>
      )}
    </Container>
  );
};

export default DropdownMenu;

// Styling (unchanged)
const Divider = styled.div`
  height: 1px;
  width: 100%;
  background-color: #0052cd0d;
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const Container = styled.div`
  position: relative;
  display: inline-block;
`;

const Menu = styled.div`
  position: absolute;
  background-color: #fcfcfc;
  border-radius: 8px;
  padding: 16px;
  min-width: 150px;
  animation: ${fadeIn} 0.2s ease-out;
  z-index: 1000;

  box-shadow: 0px 0px 6px -2px #12121908;
  box-shadow: 0px 0px 16px -4px #12121914;
`;

const MenuItem = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s;
  padding: 8px;
  &:hover {
    background-color: #f0f0f0;
  }
  gap: 8px;
`;

const Label = styled.span`
  margin-left: 10px;
  font-size: 16px;
`;
