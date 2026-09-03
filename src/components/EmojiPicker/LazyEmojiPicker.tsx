import React, { Suspense } from 'react';
import styled from 'styled-components';
import { scaleInAnimation } from '../../styles/motion';

// The emoji picker (component + full emoji dataset) is loaded only when a
// user actually opens it, keeping both out of the initial bundle.
const PickerWithData = React.lazy(async () => {
  const [{ default: Picker }, { default: data }] = await Promise.all([
    import('@emoji-mart/react'),
    import('@emoji-mart/data'),
  ]);
  const Wrapped: React.FC<any> = (props) => <Picker data={data} {...props} />;
  return { default: Wrapped };
});

// Decorative shell around the (positioned by the caller) picker: border,
// shadow and a small scale/fade entrance so it doesn't just pop into place.
// The caller still owns absolute positioning of this element.
const PickerShell = styled.div`
  border-radius: var(--ethora-radius-md, 12px);
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  box-shadow: var(--ethora-shadow-lg, 0 8px 24px rgba(16, 24, 40, 0.16));
  overflow: hidden;
  ${scaleInAnimation}
`;

const LazyEmojiPicker: React.FC<any> = (props) => (
  <Suspense fallback={null}>
    <PickerShell>
      <PickerWithData {...props} />
    </PickerShell>
  </Suspense>
);

export default LazyEmojiPicker;
