"""
Gemini Image Generation Service — Nano Banana 2
Model: gemini-2.0-flash-preview-image-generation

All methods are async-compatible via `asyncio.to_thread`.
"""

from __future__ import annotations

import base64
import io
from typing import Optional

from PIL import Image
from google import genai
from google.genai import types

# ── Prompts ────────────────────────────────────────────────────────────────────

MARKETING_PROMPT = (
    "This is a 2D technical drawing of a bicycle frame generated from AutoCAD geometry. "
    "Generate a professional marketing illustration based on this geometry. "
    "The bicycle should look realistic and stylish, maintaining exact proportions shown in the drawing. "
    "Use a clean background, professional studio lighting, and sharp details. "
    "Suitable for product catalogs and client presentations. "
    "Do not add components not shown in the drawing. "
    "Powered by Gemini Nano Banana 2."
)

BRAND_PARTS_SYSTEM = (
    "You are a professional 2D bicycle frame design assistant. "
    "The image shows a 2D technical drawing (AutoCAD-style) of a bicycle frame assembly. "
    "The user wants to visually explore how specific brand parts would look on this frame.\n\n"
    "RULES:\n"
    "1. Maintain the 2D drawing style — do NOT convert to 3D.\n"
    "2. Identify the part the user mentions and sketch how the brand equivalent would look.\n"
    "3. Keep proportions and connections consistent with the existing geometry.\n"
    "4. Preserve the overall frame structure — only change the specified part.\n"
)


class GeminiImageService:
    def __init__(self, api_key: str) -> None:
        self.client = genai.Client(api_key=api_key)
        self.model = "gemini-2.0-flash-preview-image-generation"

    # ── Internal helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _decode_image(b64: str) -> Image.Image:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(b64)))

    @staticmethod
    def _encode_image(img: Image.Image) -> str:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    def _extract_result(self, response) -> dict:
        result: dict = {"text": None, "image_base64": None}
        for part in response.parts:
            if part.text is not None:
                result["text"] = part.text
            elif part.inline_data is not None:
                raw = part.inline_data.data
                if isinstance(raw, bytes):
                    result["image_base64"] = base64.b64encode(raw).decode("utf-8")
                else:
                    result["image_base64"] = raw
        return result

    def _generate(self, contents: list) -> dict:
        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["Text", "Image"],
            ),
        )
        return self._extract_result(response)

    # ── Public methods ─────────────────────────────────────────────────────────

    def generate_marketing_image(
        self,
        svg_screenshot_base64: str,
        component_summary: str = "",
        custom_prompt: Optional[str] = None,
    ) -> dict:
        """2D SVG screenshot → Gemini → marketing illustration."""
        image = self._decode_image(svg_screenshot_base64)
        prompt_parts = []
        if component_summary:
            prompt_parts.append(f"Bicycle configuration: {component_summary}")
        prompt_parts.append(custom_prompt or MARKETING_PROMPT)
        prompt = "\n\n".join(prompt_parts)
        return self._generate([prompt, image])

    def generate_brand_parts(
        self,
        svg_screenshot_base64: str,
        user_prompt: str,
    ) -> dict:
        """Sketch how brand-specific parts would look on the 2D frame."""
        image = self._decode_image(svg_screenshot_base64)
        combined = BRAND_PARTS_SYSTEM + f"\nUser request: {user_prompt}"
        return self._generate([combined, image])

    def replace_part(
        self,
        base_image_b64: str,
        part_image_b64: str,
        part_name_zh: str,
        part_name_en: str,
        design_name: str,
        parts_context: str,
        ref_type: str = "full_bike",
    ) -> dict:
        """Replace a specific part in the 2D drawing using a reference image."""
        base_img = self._decode_image(base_image_b64)
        part_img = self._decode_image(part_image_b64)

        ref_desc = (
            "The reference image shows the full bicycle for style context."
            if ref_type == "full_bike"
            else f"The reference image shows only the new {part_name_en} ({part_name_zh}) part."
        )

        prompt = (
            f"Design context: {design_name}\n"
            f"Current parts:\n{parts_context}\n\n"
            f"Task: Replace the {part_name_en} ({part_name_zh}) in the first image "
            f"(2D AutoCAD-style drawing) with the shape/style shown in the reference image.\n"
            f"{ref_desc}\n\n"
            "RULES:\n"
            "- Keep the 2D drawing style consistent with the original.\n"
            "- Only replace the specified part; keep everything else identical.\n"
            "- Maintain correct geometric connections to adjacent parts.\n"
            "- Preserve all line weights and the overall technical drawing aesthetic.\n"
        )
        return self._generate(
            [
                "Here is the current 2D bicycle drawing (Image 1):",
                base_img,
                "Here is the reference image for the new part (Image 2):",
                part_img,
                f"Instructions: {prompt}",
            ]
        )

    def generate_similar_image(
        self,
        bicycle_image_b64: str,
        reference_image_b64: str,
        user_prompt: str,
    ) -> dict:
        """Apply styling/colours from a reference image to the bicycle drawing."""
        bicycle_img = self._decode_image(bicycle_image_b64)
        reference_img = self._decode_image(reference_image_b64)
        return self._generate(
            [
                "Here is the bicycle design (Image 1):",
                bicycle_img,
                "Here is the reference image for styling (Image 2):",
                reference_img,
                f"Instructions: {user_prompt}\n\nNote: maintain the 2D technical drawing proportions and geometry.",
            ]
        )
