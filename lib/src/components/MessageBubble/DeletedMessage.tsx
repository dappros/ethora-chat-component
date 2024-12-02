import { DeleteIcon } from '../../assets/icons';
import { styled } from 'styled-components';

const ReplyContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 5px;
    padding-top: 5px;

    @media (max-width: 399px) {
      font-size: 14px;
    }
`;

const IconContainer = styled.div`
  padding: 5px;
  background-color: #CCCCCC;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const DeletedMessage = () => {
  return (
    <ReplyContainer>
      <IconContainer>
        <DeleteIcon width={18} height={18} fill="#8C8C8C" />
      </IconContainer>
      <p style={{ margin: 0, color: '#8C8C8C' }}>
        This message was deleted.
      </p>
    </ReplyContainer>
  );
};
