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
  gap: var(--ethora-space-3, 12px);
  padding: var(--ethora-space-2, 8px) 0 var(--ethora-space-1, 4px);
  text-align: center;
`;

export const ProfileHeroName = styled.div`
  font-size: var(--ethora-font-size-lg, 18px);
  font-weight: var(--ethora-font-weight-semibold, 600);
  color: var(--ethora-color-text, #141414);
  overflow-wrap: anywhere;
`;

export const ProfileHeroSubtitle = styled.div`
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: var(--ethora-font-weight-regular, 400);
  color: var(--ethora-color-text-muted, #8c8c8c);
`;

/** Stack of full-width action buttons, one per row. */
export const ProfileActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--ethora-space-2, 8px);
  width: 100%;
`;
