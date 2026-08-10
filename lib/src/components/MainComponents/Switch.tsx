import React, { useEffect, useState } from 'react';
import styled from 'styled-components';

const SwitchContainer = styled.div<{ isOn: boolean; bgColor?: string }>`
  width: 34px;
  height: 18px;
  background-color: ${({ isOn, bgColor }) =>
    isOn ? (bgColor ? bgColor : '#0056d2') : '#8C8C8C'};
  border-radius: 100px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: background-color 0.3s;
  padding: 2px;
`;

const Toggle = styled.div<{ isOn: boolean }>`
  width: 16px;
  height: 16px;
  background-color: white;
  border-radius: 100px;
  transform: ${({ isOn }) => (isOn ? 'translateX(18px)' : 'translateX(0)')};
  transition: transform 0.3s;
`;

interface SwitchProps {
  onToggle: (isOn: boolean) => void;
  bgColor?: string;
  onSwitchOn?: () => void;
  onSwitchOff?: () => void;
  /**
   * Reflects an existing value (e.g. redux state) instead of always
   * starting from "off". Optional and defaults to undefined so every
   * existing fire-and-forget caller keeps its original always-starts-off
   * behaviour unchanged - only pass this when the switch represents a
   * real, already-known boolean.
   */
  checked?: boolean;
}

const Switch: React.FC<SwitchProps> = ({
  onSwitchOn,
  onSwitchOff,
  onToggle,
  bgColor,
  checked,
}) => {
  const [isOn, setIsOn] = useState(checked ?? false);

  // Stay in sync with an external value change (e.g. another tab/device
  // toggling the same persisted redux state) without fighting the user's
  // own click - toggleSwitch below updates local state immediately, and
  // this only re-syncs when the prop itself actually moves.
  useEffect(() => {
    if (checked !== undefined) setIsOn(checked);
  }, [checked]);

  const toggleSwitch = () => {
    const nextState = !isOn;
    if (nextState) {
      onSwitchOn?.();
    } else {
      onSwitchOff?.();
    }
    setIsOn(nextState);
    onToggle(nextState);
  };

  return (
    <SwitchContainer
      isOn={isOn}
      onClick={toggleSwitch}
      role="button"
      aria-pressed={isOn}
      bgColor={bgColor}
    >
      <Toggle isOn={isOn} />
    </SwitchContainer>
  );
};

export default Switch;
