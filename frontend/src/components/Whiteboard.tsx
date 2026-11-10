import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { sound } from '../sound';

interface WhiteboardProps {
  roomId: string;
  socket?: Socket;
  onClose: () => void;
}

interface DrawElement {
  id: string;
  type: 'pen' | 'rect' | 'circle' | 'diamond' | 'arrow' | 'text' | 'db';
  points?: { x: number; y: number }[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  color: string;
  width: number;
}

export function Whiteboard({ roomId, socket, onClose }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<'pen' | 'rect' | 'circle' | 'diamond' | 'arrow' | 'text' | 'db'>('pen');
  const [color, setColor] = useState<string>('#58a6ff');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [elements, setElements] = useState<DrawElement[]>([]);
  const [history, setHistory] = useState<DrawElement[][]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentElem, setCurrentElem] = useState<DrawElement | null>(null);

  // Load saved whiteboard data on mount
  useEffect(() => {
    fetch(`/api/v1/rooms/${roomId}/whiteboard`, {
      headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.data) {
          try {
            const parsed = JSON.parse(d.data);
            if (Array.isArray(parsed)) setElements(parsed);
          } catch {}
        }
      })
      .catch(() => {});
  }, [roomId]);

  // Listen for peer draw events over WebSocket
  useEffect(() => {
    if (!socket) return;
    const handleDraw = (elem: DrawElement) => {
      setElements((prev) => [...prev, elem]);
    };
    const handleClear = () => {
      setElements([]);
    };

    socket.on('whiteboard:draw', handleDraw);
    socket.on('whiteboard:clear', handleClear);

    return () => {
      socket.off('whiteboard:draw', handleDraw);
      socket.off('whiteboard:clear', handleClear);
    };
  }, [socket]);

  // Redraw canvas whenever elements change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allToDraw = currentElem ? [...elements, currentElem] : elements;
    allToDraw.forEach((el) => {
      ctx.strokeStyle = el.color;
      ctx.fillStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (el.type === 'pen' && el.points && el.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
      } else if (el.type === 'rect' && el.x !== undefined && el.y !== undefined && el.w && el.h) {
        ctx.strokeRect(el.x, el.y, el.w, el.h);
      } else if (el.type === 'circle' && el.x !== undefined && el.y !== undefined && el.w && el.h) {
        ctx.beginPath();
        const rx = Math.abs(el.w) / 2;
        const ry = Math.abs(el.h) / 2;
        ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (el.type === 'diamond' && el.x !== undefined && el.y !== undefined && el.w && el.h) {
        ctx.beginPath();
        ctx.moveTo(el.x + el.w / 2, el.y);
        ctx.lineTo(el.x + el.w, el.y + el.h / 2);
        ctx.lineTo(el.x + el.w / 2, el.y + el.h);
        ctx.lineTo(el.x, el.y + el.h / 2);
        ctx.closePath();
        ctx.stroke();
      } else if (el.type === 'arrow' && el.x !== undefined && el.y !== undefined && el.w !== undefined && el.h !== undefined) {
        const x2 = el.x + el.w;
        const y2 = el.y + el.h;
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // Arrow head
        const angle = Math.atan2(y2 - el.y, x2 - el.x);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 12 * Math.cos(angle - Math.PI / 6), y2 - 12 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - 12 * Math.cos(angle + Math.PI / 6), y2 - 12 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (el.type === 'text' && el.x !== undefined && el.y !== undefined && el.text) {
        ctx.font = '14px var(--font-sans)';
        ctx.fillText(el.text, el.x, el.y);
      } else if (el.type === 'db' && el.x !== undefined && el.y !== undefined && el.w && el.h) {
        // Database cylinder
        ctx.beginPath();
        ctx.ellipse(el.x + el.w / 2, el.y + 10, el.w / 2, 8, 0, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.strokeRect(el.x, el.y + 10, el.w, el.h - 20);
        ctx.beginPath();
        ctx.ellipse(el.x + el.w / 2, el.y + el.h - 10, el.w / 2, 8, 0, 0, Math.PI);
        ctx.stroke();
      }
    });
  }, [elements, currentElem]);

  const saveToBackend = (newElems: DrawElement[]) => {
    fetch(`/api/v1/rooms/${roomId}/whiteboard`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (localStorage.getItem('token') || ''),
      },
      body: JSON.stringify({ data: JSON.stringify(newElems) }),
    }).catch(() => {});
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'text') {
      const val = prompt('Enter diagram label or service name:');
      if (val) {
        const textElem: DrawElement = {
          id: Math.random().toString(),
          type: 'text',
          x,
          y,
          text: val,
          color,
          width: strokeWidth,
        };
        const next = [...elements, textElem];
        setHistory((h) => [...h, elements]);
        setElements(next);
        socket?.emit('whiteboard:draw', textElem);
        saveToBackend(next);
      }
      return;
    }

    setIsDrawing(true);
    setHistory((h) => [...h, elements]);

    if (tool === 'pen') {
      setCurrentElem({
        id: Math.random().toString(),
        type: 'pen',
        points: [{ x, y }],
        color,
        width: strokeWidth,
      });
    } else {
      setCurrentElem({
        id: Math.random().toString(),
        type: tool,
        x,
        y,
        w: 0,
        h: 0,
        color,
        width: strokeWidth,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentElem) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentElem.type === 'pen' && currentElem.points) {
      setCurrentElem({
        ...currentElem,
        points: [...currentElem.points, { x, y }],
      });
    } else if (currentElem.x !== undefined && currentElem.y !== undefined) {
      setCurrentElem({
        ...currentElem,
        w: x - currentElem.x,
        h: y - currentElem.y,
      });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentElem) return;
    setIsDrawing(false);
    const next = [...elements, currentElem];
    setElements(next);
    socket?.emit('whiteboard:draw', currentElem);
    saveToBackend(next);
    setCurrentElem(null);
  };

  const undo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, h.length - 1));
    setElements(last);
    saveToBackend(last);
    sound.playPop();
  };

  const clearAll = () => {
    if (!window.confirm('Clear entire whiteboard?')) return;
    setHistory((h) => [...h, elements]);
    setElements([]);
    saveToBackend([]);
    socket?.emit('whiteboard:clear');
    sound.playPop();
  };

  const exportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `system-design-${roomId}.png`;
    a.click();
    sound.playSuccess();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 940, height: '88vh', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {/* Top Controls Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>📐 System Design Whiteboard</span>
            <span className="badge badge-part">Real-Time Sync</span>
          </div>

          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {/* Shape tools */}
            {(
              [
                { id: 'pen', label: '✏️ Pen' },
                { id: 'rect', label: '⬜ Box' },
                { id: 'circle', label: '⭕ Node' },
                { id: 'diamond', label: '🔷 Decision' },
                { id: 'arrow', label: '➡️ Arrow' },
                { id: 'db', label: '🗄️ Database' },
                { id: 'text', label: '🔤 Label' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  borderColor: tool === t.id ? 'var(--acc)' : 'var(--line)',
                  background: tool === t.id ? 'var(--acc-glow)' : 'transparent',
                }}
              >
                {t.label}
              </button>
            ))}

            {/* Colors */}
            <div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
              {['#ffffff', '#58a6ff', '#3fb950', '#f85149', '#d29922', '#a371f7'].map((c) => (
                <div
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: c,
                    cursor: 'pointer',
                    border: color === c ? '2px solid #fff' : '1px solid transparent',
                  }}
                />
              ))}
            </div>

            {/* Stroke Width */}
            <select
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              style={{ fontSize: 11, padding: '2px 4px', marginLeft: 4 }}
            >
              <option value="2">Thin</option>
              <option value="3">Med</option>
              <option value="5">Thick</option>
            </select>

            <button onClick={undo} style={{ fontSize: 11, padding: '4px 8px' }} title="Undo">
              ↩ Undo
            </button>
            <button onClick={clearAll} style={{ fontSize: 11, padding: '4px 8px', color: 'var(--danger)' }} title="Clear All">
              🗑️ Clear
            </button>
            <button className="btn-primary" onClick={exportPNG} style={{ fontSize: 11, padding: '4px 10px' }}>
              💾 Export PNG
            </button>
            <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 16 }}>
              ✕
            </button>
          </div>
        </div>

        {/* Canvas Drawing Area */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: '#070a10',
            border: '1px solid var(--line)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <canvas
            ref={canvasRef}
            width={900}
            height={560}
            style={{ width: '100%', height: '100%', cursor: tool === 'text' ? 'text' : 'crosshair' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          />
        </div>
      </div>
    </div>
  );
}
