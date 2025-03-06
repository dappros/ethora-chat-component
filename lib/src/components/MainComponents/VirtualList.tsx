import React, { useRef, useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { IMessage } from '../../types/types';

interface VirtualizedListProps {
  data: IMessage[];
  renderItem: (item: IMessage) => JSX.Element;
  itemHeight: number;
  containerHeight: number;
}

const ListContainer = styled.div`
  position: relative;
  overflow-y: auto;
  width: 100%;
`;

export const VirtualizedList: React.FC<VirtualizedListProps> = ({
  data,
  renderItem,
  itemHeight,
  containerHeight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = data.length * itemHeight;
  const visibleCount = Math.ceil(containerHeight / itemHeight);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(startIndex + visibleCount, data.length);
  const visibleItems = data.slice(startIndex, endIndex);

  return (
    <ListContainer ref={containerRef} style={{ height: containerHeight }}>
      {visibleItems.map((item, index) => renderItem(item))}
    </ListContainer>
  );
};
