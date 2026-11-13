---
"@team-antioch/sc2-asset-catalog": patch
"@team-antioch/sc2-doodad-finder": patch
---

What the first hand test on Windows found:

- When the embeddings model can't load because the Microsoft Visual C++ Redistributable is missing, the Finder now says what to install, and where to get it, for this machine's architecture.
- On Windows, hints say `npx.cmd`, which PowerShell's default policy runs.
- A failed ranking is printed in the terminal, as well as shown on the page.
- The start line counts the cards embedded, so cards that share a text both count.
