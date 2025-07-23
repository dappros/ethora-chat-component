import React from 'react';
import ReactDOM from 'react-dom/client';
import AssistantTest from './AssistantTest.tsx';
import './index.css';

function mountChatAssistant(container: HTMLElement, botId?: string) {
  ReactDOM.createRoot(container).render(<AssistantTest botId={botId} />);
}

function createChatWidgetDiv(): HTMLDivElement {
  const chatWidgetContainer = document.createElement('div');
  chatWidgetContainer.id = 'chat-widget';
  return chatWidgetContainer;
}

function waitForBodyAndMount() {
  if (!document.body) {
    setTimeout(waitForBodyAndMount, 10);
    return;
  }

  const existing = document.getElementById('chat-widget');
  if (existing) return;

  const scriptTag = document.getElementById('chat-content-assistant');
  const botId = scriptTag?.getAttribute('data-bot-id') || undefined;

  const chatWidgetContainer = createChatWidgetDiv();
  document.body.appendChild(chatWidgetContainer);
  mountChatAssistant(chatWidgetContainer, botId);
}

waitForBodyAndMount();
