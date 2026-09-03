import React, { useState, useRef, useEffect, ReactElement } from 'react';
import styled from 'styled-components';
import { BurgerMenuIcon } from '../../assets/icons';
import Button from '../styled/Button';
import { scaleInAnimation } from '../../styles/motion';

interface MenuOption {
  label: string;
  icon: React.ReactNode;
  onClick: (e?: any) => void;
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

  const toggleMenu = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setIsOpen((prev) => !prev);
  };

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
        React.cloneElement(openButton, {
          ref: buttonRef,
          onClick: toggleMenu,
        } as any)
      ) : (
        <Button onClick={toggleMenu}>{menuIcon ?? <BurgerMenuIcon />}</Button>
      )}
      {isOpen && (
        <Menu ref={menuRef} style={menuPosition}>
          {options.map((option, index) => (
            <React.Fragment key={`${option.label}-${index}`}>
              <MenuItem
                onClick={() => {
                  option.onClick();
                  setIsOpen(false);
                }}
              >
                {option.icon}
                <Label style={{ ...option?.styles }}>{option.label}</Label>
              </MenuItem>
              {index < options?.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </Menu>
      )}
    </Container>
  );
};

export default DropdownMenu;

// Styling
const Divider = styled.div`
  height: 1px;
  width: 100%;
  background-color: var(--ethora-color-border, #e6e8ec);
`;

const Container = styled.div`
  position: relative;
  display: inline-block;
`;

const Menu = styled.div`
  position: absolute;
  background-color: var(--ethora-color-bg, #fff);
  border-radius: var(--ethora-radius-md, 12px);
  padding: var(--ethora-space-2, 8px);
  min-width: 150px;
  transform-origin: top right;
  ${scaleInAnimation}
  z-index: 1000;

  box-shadow: var(--ethora-shadow-md, 0 4px 12px rgba(16, 24, 40, 0.1));
`;

const MenuItem = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: background var(--ethora-motion-fast, 150ms);
  padding: var(--ethora-space-2, 8px);
  border-radius: var(--ethora-radius-sm, 8px);
  gap: 8px;

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }
`;

const Label = styled.span`
  margin-left: 2px;
  font-size: var(--ethora-font-size, 14px);
  color: var(--ethora-color-text, #141414);
`;
