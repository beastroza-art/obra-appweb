import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, Check } from 'lucide-react';

export default function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;

      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;

      const ctx = canvas.getContext('2d');

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000';

      ctxRef.current = ctx;
    };

    setupCanvas();
  }, []);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();

    const ctx = ctxRef.current;
    if (!ctx) return;

    const { x, y } = getPoint(e);

    ctx.beginPath();
    ctx.moveTo(x, y);

    setIsDrawing(true);
  };

  const draw = (e) => {
    e.preventDefault();

    if (!isDrawing) return;

    const ctx = ctxRef.current;
    if (!ctx) return;

    const { x, y } = getPoint(e);

    ctx.lineTo(x, y);
    ctx.stroke();

    setIsEmpty(false);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();

    ctx.clearRect(0, 0, rect.width, rect.height);

    setIsEmpty(true);
  };

  const getTrimmedSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;

    const imageData = ctx.getImageData(0, 0, width, height);
    const { data } = imageData;

    let top = null;
    let left = null;
    let right = null;
    let bottom = null;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];

        if (alpha > 0) {
          if (top === null) top = y;
          if (left === null || x < left) left = x;
          if (right === null || x > right) right = x;
          if (bottom === null || y > bottom) bottom = y;
        }
      }
    }

    if (top === null) return null;

    const padding = 8;

    left = Math.max(left - padding, 0);
    top = Math.max(top - padding, 0);
    right = Math.min(right + padding, width - 1);
    bottom = Math.min(bottom + padding, height - 1);

    const trimmedWidth = right - left + 1;
    const trimmedHeight = bottom - top + 1;

    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = trimmedWidth;
    trimmedCanvas.height = trimmedHeight;

    const trimmedCtx = trimmedCanvas.getContext('2d');
    const trimmedImageData = ctx.getImageData(
      left,
      top,
      trimmedWidth,
      trimmedHeight
    );

    trimmedCtx.putImageData(trimmedImageData, 0, 0);

    return trimmedCanvas.toDataURL('image/png');
  };

  const handleSave = () => {
    if (isEmpty) {
      alert('Por favor dibuja tu firma.');
      return;
    }

    const trimmedSignature = getTrimmedSignature();

    if (!trimmedSignature) {
      alert('No se pudo procesar la firma.');
      return;
    }

    onSave(trimmedSignature);
  };

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        className="h-32 w-full cursor-crosshair rounded-lg border border-border bg-white touch-none"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        onTouchCancel={stopDrawing}
      />

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearCanvas}
          className="gap-1"
        >
          <RotateCcw className="h-3 w-3" />
          Limpiar
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
        >
          Cancelar
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={isEmpty}
          className="gap-1"
        >
          <Check className="h-3 w-3" />
          Guardar firma
        </Button>
      </div>
    </div>
  );
}