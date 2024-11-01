import React, { useState, useRef, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';

interface MenuOption {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface DropdownMenuProps {
  options: MenuOption[];
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top?: string;
    left?: string;
    right?: string;
    bottom?: string;
  }>({
    top: '60px',
    right: '-140px',
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggleMenu = () => setIsOpen((prev) => !prev);

  //   useEffect(() => {
  //     if (isOpen && menuRef.current && buttonRef.current) {
  //       const adjustPosition = () => {
  //         const menuRect = menuRef.current!.getBoundingClientRect();
  //         const buttonRect = buttonRef.current!.getBoundingClientRect();

  //         let top = buttonRect.bottom;
  //         let left = 12;
  //         let bottom: number | undefined;
  //         let right: number | undefined;

  //         if (menuRect.bottom > window.innerHeight) {
  //           top = undefined;
  //           bottom = window.innerHeight - buttonRect.top + 10;
  //         }

  //         setMenuPosition({
  //           top: top !== undefined ? `${top}px` : undefined,
  //           bottom: bottom !== undefined ? `${bottom}px` : undefined,
  //           left: left !== undefined ? `${left}px` : undefined,
  //           right: right !== undefined ? `${right}px` : undefined,
  //         });
  //       };

  //       adjustPosition();
  //     }
  //   }, [isOpen]);

  return (
    <Container>
      <MenuButton ref={buttonRef} onClick={toggleMenu}>
        <Icon>☰</Icon>
      </MenuButton>
      {isOpen && (
        <Menu
          ref={menuRef}
          style={{
            top: menuPosition.top,
            bottom: menuPosition.bottom,
            left: menuPosition.left,
            right: menuPosition.right,
          }}
        >
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
                <Label>{option.label}</Label>
              </MenuItem>
              <Divider />
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

const MenuButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 24px;
  padding: 8px;
  display: flex;
  align-items: center;
`;

const Icon = styled.span`
  font-size: 24px;
`;

const Menu = styled.div`
  position: absolute;
  background-color: white;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  padding: 16px;
  min-width: 150px;
  animation: ${fadeIn} 0.2s ease-out;
  z-index: 1000;
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
