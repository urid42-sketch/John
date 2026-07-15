import os
from pathlib import Path

from mcp.server.fastmcp import FastMCP
from google import genai
from google.genai import types

mcp = FastMCP("gemini-bridge")

DEFAULT_TEXT_MODEL = "gemini-2.5-pro"
DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image"  # "Nano Banana"


def _client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Get a key at https://aistudio.google.com/apikey "
            "and export it before starting this server."
        )
    return genai.Client(api_key=api_key)


def _mime_type(path: str) -> str:
    ext = Path(path).suffix.lower()
    return {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}.get(
        ext, "image/png"
    )


@mcp.tool()
def gemini_generate_text(prompt: str, model: str = DEFAULT_TEXT_MODEL) -> str:
    """Ask a Gemini model to reason, draft, or critique text (specs, plans, copy)."""
    response = _client().models.generate_content(model=model, contents=prompt)
    return response.text


@mcp.tool()
def gemini_generate_image(prompt: str, output_path: str, model: str = DEFAULT_IMAGE_MODEL) -> str:
    """Generate an image with Gemini's Nano Banana model and save it to output_path.

    Use for blueprint diagrams, mockups, product renders, etc. Returns the saved file path.
    """
    response = _client().models.generate_content(model=model, contents=prompt)
    out = Path(output_path)
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(part.inline_data.data)
            return str(out)
    raise RuntimeError("Gemini did not return an image for this prompt.")


@mcp.tool()
def gemini_edit_image(
    image_path: str, instruction: str, output_path: str, model: str = DEFAULT_IMAGE_MODEL
) -> str:
    """Refine an existing image with a text instruction using Gemini's Nano Banana model.

    Use to iterate on a blueprint/mockup Claude already generated. Returns the saved file path.
    """
    image_bytes = Path(image_path).read_bytes()
    response = _client().models.generate_content(
        model=model,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=_mime_type(image_path)),
            instruction,
        ],
    )
    out = Path(output_path)
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(part.inline_data.data)
            return str(out)
    raise RuntimeError("Gemini did not return an edited image.")


if __name__ == "__main__":
    mcp.run()
