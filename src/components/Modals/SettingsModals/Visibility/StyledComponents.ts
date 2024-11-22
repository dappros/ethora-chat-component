import styled from 'styled-components';

export const Container = styled.div``;

export const Title = styled.div`
  font-size: 16px;
  font-weight: bold;
`;

export const Description = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 32px;
`;

export const RadioGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const RadioLabel = styled.label`
  display: flex;
  align-items: center;
  font-size: 14px;
  gap: 8px;
`;

export const RadioInput = styled.input<{ radioColor?: string }>`
  accent-color: ${({ radioColor }) => radioColor || '#0052CD'};
  margin: 0px;
`;
