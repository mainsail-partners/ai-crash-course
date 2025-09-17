import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ChatBubbleIcon } from './components/icons';
import { ApiService } from './services/api.service';

export interface ChatWidgetConfig {
  apiUrl: string;
  agent: string;
  parameters?: Record<string, unknown>;
  theme?: 'light' | 'dark';
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  width?: number;
  height?: number;
  runLLMCallOnInit?: boolean;
}

type Role = 'user' | 'assistant';

type AssistantReply = { content?: string };

@customElement('chat-widget')
export class ChatWidget extends LitElement {
  @property({ type: String }) apiUrl = '';
  @property({ type: String }) agent = '';
  @property({ type: Object }) threadParameters: Record<string, unknown> | null = null;
  @property({ type: String, reflect: true }) theme: 'light' | 'dark' = 'light';
  @property({ type: String, reflect: true }) position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' = 'bottom-right';
  @property({ type: Number }) width = 400;
  @property({ type: Number }) height = 600;
  @property({ type: Boolean }) runLLMCallOnInit = false;

  @state() private isOpen = true;
  @state() private messages: Array<{ id: string; role: Role; content: string; ts: number }> = [];
  @state() private isLoading = false;
  @state() private input = '';
  @state() private threadId: string | null = null;
  private api?: ApiService;

  static styles = css`
    :host {
      display: block;
      position: fixed;
      z-index: 10000;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      border-radius: 12px;
      overflow: hidden;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    .container { display: flex; flex-direction: column; height: 100%; background: var(--bg, #fff); }
    .header { background: var(--primary, #0d6efd); color: #fff; padding: 12px 14px; display:flex; align-items:center; justify-content: space-between;}
    .body { flex: 1; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .row { display: flex; }
    .row.user { justify-content: flex-end; }
    .bubble { max-width: 80%; padding: 10px 12px; border-radius: 14px; line-height: 1.4; }
    .user .bubble { background: var(--primary, #0d6efd); color: #fff; border-bottom-right-radius: 6px; }
    .assistant .bubble { background: var(--muted, #f5f6f8); color: #222; border-bottom-left-radius: 6px; }
    .footer { padding: 10px; border-top: 1px solid #e9ecef; display: flex; gap: 8px; }
    input { flex:1; padding: 10px 12px; border: 1px solid #dee2e6; border-radius: 20px; font-size: 14px; background: #fff; color:#222; }
    input::placeholder { color: #888; }
    button { background: var(--primary, #0d6efd); color:#fff; border:none; padding: 10px 16px; border-radius: 20px; cursor: pointer; }
    :host([theme="dark"]) { --bg:#1a1a1a; --muted:#2a2a2a; --primary:#0d6efd; color:#fff; }
    :host([theme="dark"]) input { background:#2a2a2a; color:#fff; border-color:#3a3a3a; }
    :host([theme="dark"]) input::placeholder { color:#aaa; }
    :host([position="bottom-right"]) { bottom:20px; right:20px; }
    :host([position="bottom-left"]) { bottom:20px; left:20px; }
    :host([position="top-right"]) { top:20px; right:20px; }
    :host([position="top-left"]) { top:20px; left:20px; }
    .typing { display: inline-flex; align-items: center; gap: 4px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.4; animation: pulse 1.2s infinite ease-in-out; }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes pulse {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
      40% { transform: translateY(-3px); opacity: 1; }
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.style.width = `${this.width}px`;
    this.style.height = `${this.height}px`;
    this.api = new ApiService(this.apiUrl);
    if (this.runLLMCallOnInit && this.messages.length === 0) {
      void this.fetchGreeting();
    }
  }

  render() {
    return html`
      <div class="container">
        <div class="header">
          <strong>Chat</strong>
          ${this.isOpen
            ? html`<button title="Close" @click=${this.onClose}>×</button>`
            : html`<button title="Open" @click=${() => (this.isOpen = true)}>+</button>`}
        </div>
        ${this.isOpen ? html`
        <div class="body">
          ${this.messages.length === 0 && !this.runLLMCallOnInit ? html`<div class="row assistant"><div class="bubble">Hello! How can I help?</div></div>` : ''}
          ${this.messages.map(m => html`<div class="row ${m.role}"><div class="bubble">${m.content}</div></div>`)}
          ${this.isLoading ? html`<div class="row assistant"><div class="bubble"><span class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></div></div>` : ''}
        </div>
        <div class="footer">
          <input .value=${this.input} @input=${(e: Event) => this.input = (e.target as HTMLInputElement).value} @keydown=${this.onKeyDown} placeholder="Type your message..." />
          <button @click=${this.onSend} ?disabled=${!this.input.trim() || this.isLoading}>Send</button>
        </div>
        ` : ''}
      </div>
    `;
  }

  private add(role: Role, content: string) {
    this.messages = [...this.messages, { id: Math.random().toString(36).slice(2), role, content, ts: Date.now() }];
    this.updateComplete.then(() => {
      const body = this.renderRoot.querySelector('.body') as HTMLElement | null;
      if (body) body.scrollTop = body.scrollHeight;
    });
  }

  private async onSend() {
    const text = this.input.trim();
    if (!text) return;
    this.input = '';
    this.add('user', text);
    this.isLoading = true;
    try {
      if (!this.threadId) await this.ensureThread();
      const data: AssistantReply = await this.api!.sendMessage(this.threadId!, text);
      this.add('assistant', data?.content || '');
    } catch (e) {
      this.add('assistant', 'Sorry, something went wrong.');
    } finally {
      this.isLoading = false;
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void this.onSend();
    }
  }

  private async ensureThread() {
    this.threadId = await this.api!.createThread(this.agent, this.threadParameters || undefined);
  }

  private async fetchGreeting() {
    try {
      this.isLoading = true;
      if (!this.threadId) await this.ensureThread();
      const data: AssistantReply = await this.api!.sendMessage(this.threadId!, 'Please greet the user to begin the conversation. Keep it brief and friendly.');
      this.add('assistant', data?.content || 'Hello! How can I help?');
    } catch {
      this.add('assistant', 'Hello! How can I help?');
    } finally {
      this.isLoading = false;
    }
  }

  private onClose() {
    // Clear conversation and remove the widget element (same as test page Reset)
    this.messages = [];
    this.input = '';
    this.isLoading = false;
    this.threadId = null;
    this.remove();
  }
}

declare global { interface HTMLElementTagNameMap { 'chat-widget': ChatWidget } }

if (!customElements.get('chat-widget')) customElements.define('chat-widget', ChatWidget);


