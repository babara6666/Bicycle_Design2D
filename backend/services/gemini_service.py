from __future__ import annotations

import base64
import io
from collections.abc import Iterable
from typing import Optional

from PIL import Image, ImageOps
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
        "gemini-3.1-flash-image-preview",
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
    def _prepare_prompt_image(image: Image.Image, max_size: int = 1024) -> Image.Image:
        prepared = ImageOps.exif_transpose(image).convert("RGB")
        prepared.thumbnail((max_size, max_size))
        return prepared

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

    @staticmethod
    def _part_to_image_b64(part) -> str | None:
        """Extract base64 PNG from a response part using the official as_image() API,
        with a fallback to raw inline_data.data for older SDK versions."""
        try:
            img: Image.Image = part.as_image()
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception:
            pass
        # Fallback: read inline_data.data directly
        inline_data = getattr(part, "inline_data", None)
        if inline_data is None:
            return None
        raw = getattr(inline_data, "data", None)
        return GeminiImageService._normalize_inline_data(raw)

    def _extract_result(self, response) -> dict:
        result: dict = {"text": None, "image_base64": None}
        texts: list[str] = []

        # Primary: official response.parts API (gemini-3.1-flash-image-preview style)
        top_parts = getattr(response, "parts", None) or []
        for part in top_parts:
            if part.text is not None:
                texts.append(part.text)
            elif getattr(part, "inline_data", None) is not None:
                encoded = self._part_to_image_b64(part)
                if encoded:
                    result["image_base64"] = encoded

        # Fallback: traverse candidates for older model responses
        if not result["image_base64"]:
            for candidate in getattr(response, "candidates", []) or []:
                content = getattr(candidate, "content", None)
                for part in getattr(content, "parts", []) or []:
                    text = getattr(part, "text", None)
                    if text:
                        texts.append(text)
                    if getattr(part, "inline_data", None) is not None:
                        encoded = self._part_to_image_b64(part)
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
                if "401" in msg or "unauthorized" in msg or "api key not valid" in msg:
                    raise RuntimeError(
                        "Gemini API key is invalid or unauthorized. Please set a valid Google Gemini API key."
                    ) from exc
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
        current_part_image_b64: str | None,
        target_mask_image_b64: str | None,
        part_name_zh: str,
        part_name_en: str,
        design_name: str,
        parts_context: str,
    ) -> dict:
        """Generate a replacement part image.

        Returns the generated part image directly — no compositing back onto
        the original.  The frontend will let the user place this generated
        part onto the canvas manually, like any other replaceable component.
        """
        part_img = self._prepare_prompt_image(self._decode_image(part_image_b64))
        # current_part_image_b64 and target_mask_image_b64 are intentionally
        # not used here — sending the existing part as a reference causes
        # Gemini to reproduce it instead of the new design.

        prompt = (
            f"TASK: Redraw the bicycle part shown in Image 1 ({part_name_en} / {part_name_zh}) "
            f"as a clean standalone 2D AutoCAD technical line-art drawing.\n\n"
            "RULES:\n"
            "1. Reproduce the EXACT geometry, shape, and features shown in Image 1.\n"
            "2. Draw ONLY the single part — not the whole bicycle.\n"
            "3. 2D technical line-art style: crisp dark thin linework, no fills, no shading, no gradients.\n"
            "4. Use a plain light/white background.\n"
            "5. Center the part on the canvas.\n"
            "6. Use dark/black line color with clear contrast against the background.\n"
            "7. Do NOT include any text, labels, annotations, watermarks, part numbers, "
            "   brand names, or captions anywhere in the image.\n"
        )

        contents: list = [
            f"Image 1: reference design of the {part_name_en} ({part_name_zh}) to redraw.",
            part_img,
            prompt,
        ]

        return self._generate(contents)

    def integrate_part(
        self,
        combined_canvas_b64: str,
        part_names_en: str,
        part_names_zh: str,
    ) -> dict:
        """Blend positioned AI overlay part(s) seamlessly into the bicycle drawing.

        combined_canvas_b64 — full canvas screenshot WITH overlay(s) already placed
                               by the user (correct position, scale, rotation visible).
        """
        combined_img = self._prepare_prompt_image(
            self._decode_image(combined_canvas_b64)
        )

        prompt = (
            f"This image shows a technical 2D bicycle drawing where new part(s) — "
            f"{part_names_en} ({part_names_zh}) — have been placed as overlays on the frame.\n\n"
            f"TASK: Seamlessly blend and integrate the new {part_names_en} ({part_names_zh}) "
            f"into the bicycle frame so they look like natural parts of the original drawing.\n\n"
            "RULES:\n"
            "1. Keep the exact position and proportions of the new part(s) exactly as shown.\n"
            "2. Blend the new part(s) smoothly with the adjacent frame elements — clean up\n"
            "   any hard edges, overlapping lines, or discontinuities at the join points.\n"
            "3. All other bicycle parts that are NOT overlays must remain completely unchanged.\n"
            "4. Maintain the overall drawing style of the existing bicycle frame.\n"
            "5. Do NOT add any text, labels, annotations, or watermarks.\n"
            "6. Output the COMPLETE bicycle drawing in the exact same landscape orientation\n"
            "   and aspect ratio as the input (wide, horizontal format — wider than tall).\n"
        )

        return self._generate([combined_img, prompt])
        bicycle_img = self._prepare_prompt_image(self._decode_image(bicycle_image_b64))

        prompt = (
            f"Image 1 shows a technical 2D bicycle drawing where a new "
            f"{part_name_en} ({part_name_zh}) has been placed as an overlay on the frame.\n"
            f"Image 2 is the original clean bicycle drawing without any overlay.\n\n"
            f"TASK: Seamlessly blend and integrate the {part_name_en} ({part_name_zh}) "
            f"overlay from Image 1 into the bicycle frame so it looks like a natural "
            f"part of the drawing.\n\n"
            "RULES:\n"
            "1. Keep the exact position and proportions of the new part as shown in Image 1.\n"
            "2. Blend the new part smoothly with the adjacent frame elements — clean up any\n"
            "   hard edges, overlapping lines, or discontinuities at the join points.\n"
            "3. All other bicycle parts must remain exactly as they appear in Image 2.\n"
            "4. Maintain the overall drawing style consistent with Image 2.\n"
            "5. Do NOT add any text, labels, annotations, or watermarks.\n"
            "6. Output the COMPLETE bicycle drawing in the exact same landscape orientation\n"
            "   and aspect ratio as Image 1 (wide, horizontal format — wider than tall).\n"
        )

        return self._generate(
            [
                "Image 1: bicycle drawing with new part overlay (shows target position).",
                combined_img,
                "Image 2: original clean bicycle drawing (reference for unchanged parts).",
                bicycle_img,
                prompt,
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
