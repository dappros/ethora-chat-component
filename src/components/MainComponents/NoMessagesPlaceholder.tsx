import { EmptyChatIllustration } from '../../assets/illustrations/EmptyChatIllustration';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { resolveIconColor } from '../../helpers/resolveIconColor';

const NoMessagesPlaceholder = () => {
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Vector illustration: its accent uses `currentColor`, so the empty
            state follows config.colors.icons/primary. */}
        <EmptyChatIllustration
          width={240}
          style={{ color: resolveIconColor(config) }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 16,
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 'var(--ethora-font-size, 16px)',
              fontWeight: 600,
            }}
          >
            This chat is empty
          </div>
          <div
            style={{
              fontSize: 'var(--ethora-font-size-sm, 14px)',
              fontWeight: 400,
            }}
          >
            Be the first one to start it.
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoMessagesPlaceholder;
