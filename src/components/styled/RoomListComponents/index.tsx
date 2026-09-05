import styled, { css } from 'styled-components';
import {
  fadeInAnimation,
  fadeInUpAnimation,
  reducedMotion,
  shimmerBackground,
} from '../../../styles/motion';

export const Container = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'burgerMenu' && prop !== 'open',
})<{ burgerMenu?: boolean; open?: boolean }>`
  ${({ burgerMenu, open }) =>
    burgerMenu
      ? css`
          position: fixed;
          left: 0;
          top: 0;
          width: 300px;
          height: 100%;
          transform: ${open ? 'translateX(0)' : 'translateX(-100%)'};
          transition: transform var(--ethora-motion-base, 220ms)
            var(--ethora-motion-ease, cubic-bezier(0.2, 0.8, 0.2, 1));
          z-index: 2;
          display: flex;
          flex-direction: column;
          background-color: var(--ethora-color-bg, #fff);
          padding: 16px;
          padding-top: 0px;
          z-index: 1000;
          border-right: 1px solid var(--ethora-color-border, #e6e8ec);
          ${reducedMotion}
        `
      : css`
          box-sizing: border-box;
          padding: 16px;
          padding-top: 0px;
          overflow: auto;
          display: relative;
          z-index: 2;
          background-color: var(--ethora-color-bg, #fff);
          min-width: 343px;
          border-right: 1px solid var(--ethora-color-border, #e6e8ec);

          /* Adapt to narrow viewports: a fixed min-width pushed the list
             wider than the screen and produced a horizontal scrollbar on
             mobile. Let it shrink to the container and cap padding. */
          @media (max-width: 767px) {
            min-width: 0;
            width: 100%;
            max-width: 100%;
            padding-left: 12px;
            padding-right: 12px;
          }
        `}
`;

export const BurgerButton = styled.button`
  /* position: fixed; */
  left: 10px;
  top: 10px;
  color: var(--ethora-color-text-secondary, #333);
  border: none;
  background: transparent;
  padding: 10px;
  cursor: pointer;
  z-index: 1000;

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
    border-radius: var(--ethora-radius-sm, 8px);
  }
`;

// Row: 56-64px tall, active/hover use soft tokenized backgrounds rather than
// a solid brand fill so the (always-dark) text stays legible in both states.
export const ChatItem = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active: boolean; bg?: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  border-radius: var(--ethora-radius-md, 12px);
  gap: 16px;
  padding: 8px;
  /* Breathing room from the hairline divider between rows: the divider is a
     plain straight-edged rectangle, and without a gap it sat flush against
     this row's rounded corners - on hover/active (a tinted, rounded
     highlight box) that read as the divider "leaking out" past the curve.
     A couple pixels of margin decouples the divider from the highlight in
     every state, not just the ones a script can detect. */
  margin: 2px 0;
  cursor: pointer;
  background-color: ${({ active }) =>
    active ? 'var(--ethora-color-primary-soft, #E7EDF9)' : 'transparent'};
  color: var(--ethora-color-text, #141414);
  transition:
    background-color var(--ethora-motion-fast, 150ms)
      var(--ethora-motion-ease, cubic-bezier(0.2, 0.8, 0.2, 1)),
    transform var(--ethora-motion-fast, 150ms)
      var(--ethora-motion-ease, cubic-bezier(0.2, 0.8, 0.2, 1));

  &:hover {
    background-color: ${({ active }) =>
      active
        ? 'var(--ethora-color-primary-soft, #E7EDF9)'
        : 'var(--ethora-color-bg-hover, #F0F2F5)'};
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }

  ${reducedMotion}
`;

export const SearchContainer = styled.div<{}>`
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 50px;
  padding: 12px 0px;

  /* Mobile: breathing room ABOVE the search (gap from the header) and a
     smaller gap BELOW it, so the input isn't glued to the first chat row. */
  @media (max-width: 767px) {
    height: auto;
    padding: 16px 0 12px 0;
  }
`;

export const ScollableContainer = styled.div<{}>`
  height: 100%;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  position: sticky;
`;

export const ChatInfo = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 60%;
  text-align: start;
`;

export const ChatName = styled.div`
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const LastMessage = styled.div`
  color: var(--ethora-color-text-secondary, #5a5f66);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const UserCount = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active: boolean }>`
  color: var(--ethora-color-text-muted, #8c8c8c);
  margin-left: auto;
`;

// `$hidden` keeps the divider's layout footprint (height + surrounding
// spacing) reserved even when it shouldn't be visible - e.g. flanking the
// active row's own highlight box, where a visible hairline would cut across
// its rounded corners. Using visibility:hidden (not display:none, and not
// skipping the element) means selecting a different room never changes the
// total stacked height of the rows below it - only which dividers are
// painted, never how many take up space.
export const Divider = styled.div<{ $hidden?: boolean }>`
  height: 1px;
  width: 100%;
  background-color: var(--ethora-color-border, #e6e8ec);
  opacity: 0.6;
  visibility: ${({ $hidden }) => ($hidden ? 'hidden' : 'visible')};
`;

// Row appears with a subtle rise+fade the first time it's ever rendered
// (initial room list load, or a genuinely new room). `$skipAnimation` is set
// for rows that have already played their entrance once - resorting the
// list (new message bumps a room to the top, search filters rows in/out)
// must never re-trigger it. Note: re-declaring the `animation` shorthand -
// even to the same keyframe/duration - restarts a CSS animation from the
// start, so this has to be a distinct, static rule branch rather than a
// dynamic `animation-delay` on an otherwise-identical declaration.
export const AnimatedRow = styled.div<{
  $delay?: number;
  $skipAnimation?: boolean;
}>`
  ${({ $skipAnimation }) => ($skipAnimation ? '' : fadeInUpAnimation)}
  animation-delay: ${({ $delay, $skipAnimation }) =>
    !$skipAnimation && $delay ? `${Math.min($delay, 240)}ms` : '0ms'};
`;

// --- Tab switcher (segmented control): "Chats" | "Files" -------------------

export const TabsContainer = styled.div`
  position: relative;
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--ethora-color-bg-subtle, #f5f7fa);
  border-radius: var(--ethora-radius-md, 12px);
  margin-bottom: 8px;
`;

export const TabIndicator = styled.div<{ $index: number; $count: number }>`
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

export const TabButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active: boolean }>`
  position: relative;
  z-index: 1;
  flex: 1;
  border: none;
  background: transparent;
  padding: 8px 12px;
  border-radius: var(--ethora-radius-sm, 8px);
  font-size: var(--ethora-font-size-sm, 14px);
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

// Cross-fade wrapper for tab content (Chats <-> Files).
export const TabContent = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  ${fadeInAnimation}
`;

// --- Loading skeleton --------------------------------------------------

export const SkeletonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 60px;
  padding: 8px;
  box-sizing: border-box;
`;

export const SkeletonAvatar = styled.div`
  width: 44px;
  height: 44px;
  border-radius: var(--ethora-radius-full, 999px);
  flex-shrink: 0;
  ${shimmerBackground}
`;

export const SkeletonLines = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
`;

export const SkeletonLine = styled.div<{ $width?: string }>`
  height: 10px;
  border-radius: var(--ethora-radius-sm, 8px);
  width: ${({ $width }) => $width || '60%'};
  ${shimmerBackground}
`;
