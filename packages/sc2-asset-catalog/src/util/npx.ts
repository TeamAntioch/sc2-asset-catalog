// The npx command as hints should name it. On Windows, PowerShell's default execution policy
// refuses npx.ps1, the script `npx` finds there first, so a hint that says `npx` fails as
// written; npx.cmd runs under any policy, in PowerShell and cmd.exe alike. (Hints only the built-in
// renderer can show stay `npx`: it is macOS only.)

/** The npx command that runs a package's bin with these arguments: `npx.cmd …` on Windows, `npx …` elsewhere. */
export const npxHint = (rest: string, platform: NodeJS.Platform = process.platform): string => `${platform === "win32" ? "npx.cmd" : "npx"} ${rest}`;
