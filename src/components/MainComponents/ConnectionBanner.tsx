import React from 'react';
import styled from 'styled-components';

const BannerContainer = styled.div`
  background-color: #ff9800;
  color: white;
  padding: 8px 16px;
  text-align: center;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  width: 100%;
  box-sizing: border-box;
  z-index: 1000;
  position: absolute;
  top: 0;
  left: 0;
`;

const ConnectionBanner: React.FC = () => {
  return (
    <BannerContainer>
      Connection lost. Retrying...
    </BannerContainer>
  );
};

export default ConnectionBanner;
