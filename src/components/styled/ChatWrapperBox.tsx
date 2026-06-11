import styled from 'styled-components';

export const ChatWrapperBox = styled.div`
  height: 100%;
  width: 100%;
  position: relative;
  display: flex;
  flex-direction: row;
  /* Base font for the whole chat; descendants inherit family + size.
     Driven by config.typography.{fontFamily,fontSize} via applyTypography. */
  font-family: var(
    --ethora-font-family,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Helvetica,
    Arial,
    sans-serif
  );
  font-size: var(--ethora-font-size, 16px);
`;
