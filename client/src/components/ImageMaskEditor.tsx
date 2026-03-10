import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Paintbrush, Eraser, RotateCcw, Check, X } from "lucide-react";

interface ImageMaskEditorProps {
  imageUrl: string;
  onSave: (maskDataUrl: string) => void;
  onCancel: () => void;
}

export default function ImageMaskEditor({ imageUrl, onSave, onCancel }: ImageMaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  // When the <img> element loads, calculate canvas dimensions
  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    setNaturalSize({ width: nw, height: nh });

    const containerWidth = container.clientWidth;
    const maxHeight = 500;
    const ratio = nw / nh;

    let canvasW = containerWidth;
    let canvasH = containerWidth / ratio;

    if (canvasH > maxHeight) {
      canvasH = maxHeight;
      canvasW = maxHeight * ratio;
    }

    setCanvasSize({ width: Math.round(canvasW), height: Math.round(canvasH) });
    setImageLoaded(true);
    setLoadError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setLoadError(true);
    setImageLoaded(false);
  }, []);

  // Initialize canvas once size is set
  useEffect(() => {
    if (!imageLoaded || !canvasRef.current || canvasSize.width === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [imageLoaded, canvasSize]);

  const getCanvasCoords = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const draw = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 80, 80, 0.45)";
    ctx.fill();
  }, [brushSize, tool]);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    draw(x, y);
  }, [getCanvasCoords, draw]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    draw(x, y);
  }, [isDrawing, getCanvasCoords, draw]);

  const handlePointerUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || naturalSize.width === 0) return;

    // Create a mask image at the original image resolution
    // White = area to edit, Black = area to keep
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = naturalSize.width;
    maskCanvas.height = naturalSize.height;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;

    // Fill with black (keep everything)
    maskCtx.fillStyle = "#000000";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    // Scale the drawn mask to the original image size
    const scaleX = naturalSize.width / canvasSize.width;
    const scaleY = naturalSize.height / canvasSize.height;

    // Get the drawn mask data
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const drawData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Create white areas where the user painted
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    for (let y = 0; y < maskCanvas.height; y++) {
      for (let x = 0; x < maskCanvas.width; x++) {
        const srcX = Math.min(Math.floor(x / scaleX), canvas.width - 1);
        const srcY = Math.min(Math.floor(y / scaleY), canvas.height - 1);
        const srcIdx = (srcY * canvas.width + srcX) * 4;
        const alpha = drawData.data[srcIdx + 3];
        if (alpha > 10) {
          const dstIdx = (y * maskCanvas.width + x) * 4;
          maskData.data[dstIdx] = 255;     // R
          maskData.data[dstIdx + 1] = 255; // G
          maskData.data[dstIdx + 2] = 255; // B
          maskData.data[dstIdx + 3] = 255; // A
        }
      }
    }
    maskCtx.putImageData(maskData, 0, 0);

    const dataUrl = maskCanvas.toDataURL("image/png");
    onSave(dataUrl);
  }, [canvasSize, naturalSize, onSave]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={tool === "brush" ? "default" : "outline"}
          size="sm"
          onClick={() => setTool("brush")}
          className="h-8"
        >
          <Paintbrush className="h-3.5 w-3.5 mr-1" />
          画笔
        </Button>
        <Button
          variant={tool === "eraser" ? "default" : "outline"}
          size="sm"
          onClick={() => setTool("eraser")}
          className="h-8"
        >
          <Eraser className="h-3.5 w-3.5 mr-1" />
          橡皮
        </Button>
        <Button variant="outline" size="sm" onClick={handleClear} className="h-8">
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          清除
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">笔刷: {brushSize}px</span>
          <Slider
            value={[brushSize]}
            onValueChange={([v]) => setBrushSize(v)}
            min={5}
            max={80}
            step={1}
            className="w-24"
          />
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="relative rounded-lg overflow-hidden border border-border bg-muted">
        {/* Always render the img element so it can load; hide it before loaded */}
        <img
          ref={imgRef}
          src={imageUrl}
          alt="参考图"
          crossOrigin="anonymous"
          onLoad={handleImageLoad}
          onError={handleImageError}
          style={
            imageLoaded && canvasSize.width > 0
              ? { width: canvasSize.width, height: canvasSize.height, display: "block" }
              : { display: "none" }
          }
          draggable={false}
        />

        {imageLoaded && canvasSize.width > 0 && (
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="absolute inset-0 cursor-crosshair"
            style={{ touchAction: "none" }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
        )}

        {!imageLoaded && !loadError && (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              加载图片中...
            </div>
          </div>
        )}

        {loadError && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
            <X className="h-6 w-6 text-destructive/60" />
            <p>图片加载失败</p>
            <p className="text-[11px] text-muted-foreground/60">请尝试重新上传图片后再标注</p>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        用画笔在图片上圈出需要局部调整的区域（红色标注），AI 将只修改标注区域
      </p>

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" />
          取消标注
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!imageLoaded}>
          <Check className="h-3.5 w-3.5 mr-1" />
          确认标注
        </Button>
      </div>
    </div>
  );
}
