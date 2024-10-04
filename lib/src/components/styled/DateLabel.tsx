import React from "react";
import styled from "styled-components";
import { Line } from "./StyledComponents";

interface DateLabelProps {
  date: Date;
  colors?: { primary?: string; secondary?: string };
}

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: transparent;
  gap: 16px;
`;

export const StyledDateLabel = styled.div<{
  primary?: string;
  secondary?: string;
}>`
  margin: 0;
  color: ${(props) => props.primary || "#0052cd"};
  border-radius: 118px;
  padding: 5px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 14px;
  font-weight: 600;
  background-color: ${(props) => props.secondary || "#e7edf9"};
  height: 24px;
  white-space: nowrap;
`;

const DateLabel: React.FC<DateLabelProps> = ({ date, colors }) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const sameYear = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear();

  let label: string;
  if (sameDay(date, today)) {
    label = "Today";
  } else if (sameDay(date, yesterday)) {
    label = "Yesterday";
  } else {
    const options: Intl.DateTimeFormatOptions = sameYear(date, today)
      ? { month: "long", day: "numeric" }
      : { month: "long", day: "numeric", year: "numeric" };
    label = date.toLocaleDateString("en-US", options);
  }

  return (
    <Container>
      <Line />
      <StyledDateLabel {...colors}>{label}</StyledDateLabel>
      <Line />
    </Container>
  );
};

export default DateLabel;
