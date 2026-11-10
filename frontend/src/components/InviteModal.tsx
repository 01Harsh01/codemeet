import React, { useState } from 'react';
import { sound } from '../sound';

interface InviteModalProps {
  roomId: string;
  roomName: string;
  language: string;
  onClose: () => void;
}

export function InviteModal({ roomId, roomName, language, onClose }: InviteModalProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const shareUrl = `${window.location.origin}/room/${roomId}`;
  const inviteMessage = `🚀 Join my real-time collaborative coding session on CodeMeet!\n\n📌 Session: ${roomName || 'Collaborative Coding'}\n💻 Language: ${language.toUpperCase()}\n🔑 Room Code: ${roomId}\n🔗 Direct Link: ${shareUrl}\n\nPaste the code on CodeMeet or open the link directly in your browser.`;

  const copyCode = () => {
    navigator.clipboard.writeText(roomId);
    sound.playSuccess();
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    sound.playSuccess();
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const copyFullMessage = () => {
    navigator.clipboard.writeText(inviteMessage);
    sound.playSuccess();
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2500);
  };

  const shareWhatsApp = () => {
    sound.playPop();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(inviteMessage)}`;
    window.open(url, '_blank');
  };

  const shareTelegram = () => {
    sound.playPop();
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`🚀 Join my live coding session on CodeMeet! (Code: ${roomId})`)}`;
    window.open(url, '_blank');
  };

  const shareTwitter = () => {
    sound.playPop();
    const tweet = `Collaborating live on CodeMeet! Join my session: ${shareUrl} (Room Code: ${roomId}) #CodeMeet #Coding`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`, '_blank');
  };

  const shareLinkedIn = () => {
    sound.playPop();
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  const shareEmail = () => {
    sound.playPop();
    const subject = `Invitation to CodeMeet Session: ${roomName || roomId}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(inviteMessage)}`, '_blank');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🚀</span>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Invite Collaborators & Peers</h3>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                Share this room via social media, direct link, or session code
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 18, color: 'var(--fg-muted)' }}>
            ✕
          </button>
        </div>

        {/* Room Code Card */}
        <div
          style={{
            background: 'rgba(255, 161, 22, 0.08)',
            border: '1px solid rgba(255, 161, 22, 0.3)',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: 'var(--acc)', fontWeight: 700, textTransform: 'uppercase' }}>
              SESSION ROOM CODE
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: 1, marginTop: 2 }}>
              {roomId}
            </div>
          </div>
          <button
            className="btn-orange"
            onClick={copyCode}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            {copiedCode ? '✓ Code Copied' : '📋 Copy Code'}
          </button>
        </div>

        {/* Direct Link Input */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>
            DIRECT INVITE URL
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              readOnly
              value={shareUrl}
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              className="btn-run"
              onClick={copyLink}
              style={{ fontSize: 12, padding: '6px 14px' }}
            >
              {copiedLink ? '✓ Link Copied' : '🔗 Copy Link'}
            </button>
          </div>
        </div>

        {/* 1-Click Social Media Sharing */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', display: 'block', marginBottom: 8 }}>
            ONE-CLICK SOCIAL SHARE
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {/* WhatsApp */}
            <button
              onClick={shareWhatsApp}
              style={{
                background: '#25D366',
                borderColor: '#1ea952',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 13,
                padding: '8px 12px',
                justifyContent: 'flex-start',
              }}
            >
              <span style={{ fontSize: 16 }}>💬</span> Share on WhatsApp
            </button>

            {/* Telegram */}
            <button
              onClick={shareTelegram}
              style={{
                background: '#0088cc',
                borderColor: '#0077b5',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 13,
                padding: '8px 12px',
                justifyContent: 'flex-start',
              }}
            >
              <span style={{ fontSize: 16 }}>✈️</span> Share on Telegram
            </button>

            {/* X (Twitter) */}
            <button
              onClick={shareTwitter}
              style={{
                background: '#1a1a1a',
                borderColor: '#3e3e3e',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 13,
                padding: '8px 12px',
                justifyContent: 'flex-start',
              }}
            >
              <span style={{ fontSize: 16 }}>𝕏</span> Share on Twitter/X
            </button>

            {/* LinkedIn */}
            <button
              onClick={shareLinkedIn}
              style={{
                background: '#0a66c2',
                borderColor: '#084e96',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 13,
                padding: '8px 12px',
                justifyContent: 'flex-start',
              }}
            >
              <span style={{ fontSize: 16 }}>💼</span> Share on LinkedIn
            </button>
          </div>

          <button
            onClick={shareEmail}
            style={{
              width: '100%',
              marginTop: 10,
              background: '#2a2a2a',
              borderColor: 'var(--line)',
              fontSize: 12,
              padding: '7px 12px',
            }}
          >
            ✉️ Send via Email / Gmail
          </button>
        </div>

        {/* Message Preview */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)' }}>
              PREVIEW INVITATION TEXT
            </label>
            <button
              onClick={copyFullMessage}
              style={{ fontSize: 11, padding: '2px 8px', background: 'transparent', border: 'none', color: 'var(--acc)' }}
            >
              {copiedMessage ? '✓ Message Copied' : '📋 Copy Full Text'}
            </button>
          </div>
          <div
            style={{
              background: '#1c1c1c',
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: 10,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              color: 'var(--fg)',
            }}
          >
            {inviteMessage}
          </div>
        </div>

        <button onClick={onClose} style={{ alignSelf: 'flex-end', fontSize: 12, padding: '6px 16px' }}>
          Done
        </button>
      </div>
    </div>
  );
}

