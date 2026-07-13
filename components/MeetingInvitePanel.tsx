"use client";

import { Copy, Link, LockKeyhole, X } from "lucide-react";

type MeetingInvitePanelProps = {
  isOpen: boolean;
  roomCode: string;
  roomLink: string;
  isPasswordProtected: boolean;
  password: string;
  canSharePassword: boolean;
  copyStatus: "link" | "code" | "password" | "invite" | "";
  onClose: () => void;
  onCopyLink: () => void;
  onCopyCode: () => void;
  onCopyPassword: () => void;
  onCopyInvite: () => void;
};

export function MeetingInvitePanel({
  isOpen,
  roomCode,
  roomLink,
  isPasswordProtected,
  password,
  canSharePassword,
  copyStatus,
  onClose,
  onCopyLink,
  onCopyCode,
  onCopyPassword,
  onCopyInvite,
}: MeetingInvitePanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="invite-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="invite-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="invite-modal-header">
          <div>
            <p>Meeting invite</p>
            <h2 id="invite-modal-title">Invite someone to this call</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close invite panel">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="invite-detail">
          <span>Room code</span>
          <strong>{roomCode}</strong>
          <button type="button" onClick={onCopyCode}>
            <Copy aria-hidden="true" />
            {copyStatus === "code" ? "Copied" : "Copy code"}
          </button>
        </div>

        <div className="invite-detail invite-link-detail">
          <span>Room link</span>
          <strong title={roomLink}>{roomLink}</strong>
          <button type="button" onClick={onCopyLink}>
            <Link aria-hidden="true" />
            {copyStatus === "link" ? "Copied" : "Copy link"}
          </button>
        </div>

        {isPasswordProtected ? (
          <div className="invite-password-note">
            <LockKeyhole aria-hidden="true" />
            <div>
              <strong>Password protected</strong>
              {canSharePassword ? (
                <p>
                  Password: <b>{password}</b>
                </p>
              ) : (
                <p>Ask the host for the room password.</p>
              )}
            </div>
            {canSharePassword ? (
              <button type="button" onClick={onCopyPassword}>
                <Copy aria-hidden="true" />
                {copyStatus === "password" ? "Copied" : "Copy password"}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="invite-public-note">Anyone with this link can request to join.</p>
        )}

        <button type="button" className="invite-copy-all" onClick={onCopyInvite}>
          <Copy aria-hidden="true" />
          {copyStatus === "invite" ? "Invite copied" : "Copy invitation"}
        </button>
      </section>
    </div>
  );
}
