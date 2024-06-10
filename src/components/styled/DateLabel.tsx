import React from "react";
import styled from "styled-components";

interface DateLabelProps {
  date: Date;
}

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: transparent;
`;

const StyledDateLabel = styled.div`
  margin: 0;
  color: #8f8f8f;
  background-color: #fff;
  border-radius: 118px;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
`;

const DateLabel: React.FC<DateLabelProps> = ({ date }) => {
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
      <StyledDateLabel>{label}</StyledDateLabel>
    </Container>
  );
};

export default DateLabel;
