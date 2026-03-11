import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Paintbrush, Eraser, RotateCcw, Check, X } from "lucide-react";

interface ImageMaskEditorProps {
  displayWidth: number;
  displayHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  onSave: (maskDataUrl: string) => void;
  onCancel: () => void;
}

export default function ImageMaskEditor({
  displayWidth,
  displayHeight,
  naturalWidth,
  naturalHeight,
  onSave,
  onCancel,
}: ImageMaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [hasDrawn, setHasDrawn] = useState(false);

  // Initialize / resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !displayWidth || !displayHeight) return;
    canvas.width = Math.round(displayWidth);
    canvas.height = Math.round(displayHeight);
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }, [displayWidth, displayHeight]);

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

  /** Draw a continuous stroke from lastPos to (x,y) using lineTo */
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
        // Draw a line from last position to current position
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else {
        // First point: draw a dot
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      lastPosRef.current = { x, y };
      setHasDrawn(true);
    },
    [brushSize, tool]
  );

  // ─── Pointer handlers ──────────────────────────────
  const onDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      lastPosRef.current = null; // Reset last position for new stroke
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
    lastPosRef.current = null;
  }, []);

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Build a black/white mask at the original image resolution
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
    onSave(maskCanvas.toDataURL("image/png"));
  }, [naturalWidth, naturalHeight, onSave]);

  return (
    <>
      {/* Canvas overlay — sits on top of the image */}
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

      {/* Floating toolbar at the top of the image */}
      <div className="absolute top-2 left-2 right-2 z-30 flex items-center gap-1.5 bg-background/90 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-lg border border-border">
        <div className="flex items-center gap-0.5 bg-muted rounded p-0.5">
          <button
            type="button"
            onClick={() => setTool("brush")}
            className={`h-6 px-1.5 rounded text-[11px] flex items-center gap-1 transition-colors ${
              tool === "brush" ? "bg-primary text-primary-foreground" : "hover:bg-muted-foreground/10"
            }`}
          >
            <Paintbrush className="h-3 w-3" />
            画笔
          </button>
          <button
            type="button"
            onClick={() => setTool("eraser")}
            className={`h-6 px-1.5 rounded text-[11px] flex items-center gap-1 transition-colors ${
              tool === "eraser" ? "bg-primary text-primary-foreground" : "hover:bg-muted-foreground/10"
            }`}
          >
            <Eraser className="h-3 w-3" />
            橡皮
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-1 min-w-[80px]">
          <Slider
            value={[brushSize]}
            onValueChange={([v]) => setBrushSize(v)}
            min={5}
            max={80}
            step={1}
            className="flex-1"
          />
          <span className="text-[10px] text-muted-foreground w-5 text-right">{brushSize}</span>
        </div>

        <button
          type="button"
          onClick={handleClear}
          className="h-6 px-1.5 rounded text-[11px] flex items-center gap-1 hover:bg-muted transition-colors text-muted-foreground"
        >
          <RotateCcw className="h-3 w-3" />
        </button>

        <div className="flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-6 px-1.5 text-[11px]">
            <X className="h-3 w-3" />
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasDrawn} className="h-6 px-2 text-[11px]">
            <Check className="h-3 w-3 mr-0.5" />
            确认
          </Button>
        </div>
      </div>

      {/* Hint text at the bottom */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 bg-black/60 text-white text-[10px] px-3 py-1 rounded-full">
        在图片上圈出需要调整的区域
      </div>
    </>
  );
}
