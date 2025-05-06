import styled from 'styled-components';

export const BrowserContainer = styled.div`
  padding: 0 16px;
  margin-bottom: 10px;
`;

export const BrowseButton = styled.button`
  background-color: #f0f0f0;
  border: 1px solid #ccc;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  width: 100%;
  text-align: center;
  margin-bottom: 10px;
  font-size: 14px;
  color: #333;

  &:hover {
    background-color: #e0e0e0;
  }
`;

export const RoomsListContainer = styled.div`
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 4px;
  background-color: #fff;
`;

export const RoomItem = styled.div`
  padding: 10px 15px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: #f9f9f9;
  }
`;

export const RoomName = styled.span`
  font-weight: 500;
  color: #333;
`;

export const RoomMembers = styled.span`
  font-size: 12px;
  color: #777;
`;

export const Loader = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  font-size: 14px;
  color: #555;
`;
