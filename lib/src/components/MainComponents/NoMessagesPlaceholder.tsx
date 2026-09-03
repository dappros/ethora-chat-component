import { NoMessagesIllustration } from '../../assets/illustrations/NoMessagesIllustration';
import { useT } from '../../i18n/useT';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { resolveIconColor } from '../../helpers/resolveIconColor';

const NoMessagesPlaceholder = () => {
  const t = useT();
  const { config } = useChatSettingState();

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ethora-space-4, 16px)' }}>
        {/* Vector illustration (traced from the legacy NoMessages raster): its
            accent uses `currentColor`, so the empty state follows
            config.colors.icons/primary. */}
        <NoMessagesIllustration
          width={240}
          style={{ color: resolveIconColor(config) }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--ethora-space-2, 8px)',
            padding: 'var(--ethora-space-4, 16px)',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 'var(--ethora-font-size, 16px)',
              fontWeight: 600,
              color: 'var(--ethora-color-text, #141414)',
            }}
          >
            {t('room.empty')}
          </div>
          <div
            style={{
              fontSize: 'var(--ethora-font-size-sm, 14px)',
              fontWeight: 400,
              color: 'var(--ethora-color-text-secondary, #5A5F66)',
            }}
          >
            {t('room.empty.hint')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoMessagesPlaceholder;
