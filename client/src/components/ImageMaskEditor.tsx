import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Paintbrush, Eraser, RotateCcw, Check, X } from "lucide-react";

export interface ImageMaskEditorHandle {
  clear: () => void;
  save: () => void;
  hasDrawn: boolean;
  brushSize: number;
  setBrushSize: (v: number) => void;
  tool: "brush" | "eraser";
  setTool: (t: "brush" | "eraser") => void;
}

interface ImageMaskEditorProps {
  displayWidth: number;
  displayHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  onSave: (maskDataUrl: string, displayDataUrl?: string) => void;
  onCancel: () => void;
  /** Called whenever the "has drawn" state changes, so parent can sync toolbar */
  onHasDrawnChange?: (v: boolean) => void;
}

const ImageMaskEditor = forwardRef<ImageMaskEditorHandle, ImageMaskEditorProps>(
  function ImageMaskEditor(
    { displayWidth, displayHeight, naturalWidth, naturalHeight, onSave, onCancel, onHasDrawnChange },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const lastPosRef = useRef<{ x: number; y: number } | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushSize, setBrushSize] = useState(30);
    const [tool, setTool] = useState<"brush" | "eraser">("brush");
    const [hasDrawn, setHasDrawn] = useState(false);

    // Expose imperative handle so parent can render the toolbar externally
    useImperativeHandle(ref, () => ({
      clear: handleClear,
      save: handleSave,
      hasDrawn,
      brushSize,
      setBrushSize,
      tool,
      setTool,
    }));

    // Initialize / resize canvas
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !displayWidth || !displayHeight) return;
      canvas.width = Math.round(displayWidth);
      canvas.height = Math.round(displayHeight);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
        onHasDrawnChange?.(false);
    }, [displayWidth, displayHeight, onHasDrawnChange]);

    const getCoords = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
      },
      []
    );

    const drawStroke = useCallback(
      (x: number, y: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = tool === "eraser" ? "rgba(0,0,0,1)" : "rgba(255,80,50,0.45)";
        ctx.fillStyle = tool === "eraser" ? "rgba(0,0,0,1)" : "rgba(255,80,50,0.45)";

        const last = lastPosRef.current;
        if (last) {
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        lastPosRef.current = { x, y };
        if (!hasDrawn) onHasDrawnChange?.(true);
        setHasDrawn(true);
      },
      [brushSize, tool, hasDrawn, onHasDrawnChange]
    );

    const onDown = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        lastPosRef.current = null;
        setIsDrawing(true);
        const c = getCoords(e);
        drawStroke(c.x, c.y);
      },
      [getCoords, drawStroke]
    );

    const onMove = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const c = getCoords(e);
        drawStroke(c.x, c.y);
      },
      [isDrawing, getCoords, drawStroke]
    );

    const onUp = useCallback(() => {
      setIsDrawing(false);
      lastPosRef.current = null;
    }, []);

    const onTouchDown = useCallback(
      (e: React.TouchEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        lastPosRef.current = null;
        setIsDrawing(true);
        const c = getCoords(e);
        drawStroke(c.x, c.y);
      },
      [getCoords, drawStroke]
    );

    const onTouchMove = useCallback(
      (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        e.preventDefault();
        const c = getCoords(e);
        drawStroke(c.x, c.y);
      },
      [isDrawing, getCoords, drawStroke]
    );

    const handleClear = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
      onHasDrawnChange?.(false);
      lastPosRef.current = null;
    }, [onHasDrawnChange]);

    const handleSave = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = naturalWidth;
      maskCanvas.height = naturalHeight;
      const mctx = maskCanvas.getContext("2d");
      if (!mctx) return;

      mctx.fillStyle = "#000";
      mctx.fillRect(0, 0, naturalWidth, naturalHeight);

      const scaleX = naturalWidth / canvas.width;
      const scaleY = naturalHeight / canvas.height;
      const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const dst = mctx.getImageData(0, 0, naturalWidth, naturalHeight);

      for (let my = 0; my < naturalHeight; my++) {
        const sy = Math.min(Math.floor(my / scaleY), canvas.height - 1);
        for (let mx = 0; mx < naturalWidth; mx++) {
          const sx = Math.min(Math.floor(mx / scaleX), canvas.width - 1);
          if (src.data[(sy * canvas.width + sx) * 4 + 3] > 10) {
            const di = (my * naturalWidth + mx) * 4;
            dst.data[di] = dst.data[di + 1] = dst.data[di + 2] = dst.data[di + 3] = 255;
          }
        }
      }
      mctx.putImageData(dst, 0, 0);
      const displayDataUrl = canvas.toDataURL("image/png");
      onSave(maskCanvas.toDataURL("image/png"), displayDataUrl);
    }, [naturalWidth, naturalHeight, onSave]);

    return (
      <>
        {/* Canvas overlay */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-20 cursor-crosshair"
          style={{ touchAction: "none", width: displayWidth, height: displayHeight }}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          onTouchStart={onTouchDown}
          onTouchMove={onTouchMove}
          onTouchEnd={onUp}
        />
        {/* Hint text */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-black/60 text-white text-[10px] px-3 py-1 rounded-full pointer-events-none whitespace-nowrap">
          在图片上圈出需要调整的区域
        </div>
      </>
    );
  }
);

