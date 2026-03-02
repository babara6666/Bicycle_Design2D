/**
 * Capture the Viewer2D SVG element as a base64 PNG data URL.
 * Uses the SVG's fixed viewBox dimensions (1200×840) for the canvas.
 */
export async function captureSvgToPng(
  svgElement: SVGSVGElement,
  bgColor = "#f4ece0",
): Promise<string> {
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Use the viewBox dimensions for a consistent export resolution
      const W = 1200;
      const H = 840;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load serialized SVG into Image element"));
    };
    img.src = url;
  });
}
