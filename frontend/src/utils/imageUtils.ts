/**
 * Remove the light/white background from a PNG data URL.
 * Pixels with luminance >= threshold become fully transparent.
 * Pixels in the soft band [threshold-softRange, threshold) are partially transparent
 * to avoid harsh jagged edges.
 */
export async function removeBackground(
  dataUrl: string,
  threshold = 228,
  softRange = 30,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        // Perceived luminance (ITU-R BT.601)
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lum >= threshold) {
          d[i + 3] = 0; // fully transparent
        } else if (lum >= threshold - softRange) {
          // Soft anti-aliasing edge
          d[i + 3] = Math.round(((threshold - lum) / softRange) * 255);
        }
        // else: keep original alpha (dark pixels stay opaque)
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to load image for background removal"));
    img.src = dataUrl;
  });
}