export default ImageMaskEditor;

/** Standalone toolbar — render this OUTSIDE the image container, below the image */
export function ImageMaskToolbar({
  brushSize,
  setBrushSize,
  tool,
  setTool,
  hasDrawn,
  onClear,
  onSave,
  onCancel,
}: {
  brushSize: number;
  setBrushSize: (v: number) => void;
  tool: "brush" | "eraser";
  setTool: (t: "brush" | "eraser") => void;
  hasDrawn: boolean;
  onClear: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2 shadow-sm">
      {/* Tool switcher */}
      <div className="flex items-center gap-0.5 bg-muted rounded p-0.5">
        <button
          type="button"
          onClick={() => setTool("brush")}
          className={`h-7 px-2 rounded text-xs flex items-center gap-1.5 transition-colors ${
            tool === "brush" ? "bg-primary text-primary-foreground" : "hover:bg-muted-foreground/10"
          }`}
        >
          <Paintbrush className="h-3.5 w-3.5" />
          画笔
        </button>
        <button
          type="button"
          onClick={() => setTool("eraser")}
          className={`h-7 px-2 rounded text-xs flex items-center gap-1.5 transition-colors ${
            tool === "eraser" ? "bg-primary text-primary-foreground" : "hover:bg-muted-foreground/10"
          }`}
        >
          <Eraser className="h-3.5 w-3.5" />
          橡皮
        </button>
      </div>

      {/* Brush size */}
      <div className="flex items-center gap-2 flex-1 min-w-[100px]">
        <span className="text-xs text-muted-foreground whitespace-nowrap">笔刷大小</span>
        <Slider
          value={[brushSize]}
          onValueChange={([v]) => setBrushSize(v)}
          min={5}
          max={80}
          step={1}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground w-6 text-right">{brushSize}</span>
      </div>

      {/* Clear */}
      <button
        type="button"
        onClick={onClear}
        className="h-7 px-2 rounded text-xs flex items-center gap-1 hover:bg-muted transition-colors text-muted-foreground"
        title="清除标注"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        清除
      </button>

      <div className="flex items-center gap-1.5 ml-auto">
        <Button variant="outline" size="sm" onClick={onCancel} className="h-7 text-xs">
          <X className="h-3.5 w-3.5 mr-1" />
          取消
        </Button>
        <Button size="sm" onClick={onSave} disabled={!hasDrawn} className="h-7 text-xs">
          <Check className="h-3.5 w-3.5 mr-1" />
          确认标注
        </Button>
      </div>
    </div>
  );
}
