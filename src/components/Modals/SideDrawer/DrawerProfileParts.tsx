import styled from 'styled-components';

/**
 * The identity block at the top of a profile-style drawer: avatar, then the
 * name. It carries no section heading on purpose - it IS the heading for the
 * panel, and a "Profile" label above a face reads as filler.
 *
 * Shared by the user profile and the room profile so the two panels open with
 * the same shape.
 */
export const ProfileHero = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ethora-space-4, 16px);
  padding: var(--ethora-space-3, 12px) 0 var(--ethora-space-2, 8px);
  text-align: center;

  /*
   * The avatar (ProfileImagePlaceholder) is always this block's first and
   * only non-text child - both callers (ChatProfileModal, UserProfileModal)
   * render it first, before the name. A soft ring around it - the panel's
   * own background colour, then the same elevation a card gets - lifts it
   * off the page as the one deliberately-composed focal point instead of a
   * flat circle sitting in a vertical stack. Targeting the position (not a
   * class) means this works without touching ProfileImagePlaceholder itself,
   * which is outside this pass's file list.
   */
  & > *:first-child {
    box-shadow:
      0 0 0 4px var(--ethora-color-bg, #fff),
      var(--ethora-shadow-md, 0 4px 12px rgba(16, 24, 40, 0.1));
    border-radius: var(--ethora-radius-full, 999px);
  }
`;

/**
 * The one bold, largest line in the entire panel family: deliberately so.
 * Everything else in these drawers tops out at semibold (section labels,
 * header title, row labels), so this is the only place `font-weight-bold`
 * is used - it is what makes the hero read as the peak of the hierarchy
 * instead of just another slightly-bigger label.
 */
export const ProfileHeroName = styled.div`
  font-size: var(--ethora-font-size-xl, 22px);
  font-weight: var(--ethora-font-weight-bold, 700);
  line-height: var(--ethora-line-height-tight, 1.25);
  color: var(--ethora-color-text, #141414);
  overflow-wrap: anywhere;
`;

export const ProfileHeroSubtitle = styled.div`
  margin-top: var(--ethora-space-1, 4px);
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: var(--ethora-font-weight-medium, 500);
  color: var(--ethora-color-text-muted, #8c8c8c);
`;

/** Stack of full-width action buttons, one per row. */
export const ProfileActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--ethora-space-2, 8px);
  width: 100%;
  margin-top: var(--ethora-space-1, 4px);
`;
