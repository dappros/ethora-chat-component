import styled from 'styled-components';
export const CustomDivider = styled.div<{
  configColor: string;
}>`
  padding: 1px;
  height: 1px;
  width: 100%;
  background-color: ${(props) =>
    props.configColor ? props.configColor : '#0052CD'};
`;
