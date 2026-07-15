# gemini-mcp

A small MCP server that gives Claude direct access to Gemini's models — including
the "Nano Banana" image model (`gemini-2.5-flash-image`) — as native tools. Once
registered, Claude can call Gemini in the middle of its own reasoning, e.g.:

> "Write the product spec yourself, then call `gemini_generate_image` to render
> a blueprint diagram, then `gemini_edit_image` to refine it."

This runs locally on your machine, not inside any specific repo — register it
once and it's available in every Claude Code session.

## Tools exposed

- `gemini_generate_text(prompt, model="gemini-2.5-pro")` — text generation/reasoning.
- `gemini_generate_image(prompt, output_path, model="gemini-2.5-flash-image")` —
  generates an image with Nano Banana and saves it to `output_path`.
- `gemini_edit_image(image_path, instruction, output_path, model=...)` — refines
  an existing image with a text instruction (iterate on a blueprint/mockup).

## Setup

1. **Get a Gemini API key**: https://aistudio.google.com/apikey

2. **Clone this repo locally** and install dependencies (Python 3.10+):

   ```bash
   cd gemini-mcp
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Set your API key** (don't commit it — export it in your shell profile or
   pass it via `--env` when registering, see below):

   ```bash
   export GEMINI_API_KEY="your-key-here"
   ```

4. **Register with Claude Code**, scoped to your user so it's available in
   every session/chat:

   ```bash
   claude mcp add --scope user gemini-bridge \
     --env GEMINI_API_KEY="$GEMINI_API_KEY" \
     -- python3 /absolute/path/to/gemini-mcp/server.py
   ```

   Verify it's connected:

   ```bash
   claude mcp list
   ```

5. **Claude Desktop** (optional, same server binary): add to
   `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
   the equivalent Windows/Linux path:

   ```json
   {
     "mcpServers": {
       "gemini-bridge": {
         "command": "python3",
         "args": ["/absolute/path/to/gemini-mcp/server.py"],
         "env": { "GEMINI_API_KEY": "your-key-here" }
       }
     }
   }
   ```

## Cowork

Cowork's ambient/hosted sessions don't read your local Claude Code or Desktop
MCP config — they need a server that's reachable over the network (not a local
stdio process) and added through Cowork's own connector settings. If you want
this bridge available there too, the next step is deploying `server.py` behind
an HTTP/SSE MCP transport (e.g. on Vercel/Cloud Run) and adding it as a
connector in Cowork's settings, rather than running it as a local subprocess.

## Notes

- Nano Banana (`gemini-2.5-flash-image`) returns image bytes inline; the tools
  here write them straight to disk so Claude can reference the file path in
  its response.
- `GEMINI_API_KEY` is read from the environment only — it is never written to
  disk by this server.
