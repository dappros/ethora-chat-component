import React from 'react';
import ReactDOM from 'react-dom/client';
import AssistantTest from './AssistantTest.tsx';
import './index.css';

function mountChatAssistant(container: HTMLElement, botId: string) {
  ReactDOM.createRoot(container).render(<AssistantTest botId={botId} />);
}

const devRoot = document.getElementById('root');
if (devRoot) {
  ReactDOM.createRoot(devRoot).render(<AssistantTest />);
}

document.addEventListener('DOMContentLoaded', () => {
  const scriptTag = document.getElementById('chat-content-assistant');
  if (scriptTag) {
    const botId = scriptTag.getAttribute('data-bot-id');
    if (botId) {
      const chatWidgetContainer = document.createElement('div');
      chatWidgetContainer.id = 'chat-widget';
      scriptTag.parentNode?.insertBefore(
        chatWidgetContainer,
        scriptTag.nextSibling
      );
      mountChatAssistant(chatWidgetContainer, botId);
    } else {
      console.error(
        'ChatContentAssistant: data-bot-id attribute not found on script tag.'
      );
    }
  }
});
