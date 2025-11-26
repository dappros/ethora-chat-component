import React from 'react';
import { DaySeparatorProps } from '../../types/models/customComponents.model';

const CustomDaySeparator: React.FC<DaySeparatorProps> = ({
  formattedDate,
}) => (
  <div className="my-4 flex justify-center">
    <span
      className="rounded-full bg-indigo-50 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600"
      style={{ letterSpacing: '0.08em' }}
    >
      {formattedDate}
    </span>
  </div>
);

export default CustomDaySeparator;

