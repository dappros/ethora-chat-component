import styled from 'styled-components';
import { CenterContainer, Label } from '../styledModalComponents';
import Button from '../../styled/Button';

export const SharedSettingsCenterContainer = styled(CenterContainer)`
  display: flex;
  box-sizing: border-box;
  align-items: flex-start;
  gap: 32px;
`;

export const SharedSettingsColumnContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

export const SharedSettingsSectionContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const SharedSettingsStyledLabel = styled(Label)`
  font-weight: 600;
  text-align: start;
  flex-wrap: wrap;
  display: flex;
  align-items: center;
`;

export const RowWrapper = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

export const SharedSettingsLabelData = styled(Label)`
  font-size: 12px;
  text-align: start;
  color: #8c8c8c;
`;

export const SharedSettingsStyledButton = styled(Button)<{
  borderColor: string;
}>`
  min-height: 40px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 100%;
  padding: 8px;
  border: 1px solid ${({ borderColor }) => borderColor};
`;

export const SharedSettingsInfoPanel = styled.div<{ bgColor: string }>`
  display: flex;
  align-items: flex-start;
  background-color: ${({ bgColor }) => bgColor};
  padding: 16px;
  border-radius: 8px;
  gap: 8px;
`;

export const SharedSettingsInfoText = styled.div`
  font-size: 12px;
  color: #141414;
  display: flex;
  text-align: start;
`;
