import React from 'react';
import { useT } from '../../i18n/useT';

// placeholder, replaced by the Files workstream
const FilesPanel: React.FC = () => {
  const t = useT();

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ethora-color-text-muted, #8C8C8C)',
        fontSize: 'var(--ethora-font-size-sm, 14px)',
        textAlign: 'center',
        padding: 'var(--ethora-space-4, 16px)',
        boxSizing: 'border-box',
      }}
    >
      {t('files.empty')}
    </div>
  );
};

export default FilesPanel;
