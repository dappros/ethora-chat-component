import React, { Suspense } from 'react';

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

const LazyEmojiPicker: React.FC<any> = (props) => (
  <Suspense fallback={null}>
    <PickerWithData {...props} />
  </Suspense>
);

export default LazyEmojiPicker;
