import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { sound } from '../sound';

interface VideoConferenceProps {
  roomId: string;
  socket?: Socket;
  userName: string;
  onClose: () => void;
}

export function VideoConference({ roomId, socket, userName, onClose }: VideoConferenceProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState<boolean>(true);
  const [camOn, setCamOn] = useState<boolean>(true);
  const [screenSharing, setScreenSharing] = useState<boolean>(false);
  const [peers, setPeers] = useState<Array<{ socketId: string; user: string; video: boolean; audio: boolean }>>([]);
  const [callDuration, setCallDuration] = useState<number>(0);

  useEffect(() => {
    // Start Call Timer
    const timer = setInterval(() => setCallDuration((d) => d + 1), 1000);

    // Request Camera & Audio
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: true })
      .then((s) => {
        setStream(s);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = s;
        }
        socket?.emit('webrtc:media_toggle', { video: true, audio: true, screen: false });
      })
      .catch((err) => {
        console.warn('Camera/Mic permission denied or not available:', err.message);
      });

    if (socket) {
      socket.on('webrtc:peer_media', (peerInfo) => {
        setPeers((prev) => {
          const filtered = prev.filter((p) => p.socketId !== peerInfo.socketId);
          return [...filtered, peerInfo];
        });
      });

      socket.on('webrtc:peer_left', ({ socketId }) => {
        setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
      });
    }

    return () => {
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [roomId, socket]);

  const toggleMic = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicOn(audioTrack.enabled);
        socket?.emit('webrtc:media_toggle', { video: camOn, audio: audioTrack.enabled, screen: screenSharing });
        sound.playPop();
      }
    }
  };

  const toggleCam = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCamOn(videoTrack.enabled);
        socket?.emit('webrtc:media_toggle', { video: videoTrack.enabled, audio: micOn, screen: screenSharing });
        sound.playPop();
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!screenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        setScreenSharing(true);
        socket?.emit('webrtc:media_toggle', { video: camOn, audio: micOn, screen: true });
        sound.playSuccess();
        screenStream.getVideoTracks()[0].onended = () => {
          setScreenSharing(false);
          if (localVideoRef.current && stream) localVideoRef.current.srcObject = stream;
        };
      } catch {}
    } else {
      if (localVideoRef.current && stream) localVideoRef.current.srcObject = stream;
      setScreenSharing(false);
      socket?.emit('webrtc:media_toggle', { video: camOn, audio: micOn, screen: false });
    }
  };

  const formatSec = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 320,
        background: 'rgba(17, 22, 34, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--line-strong)',
        borderRadius: 14,
        boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 500,
      }}
    >
      {/* Top Header */}
      <div
        style={{
          padding: '8px 12px',
          background: 'rgba(0,0,0,0.3)',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
          <b>WebRTC Video Call</b>
          <span style={{ color: 'var(--mut)' }}>{formatSec(callDuration)}</span>
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 14 }}>
          ✕
        </button>
      </div>

      {/* Video Tile */}
      <div style={{ position: 'relative', height: 180, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {!camOn && !screenSharing && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: '#111622',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 18 }}>
              {userName[0]?.toUpperCase()}
            </div>
            <span style={{ fontSize: 12, color: 'var(--mut)' }}>Camera Off</span>
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            bottom: 6,
            left: 8,
            background: 'rgba(0,0,0,0.6)',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 11,
          }}
        >
          {userName} (You)
        </div>
      </div>

      {/* Peer Grid */}
      {peers.length > 0 && (
        <div style={{ padding: 8, display: 'flex', gap: 6, overflowX: 'auto', background: 'rgba(0,0,0,0.2)' }}>
          {peers.map((p) => (
            <div
              key={p.socketId}
              style={{
                width: 80,
                height: 60,
                background: '#1a2233',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
              }}
            >
              <div className="avatar" style={{ width: 22, height: 22, fontSize: 11 }}>
                {p.user[0]?.toUpperCase()}
              </div>
              <span style={{ marginTop: 2, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.user}</span>
            </div>
          ))}
        </div>
      )}

      {/* Controls Bar */}
      <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'center', gap: 10 }}>
        <button
          onClick={toggleMic}
          style={{
            fontSize: 12,
            padding: '6px 10px',
            borderRadius: 20,
            background: micOn ? 'var(--panel)' : 'var(--danger-glow)',
            color: micOn ? 'var(--fg)' : 'var(--danger)',
          }}
          title={micOn ? 'Mute Mic' : 'Unmute Mic'}
        >
          {micOn ? '🎙️ Mic ON' : '🔇 Muted'}
        </button>

        <button
          onClick={toggleCam}
          style={{
            fontSize: 12,
            padding: '6px 10px',
            borderRadius: 20,
            background: camOn ? 'var(--panel)' : 'var(--danger-glow)',
            color: camOn ? 'var(--fg)' : 'var(--danger)',
          }}
          title={camOn ? 'Turn Camera Off' : 'Turn Camera On'}
        >
          {camOn ? '📹 Cam ON' : '🚫 Cam Off'}
        </button>

        <button
          onClick={toggleScreenShare}
          style={{
            fontSize: 12,
            padding: '6px 10px',
            borderRadius: 20,
            background: screenSharing ? 'var(--acc-glow)' : 'var(--panel)',
            color: screenSharing ? 'var(--acc)' : 'var(--fg)',
          }}
          title="Toggle Screen Share"
        >
          🖥️ Share
        </button>
      </div>
    </div>
  );
}
