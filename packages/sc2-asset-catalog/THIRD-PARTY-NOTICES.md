# Third-party notices

## WhiteoutFlakes

The built-in renderer (`src/catalog/whiteoutflakes.ts`, `src/catalog/whiteoutflakes-frames.ts`) runs the
[WhiteoutFlakes](https://github.com/FernandoS27/WhiteoutFlakes) model viewer, and
`scripts/build-whiteoutflakes.sh` builds it from its source at commit d2756ce, with build settings taken
from its CI. No WhiteoutFlakes code ships in this package. Its export recipe, its settings file and
its command line are used as WhiteoutFlakes documents and reads them, and the build script carries its
build pins, so its licence and AI-derived works notice are kept here:

```text
BSD 3-Clause License

Copyright (c) 2026, Fernando Sahmkow

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

```text
AI-Derived Works Notice

For the purposes of the BSD-3-Clause License, any code generated
by automated systems, machine learning models, or AI tools that
is derived from, based on, or generated using this software as
input shall be considered a derivative work.

Redistributions of such AI-derived works must retain the original
copyright notice, license conditions, and disclaimer as required
by the BSD-3-Clause License.
```
