import React from 'react';
import ReactDOM from 'react-dom/client';
import AssistantTest from './AssistantTest.tsx';
import './index.css';

export function mountChatAssistant(container: HTMLElement, botId: string) {
  ReactDOM.createRoot(container).render(<AssistantTest botId={botId} />);
}
