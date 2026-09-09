/**
 * Guards the package's public surface.
 *
 * The runtime half is checked at runtime: `main.ts` is what npm consumers
 * import, so silently dropping an export from it is a breaking change.
 *
 * The type half cannot be checked at runtime (types are erased), so the
 * declarations below exist to make `tsc --noEmit` fail if any of these
 * type exports disappears or changes shape incompatibly. They are typed
 * `satisfies`-style through real values, not casts, so the structure is
 * genuinely checked.
 */
import { describe, it, expect } from 'vitest';
import * as publicApi from './main';
import type {
  ChatProps,
  IConfig,
  IMessage,
  IRoom,
  User,
  IUser,
  ConfigUser,
  MessageProps,
  SendInputProps,
  CustomComponentsContextValue,
  CustomScrollableAreaProps,
  DaySeparatorProps,
  NewMessageLabelProps,
  DecoratedMessage,
  ScrollControllerApi,
  xmppSettingsInterface,
  TypographyConfig,
} from './main';

/**
 * Every runtime export, as of the version that introduced this test.
 * Removing or renaming one of these is a breaking change for consumers:
 * update the list deliberately, together with a major version bump.
 */
const EXPECTED_RUNTIME_EXPORTS = [
  'AuthTestIds',
  'Chat',
  'ChatInputTestIds',
  'MessageBubbleTestIds',
  'RefreshFatalError',
  'RoomListTestIds',
  'XmppProvider',
  'applyTypography',
  'clearTypography',
  'handleQRChatId',
  'isRefreshFatalError',
  'logoutService',
  'refreshAuthTokens',
  'refreshAuthTokensQuietly',
  'resendMessage',
  'useInAppNotifications',
  'useIsUserOnline',
  'usePushNotifications',
  'useQRCodeChat',
  'useRoomPresence',
  'useTypography',
  'useUnread',
];

/**
 * Compile-time only: naming a type here makes `tsc` resolve it through
 * `./main`, so dropping the re-export turns into a build failure.
 */
const assertExported = <T>(_value?: T): void => undefined;

describe('public API', () => {
  it('still exports every documented runtime symbol', () => {
    for (const name of EXPECTED_RUNTIME_EXPORTS) {
      expect(publicApi, `missing export: ${name}`).toHaveProperty(name);
    }
  });

  it('does not export anything undeclared', () => {
    const actual = Object.keys(publicApi).sort();
    expect(actual).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
  });

  it('exports the core types so hosts need no deep imports', () => {
    // Compile-time assertions. `tsc --noEmit` is the real check here; at
    // runtime this just confirms the module loaded.
    const config: IConfig = {};
    const user: ConfigUser = { email: 'a@b.c', password: 'x' };
    const props: ChatProps = { config, loginData: user };

    // Types reachable from the props, named individually so a removal
    // from `main.ts` breaks the build rather than a consumer's.
    assertExported<IMessage>();
    assertExported<IRoom>();
    assertExported<User>();
    assertExported<IUser>();
    assertExported<MessageProps>();
    assertExported<SendInputProps>();
    assertExported<CustomComponentsContextValue>();
    assertExported<CustomScrollableAreaProps>();
    assertExported<DaySeparatorProps>();
    assertExported<NewMessageLabelProps>();
    assertExported<DecoratedMessage>();
    assertExported<ScrollControllerApi>();
    assertExported<xmppSettingsInterface>();
    assertExported<TypographyConfig>();

    expect(props.config).toBe(config);
    expect(props.loginData?.email).toBe('a@b.c');
  });
});
