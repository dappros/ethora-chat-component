import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { AsisstantUserType, IConfig } from '../../../types/types';

interface AssistantLoginWrapperProps {
  user: AsisstantUserType;
  config?: IConfig;
  roomJID?: string;
}

const AssistantLoginWrapper: React.FC<AssistantLoginWrapperProps> = ({
  user,
  config,
  roomJID,
}) => {
  const [showModal, setShowModal] = useState(false);

  const dispatch = useDispatch();

  return <></>;
};

export default AssistantLoginWrapper;
