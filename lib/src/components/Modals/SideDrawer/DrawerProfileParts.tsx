import styled, { css } from 'styled-components';

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

// ---------------------------------------------------------------------------
// About / facts - replaces the old "label above value, twice, each in its
// own bordered box" treatment (read as a disabled form). A description is
// prose, not a field, so it gets no label at all; a fact like the chat type
// is a small tag, not a box.
// ---------------------------------------------------------------------------

/**
 * Room/profile description, set directly under the hero with no "Description"
 * label above it - the About section heading already says what this is.
 * When there is no description yet, `$empty` swaps in a muted italic tone so
 * the placeholder line reads as an unwritten blank rather than a failed
 * value, without changing the copy or the layout.
 */
export const DrawerDescriptionText = styled.p<{ $empty?: boolean }>`
  margin: 0;
  font-size: var(--ethora-font-size-sm, 14px);
  line-height: var(--ethora-line-height-normal, 1.5);
  color: ${({ $empty }) =>
    $empty
      ? 'var(--ethora-color-text-muted, #8c8c8c)'
      : 'var(--ethora-color-text, #141414)'};
  font-style: ${({ $empty }) => ($empty ? 'italic' : 'normal')};
  text-align: start;
  overflow-wrap: anywhere;
`;

/** Small icon+label tag for a single fact (chat type, visibility, ...). */
export const DrawerFactPill = styled.span`
  display: inline-flex;
  /* The pill is usually a child of a column flex container, which blockifies
     inline-flex and stretches it to the full column width unless it opts out.
     A pill that spans the whole panel reads as a banner, not as a tag. */
  align-self: flex-start;
  align-items: center;
  gap: var(--ethora-space-1, 4px);
  padding: var(--ethora-space-1, 4px) var(--ethora-space-3, 12px);
  border-radius: var(--ethora-radius-full, 999px);
  background: var(--ethora-color-primary-soft, #e7edf9);
  color: var(--ethora-color-primary, #0052cd);
  font-size: var(--ethora-font-size-xs, 12px);
  font-weight: var(--ethora-font-weight-semibold, 600);

  & > svg {
    width: 14px;
    height: 14px;
  }
`;

const emptyStateSizing = css<{ $compact?: boolean }>`
  padding: ${({ $compact }) =>
    $compact
      ? 'var(--ethora-space-4, 16px) var(--ethora-space-2, 8px)'
      : 'var(--ethora-space-6, 24px) var(--ethora-space-4, 16px)'};
`;

/**
 * A deliberate blank state - icon, title, optional hint - for "nothing here
 * yet" spots (no files, no members) that used to be a single line of grey
 * text sitting in a box and reading like something had gone wrong.
 */
export const DrawerEmptyState = styled.div<{ $compact?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--ethora-space-1, 4px);
  color: var(--ethora-color-text-secondary, #5a5f66);
  ${emptyStateSizing}

  & > svg {
    opacity: 0.7;
    margin-bottom: var(--ethora-space-1, 4px);
  }
`;

export const DrawerEmptyStateTitle = styled.div`
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: var(--ethora-font-weight-medium, 500);
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

export const DrawerEmptyStateHint = styled.div`
  font-size: var(--ethora-font-size-xs, 12px);
  color: var(--ethora-color-text-muted, #8c8c8c);
`;
