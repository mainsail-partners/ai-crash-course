import { html } from 'lit';

export const ChatBubbleIcon = html`
  <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect x="6" y="6" width="52" height="36" rx="10" fill="var(--chat-primary, #007bff)"/>
    <path d="M22 42 L22 56 L34 42 Z" fill="var(--chat-primary, #007bff)"/>
    <circle cx="24" cy="24" r="4" fill="#ffffff" opacity="0.9"/>
    <circle cx="32" cy="24" r="4" fill="#ffffff" opacity="0.9"/>
    <circle cx="40" cy="24" r="4" fill="#ffffff" opacity="0.9"/>
  </svg>
`;


