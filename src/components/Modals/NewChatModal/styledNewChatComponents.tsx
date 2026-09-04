import styled from 'styled-components';
import { reducedMotion } from '../../../styles/motion';

// --- Chat-type segmented control (Public | Private) ------------------------
//
// Visual/keyboard language mirrors the sidebar's "Chats"/"Files" tab
// switcher (`src/components/styled/RoomListComponents/index.tsx`'s
// TabsContainer/TabButton/TabIndicator): a pill track with a sliding
// highlight behind the active option, roving tabindex + arrow-key
// navigation. Kept as a local pair rather than reusing those exports
// because semantically this is a single-select field (role="radiogroup"),
// not a view switcher (role="tablist") - the visual language is shared,
// the ARIA role is not.

export const ChatTypeGroup = styled.div`
  position: relative;
  display: flex;
  gap: 4px;
  padding: 4px;
  width: 100%;
  box-sizing: border-box;
  background: var(--ethora-color-bg-subtle, #f5f7fa);
  border-radius: var(--ethora-radius-md, 12px);
`;

export const ChatTypeIndicator = styled.div<{ $index: number; $count: number }>`
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: ${({ $count }) => `calc((100% - 8px) / ${$count})`};
  border-radius: var(--ethora-radius-sm, 8px);
  background: var(--ethora-color-bg, #fff);
  box-shadow: var(--ethora-shadow-sm, 0 1px 2px rgba(16, 24, 40, 0.06));
  transform: ${({ $index }) => `translateX(${$index * 100}%)`};
  transition: transform var(--ethora-motion-base, 220ms)
    var(--ethora-motion-ease, cubic-bezier(0.2, 0.8, 0.2, 1));
  ${reducedMotion}
`;

export const ChatTypeOption = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active: boolean }>`
  position: relative;
  z-index: 1;
  flex: 1;
  border: none;
  background: transparent;
  /* min ~40px touch target */
  min-height: 40px;
  padding: 10px 16px;
  border-radius: var(--ethora-radius-sm, 8px);
  font-size: var(--ethora-font-size-md, 15px);
  font-weight: ${({ active }) => (active ? 600 : 500)};
  color: ${({ active }) =>
    active
      ? 'var(--ethora-color-text, #141414)'
      : 'var(--ethora-color-text-secondary, #5A5F66)'};
  cursor: pointer;
  transition: color var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, cubic-bezier(0.2, 0.8, 0.2, 1));

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }

  ${reducedMotion}
`;

// --- Inline, animated reveal for the "Private" user picker ------------------
//
// Grid-template-rows 0fr -> 1fr is used instead of a fixed max-height because
// the picker's content height is dynamic (search box + N rows up to its own
// internal 340px cap) - this animates smoothly to whatever height the content
// actually needs rather than guessing a ceiling. `$expanded` starts false on
// mount and is flipped to true a frame later (see NewChatModal.tsx) so the
// transition actually plays instead of the section appearing already open.
export const InlineUsersWrapper = styled.div<{ $expanded: boolean }>`
  display: grid;
  grid-template-rows: ${({ $expanded }) => ($expanded ? '1fr' : '0fr')};
  opacity: ${({ $expanded }) => ($expanded ? 1 : 0)};
  width: 100%;
  transition:
    grid-template-rows var(--ethora-motion-base, 220ms)
      var(--ethora-motion-ease, cubic-bezier(0.2, 0.8, 0.2, 1)),
    opacity var(--ethora-motion-base, 220ms)
      var(--ethora-motion-ease, cubic-bezier(0.2, 0.8, 0.2, 1));
  ${reducedMotion}
`;

export const InlineUsersInner = styled.div`
  min-height: 0;
  overflow: hidden;
  width: 100%;
  box-sizing: border-box;
`;
