import styled from 'styled-components';
// `$`-prefixed transient props: styled-components strips these instead of
// forwarding them to the underlying <div>, which React warns about.
export const CustomDivider = styled.div<{
  $configColor: string;
  $configColorUser: string;
  $isUser: boolean;
}>`
  margin: 1px 0;
  height: 1px;
  width: 100%;
  background-color: ${(props) =>
    props.$isUser
      ? props.$configColorUser || 'var(--ethora-color-primary, #0052CD)'
      : props.$configColor || 'var(--ethora-color-primary, #0052CD)'};
`;
