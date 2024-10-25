import styled, { keyframes } from 'styled-components';

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

interface LoaderProps {
  size?: number;
  color?: string;
}

const Loader = styled.div<LoaderProps>`
  border: ${({ size }) => (size ? size / 4 : 4)}px solid #f3f3f3;
  border-top: ${({ size }) => (size ? size / 4 : 4)}px solid
    ${({ color }) => color || '#3498db'};
  border-right: ${({ size }) => (size ? size / 4 : 4)}px solid
    ${({ color }) => color || '#3498db'};
  border-left: ${({ size }) => (size ? size / 4 : 4)}px solid
    ${({ color }) => color || '#3498db'};
  border-radius: 50%;
  width: ${({ size }) => size || 32}px;
  height: ${({ size }) => size || 32}px;
  animation: ${spin} 2s linear infinite;
  margin: auto;
`;

export default Loader;
