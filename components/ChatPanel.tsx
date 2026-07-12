"use client";

import { Send, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/hooks/useVideoRoom";

type ChatPanelProps = {
  messages: ChatMessage[];
  isOpen: boolean;
  isDisabled: boolean;
  onClose: () => void;
  onSendMessage: (message: string) => Promise<boolean>;
};

function formatChatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function ChatPanel({
  messages,
  isOpen,
  isDisabled,
  onClose,
  onSendMessage,
}: ChatPanelProps) {
  const [messageText, setMessageText] = useState("");
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const messageList = messageListRef.current;

    if (!messageList || !isOpen) {
      return;
    }

    messageList.scrollTop = messageList.scrollHeight;
  }, [isOpen, messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const wasSent = await onSendMessage(messageText);

    if (wasSent) {
      setMessageText("");
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="chat-panel" aria-label="Room chat">
      <header className="chat-panel-header">
        <h2>Chat</h2>
        <button type="button" onClick={onClose} aria-label="Close chat">
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="chat-message-list" ref={messageListRef}>
        {messages.length > 0 ? (
          messages.map((message) => (
            <article
              className={`chat-message ${message.isLocal ? "chat-message-local" : ""}`}
              key={message.id}
            >
              <div className="chat-message-meta">
                <strong>{message.isLocal ? "You" : message.senderName}</strong>
                <time dateTime={new Date(message.sentAt).toISOString()}>
                  {formatChatTime(message.sentAt)}
                </time>
              </div>
              <p>{message.text}</p>
            </article>
          ))
        ) : (
          <p className="chat-empty">No messages yet.</p>
        )}
      </div>

      <form className="chat-compose" onSubmit={sendMessage}>
        <input
          value={messageText}
          onChange={(event) => setMessageText(event.target.value)}
          disabled={isDisabled}
          maxLength={500}
          placeholder="Message everyone"
          aria-label="Message everyone"
        />
        <button
          type="submit"
          disabled={isDisabled || !messageText.trim()}
          aria-label="Send message"
        >
          <Send aria-hidden="true" />
        </button>
      </form>
    </aside>
  );
}
