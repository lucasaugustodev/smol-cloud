"""Web search tool — searches the web via DuckDuckGo."""

import urllib.parse
import urllib.request

from smolagents import tool


def make_web_search_tool():
    """Create a web_search tool."""

    @tool
    def web_search(query: str) -> str:
        """Search the web using DuckDuckGo.
        Args:
            query: Search query.
        """
        try:
            url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                html = resp.read().decode("utf-8", errors="replace")
            results = []
            for part in html.split('class="result__snippet"')[1:5]:
                end = part.find("</a>")
                if end > 0:
                    text = part[:end].replace("<b>", "").replace("</b>", "").strip()
                    if text.startswith(">"):
                        text = text[1:].strip()
                    results.append(text)
            return "\n\n".join(results) if results else "No results found."
        except Exception as e:
            return f"[search error: {e}]"

    return web_search
