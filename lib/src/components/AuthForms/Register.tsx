import React from 'react';
import styled from 'styled-components';

// Placeholder screen, brought to the same card-on-tinted-background look as
// Login.tsx (see FormContainer/Form there) so it doesn't look unfinished
// next to the other auth forms even before real fields land here.
const FormContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background-color: var(--ethora-color-bg-subtle, #f5f7fa);
`;

const Card = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: var(--ethora-color-bg, #fff);
  padding: 32px;
  border-radius: var(--ethora-radius-lg, 16px);
  box-shadow: var(--ethora-shadow-md, 0 4px 12px rgba(16, 24, 40, 0.1));
  width: 320px;
  color: var(--ethora-color-text-secondary, #5a5f66);
  font-size: var(--ethora-font-size-sm, 14px);
`;

const RegisterForm = () => {
  return (
    <FormContainer>
      <Card>RegisterForm</Card>
    </FormContainer>
  );
};

export default RegisterForm;
