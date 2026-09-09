import React, {
  useState,
  useRef,
  useCallback,
  ReactElement,
} from 'react';
import styled from 'styled-components';
import { BurgerMenuIcon } from '../../assets/icons';
import Button from '../styled/Button';
import { scaleInAnimation } from '../../styles/motion';
import { useT } from '../../i18n/useT';
import { useModalDismiss } from '../../hooks/useModalDismiss';

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
  onClose,
  openButton,
  position = 'right',
  menuIcon,
}) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  // Wraps trigger + menu. Used as the "inside" region for outside-press
  // dismissal so pressing the trigger while the menu is open closes it once
  // (via the toggle) instead of closing and instantly re-opening it.
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const menuPosition =
    position === 'right'
      ? { top: '60px', right: '-140px' }
      : { top: '60px', right: '0px' };

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  const toggleMenu = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (isOpen) {
      closeMenu();
    } else {
      setIsOpen(true);
    }
  };

  // Escape (topmost layer only), press-outside, single-menu-at-a-time and
  // focus restore all come from the shared layer stack, so every consumer of
  // DropdownMenu - and any future menu wired to the same hook - behaves the
  // same way without per-call-site handling.
  useModalDismiss({
    enabled: isOpen,
    onClose: closeMenu,
    kind: 'menu',
    containerRef: menuRef,
    insideRefs: [containerRef],
    closeOnOutsidePress: true,
  });

  const triggerA11yProps = {
    'aria-haspopup': 'menu' as const,
    'aria-expanded': isOpen,
  };

  const focusItem = (index: number) => {
    const items = menuRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]'
    );
    if (!items || items.length === 0) return;
    const wrapped = (index + items.length) % items.length;
    items[wrapped]?.focus();
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    const current = items.indexOf(document.activeElement as HTMLElement);
    focusItem(current + (e.key === 'ArrowDown' ? 1 : -1));
  };

  return (
    <Container ref={containerRef}>
      {openButton ? (
        React.cloneElement(openButton, {
          ref: buttonRef,
          onClick: toggleMenu,
          ...triggerA11yProps,
        } as any)
      ) : (
        <Button
          ref={buttonRef}
          onClick={toggleMenu}
          aria-label={t('action.moreOptions')}
          {...triggerA11yProps}
        >
          {menuIcon ?? <BurgerMenuIcon />}
        </Button>
      )}
      {isOpen && (
        <Menu
          ref={menuRef}
          style={menuPosition}
          role="menu"
          aria-label={t('action.moreOptions')}
          onKeyDown={handleMenuKeyDown}
        >
          {options.map((option, index) => (
            <React.Fragment key={`${option.label}-${index}`}>
              <MenuItem
                role="menuitem"
                tabIndex={0}
                onClick={() => {
                  option.onClick();
                  closeMenu();
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  option.onClick();
                  closeMenu();
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
