from __future__ import annotations

import base64
import io
from collections.abc import Iterable
from typing import Optional

from PIL import Image
from google import genai
from google.genai import types

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
    "1. Maintain the 2D drawing style; do NOT convert to 3D.\n"
    "2. Identify the part the user mentions and sketch how the brand equivalent would look.\n"
    "3. Keep proportions and connections consistent with the existing geometry.\n"
    "4. Preserve the overall frame structure; only change the specified part.\n"
)


class GeminiImageService:
    _FALLBACK_MODELS: tuple[str, ...] = (
        "gemini-2.5-flash-image",
        "gemini-2.0-flash-exp-image-generation",
        "gemini-2.0-flash-exp",
    )

    def __init__(self, api_key: str, preferred_model: str | None = None) -> None:
        self.client = genai.Client(api_key=api_key)
        models: list[str] = []
        if preferred_model and preferred_model.strip():
            models.append(preferred_model.strip())
        for fallback in self._FALLBACK_MODELS:
            if fallback not in models:
                models.append(fallback)
        self.models = models

    @staticmethod
    def _decode_image(b64: str) -> Image.Image:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(b64)))

    @staticmethod
    def _iter_parts(response) -> Iterable:
        direct_parts = getattr(response, "parts", None)
        if direct_parts:
            for part in direct_parts:
                yield part

        for candidate in getattr(response, "candidates", []) or []:
            content = getattr(candidate, "content", None)
            for part in getattr(content, "parts", []) or []:
                yield part

    @staticmethod
    def _normalize_inline_data(raw: str | bytes | bytearray | None) -> str | None:
        if raw is None:
            return None
        if isinstance(raw, (bytes, bytearray)):
            return base64.b64encode(raw).decode("utf-8")

        value = str(raw)
        if value.startswith("data:") and "," in value:
            value = value.split(",", 1)[1]
        return value

    def _extract_result(self, response) -> dict:
        result: dict = {"text": None, "image_base64": None}
        texts: list[str] = []

        for part in self._iter_parts(response):
            text = getattr(part, "text", None)
            if text:
                texts.append(text)

            inline_data = getattr(part, "inline_data", None)
            raw = getattr(inline_data, "data", None) if inline_data is not None else None
            encoded = self._normalize_inline_data(raw)
            if encoded:
                result["image_base64"] = encoded

        if texts:
            result["text"] = "\n\n".join(texts)

        return result

    def _generate(self, contents: list) -> dict:
        last_exc: Exception | None = None

        for idx, model in enumerate(self.models):
            try:
                response = self.client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_modalities=["TEXT", "IMAGE"],
                    ),
                )
                result = self._extract_result(response)
                if result.get("image_base64"):
                    return result
                raise RuntimeError("Gemini did not return an image in the response.")
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                msg = str(exc).lower()
                model_issue = (
                    "model" in msg
                    or "not found" in msg
                    or "not available" in msg
                    or "unsupported" in msg
                )
                has_fallback = idx < len(self.models) - 1
                if model_issue and has_fallback:
                    continue
                raise

        if last_exc is not None:
            raise last_exc
        raise RuntimeError("Gemini image generation failed without an explicit error.")

    def generate_marketing_image(
        self,
        svg_screenshot_base64: str,
        component_summary: str = "",
        custom_prompt: Optional[str] = None,
    ) -> dict:
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
