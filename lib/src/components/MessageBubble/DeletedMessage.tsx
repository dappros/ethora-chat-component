import { DeleteIcon } from '../../assets/icons';
import { styled } from 'styled-components';

const Container = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 8px;
  background-color: rgba(140, 140, 140, 0.08);
  border: 1px dashed rgba(140, 140, 140, 0.35);
  color: #8c8c8c;
  font-style: italic;
  font-size: 13px;
  line-height: 1.2;
  user-select: none;

  @media (max-width: 399px) {
    font-size: 12px;
  }
`;

const IconWrap = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
`;

export const DeletedMessage = () => {
  return (
    <Container aria-label="Deleted message">
      <IconWrap>
        <DeleteIcon width={14} height={14} fill="#8C8C8C" />
      </IconWrap>
      <span>This message was deleted</span>
    </Container>
  );
};
