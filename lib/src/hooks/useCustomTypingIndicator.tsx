import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useChatSettingState } from './useChatSettingState';
import {
  generateDefaultText,
  generateProcessingText,
} from '../components/styled/StyledInputComponents/CustomTypingIndicator';
import { RootState } from '../roomStore';

/**
 * Hook for managing custom typing indicator functionality
 * Provides utilities for text generation and typing state management
 */
export const useCustomTypingIndicator = (roomJID: string) => {
  const { config } = useChatSettingState();
  const { rooms } = useSelector((state: RootState) => ({
    rooms: state.rooms.rooms,
  }));

  const room = rooms[roomJID];
  const isComposing = room?.composing || false;
  const composingList = room?.composingList || [];

  // Generate text based on configuration
  const getTypingText = useCallback(
    (customText?: string | ((usersTyping: string[]) => string)) => {
      if (typeof customText === 'function') {
        return customText(composingList);
      } else if (typeof customText === 'string') {
        return customText;
      } else {
        return generateDefaultText(composingList);
      }
    },
    [composingList]
  );

  // Generate processing text (for AI/processing states)
  const getProcessingText = useCallback(() => {
    return generateProcessingText(composingList);
  }, [composingList]);

  // Check if custom typing indicator is enabled
  const isCustomTypingEnabled = useMemo(() => {
    return config?.customTypingIndicator?.enabled || false;
  }, [config?.customTypingIndicator?.enabled]);

  // Get typing indicator configuration
  const typingConfig = useMemo(() => {
    return config?.customTypingIndicator || null;
  }, [config?.customTypingIndicator]);

  // Check if indicator should be visible
  const shouldShowIndicator = useMemo(() => {
    return isComposing && composingList.length > 0;
  }, [isComposing, composingList.length]);

  // Get position-specific styles
  const getPositionStyles = useCallback(
    (position: string) => {
      const baseStyles = typingConfig?.styles || {};

      switch (position) {
        case 'top':
          return {
            ...baseStyles,
            position: 'absolute',
            top: '8px',
            left: '16px',
            right: '16px',
            background: 'rgba(255, 255, 255, 0.95)',
            padding: '8px 12px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(10px)',
          };
        case 'overlay':
          return {
            ...baseStyles,
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '16px 24px',
            borderRadius: '12px',
            backdropFilter: 'blur(10px)',
          };
        case 'floating':
          return {
            ...baseStyles,
            position: 'fixed',
            bottom: '80px',
            right: '20px',
            background: 'rgba(255, 255, 255, 0.95)',
            padding: '12px 16px',
            borderRadius: '20px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
            backdropFilter: 'blur(10px)',
          };
        case 'bottom':
        default:
          return {
            ...baseStyles,
            position: 'static',
            padding: '8px 0',
          };
      }
    },
    [typingConfig?.styles]
  );

  return {
    isComposing,
    composingList,
    isCustomTypingEnabled,
    typingConfig,
    shouldShowIndicator,
    getTypingText,
    getProcessingText,
    getPositionStyles,
  };
};

/**
 * Utility functions for creating common typing indicator configurations
 */
export const createTypingIndicatorConfigs = {
  // Default typing indicator
  default: {
    enabled: true,
    position: 'bottom' as const,
  },

  // Processing state indicator
  processing: {
    enabled: true,
    position: 'overlay' as const,
    text: (usersTyping: string[]) => generateProcessingText(usersTyping),
    styles: {
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      fontSize: '16px',
      fontWeight: '500',
    },
  },

  // Floating indicator
  floating: {
    enabled: true,
    position: 'floating' as const,
    styles: {
      background: 'rgba(255, 255, 255, 0.95)',
      color: '#333',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
    },
  },

  // Top positioned indicator
  top: {
    enabled: true,
    position: 'top' as const,
    styles: {
      background: 'rgba(255, 255, 255, 0.95)',
      color: '#555',
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    },
  },

  // Custom text examples
  customTexts: {
    aiProcessing: (usersTyping: string[]) => {
      const states = ['thinking', 'processing', 'generating answer'];
      const randomState = states[Math.floor(Math.random() * states.length)];
      return `${usersTyping[0]} is ${randomState}`;
    },

    simple: (usersTyping: string[]) => {
      return `${usersTyping.length} user${usersTyping.length > 1 ? 's' : ''} typing...`;
    },

    minimal: (usersTyping: string[]) => {
      return '...';
    },
  },
};

export default useCustomTypingIndicator;
