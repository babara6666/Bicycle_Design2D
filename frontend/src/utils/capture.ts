interface CaptureSvgOptions {
  sanitizeForAi?: boolean;
  maskCategory?: string;
}

function cloneSvgForCapture(
  svgElement: SVGSVGElement,
  bgColor: string,
  options: CaptureSvgOptions = {},
): string {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  clone.querySelectorAll("title").forEach((node) => node.remove());
  clone.querySelectorAll(".attach-node, .control-point").forEach((node) => node.remove());

  const background = clone.querySelector("rect");
  if (background instanceof SVGRectElement) {
    background.setAttribute("fill", options.maskCategory ? "#000000" : bgColor);
  }

  if (options.sanitizeForAi || options.maskCategory) {
    clone.querySelectorAll("[data-ai-overlay]").forEach((node) => node.remove());
    clone.querySelectorAll(".skeleton-layer").forEach((node) => node.remove());
    clone.querySelectorAll<SVGGElement>(".part-layer").forEach((node) => {
      node.classList.remove("selected");
      node.setAttribute("opacity", "1");
    });
  }

  if (options.maskCategory) {
    clone.querySelectorAll<SVGGElement>(".part-layer").forEach((node) => {
      if (node.dataset.category !== options.maskCategory) {
        node.remove();
      }
    });

    clone.querySelectorAll<SVGElement>(".part-layer, .part-layer *").forEach((node) => {
      node.setAttribute("opacity", "1");
      const fill = node.getAttribute("fill");
      const stroke = node.getAttribute("stroke");

      if (fill && fill !== "none") {
        node.setAttribute("fill", "#ffffff");
      }
      if (stroke && stroke !== "none") {
        node.setAttribute("stroke", "#ffffff");
      }
      if (!fill && !stroke) {
        node.setAttribute("stroke", "#ffffff");
      }
    });
  }

  return new XMLSerializer().serializeToString(clone);
}

/**
 * Capture the Viewer2D SVG element as a base64 PNG data URL.
 * Uses the SVG's fixed viewBox dimensions (1200x840) for the canvas.
 */
export async function captureSvgToPng(
  svgElement: SVGSVGElement,
  bgColor = "#f4ece0",
  options: CaptureSvgOptions = {},
): Promise<string> {
  const svgData = cloneSvgForCapture(svgElement, bgColor, options);
  return captureSvgMarkupToPng(svgData, bgColor);
}

export async function captureSvgCategoryMaskToPng(
  svgElement: SVGSVGElement,
  category: string,
): Promise<string> {
  const svgData = cloneSvgForCapture(svgElement, "#000000", {
    sanitizeForAi: true,
    maskCategory: category,
  });
  return captureSvgMarkupToPng(svgData, "#000000");
}

export async function captureSvgMarkupToPng(
  svgMarkup: string,
  bgColor = "#f4ece0",
  maxDimension = 1024,
): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.documentElement;

  let width = 1200;
  let height = 840;
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      width = Math.max(1, Math.abs(parts[2]));
      height = Math.max(1, Math.abs(parts[3]));
    }
  }

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvasWidth = Math.max(1, Math.round(width * scale));
  const canvasHeight = Math.max(1, Math.round(height * scale));

  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
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
