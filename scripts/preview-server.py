#!/usr/bin/env python3
"""Zero-config static file server for the Strap gallery.

Why not `python3 -m http.server`? Its CLI calls os.getcwd() at import, which some
sandboxes block. This serves an explicit directory derived from this file's path,
so it never touches getcwd. Invoke with an ABSOLUTE script path (see .claude/launch.json).

Usage: python3 /abs/path/scripts/preview-server.py [port]
"""
import os
import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler

here = __file__ if os.path.isabs(__file__) else os.path.join(os.environ.get("STRAP_ROOT", ""), "scripts", "preview-server.py")
ROOT = os.path.dirname(os.path.dirname(here))  # project root (parent of scripts/)
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173

handler = partial(SimpleHTTPRequestHandler, directory=ROOT)
print(f"Strap gallery: serving {ROOT} on http://127.0.0.1:{PORT}", flush=True)
HTTPServer(("127.0.0.1", PORT), handler).serve_forever()
