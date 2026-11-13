# @team-antioch/sc2-asset-catalog

## 0.1.2

### Patch Changes

- 0007af9: What the first hand test on Windows found:

  - When the embeddings model can't load because the Microsoft Visual C++ Redistributable is missing, the Finder now says what to install, and where to get it, for this machine's architecture.
  - On Windows, hints say `npx.cmd`, which PowerShell's default policy runs.
  - A failed ranking is printed in the terminal, as well as shown on the page.
  - The start line counts the cards embedded, so cards that share a text both count.

## 0.1.1

### Patch Changes

- 3c4d485: The first release published from GitHub Actions through npm trusted publishing, with provenance. The README now says the blocked-install-scripts warning from newer npm versions is harmless.
