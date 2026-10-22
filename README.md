# claude-mods

Mods for Claude Code.

## session-band

A band above the prompt that shows, at a glance:

- the project, branch, session cost and how long the prompt cache stays warm;
- context fill against the auto-compact point, with a segmented buffer bar;
- the 5-hour and 7-day usage limits with their reset times (account-wide: a session that has no reading yet shows the last one any session saw, until that window resets);
- **REC**: masks e-mails, IPs, tokens, passwords and your login on screen while you record or share it (`/rec on|off|add <word>|remove <word>|list`);
- **New chat**: asks Claude to write a handoff note to `~/.claude/handoffs/` and puts the prompt for the next conversation on the clipboard;
- a radio strip for [cliamp](https://github.com/bjarneo/cliamp): play/pause, previous, next, volume.

### Skins

Three skins, switched live with the **◐** button in the band (hotkey `s`) or `/skin [neon|hacker|pro|list]`. The choice is remembered between sessions.

**neon**

![neon skin](screenshots/neon.webp)

**hacker**

![hacker skin](screenshots/hacker.webp)

**pro**

![pro skin](screenshots/pro.webp)

### Install

At the prompt of a terminal session:

```
/plugin install session-band --marketplace przemokam/claude-mods
```

Answer `y` to add the marketplace, then choose a scope.

From a shell:

```bash
claude plugin install session-band --marketplace przemokam/claude-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `przemokam/claude-mods`, then Add plugin.

### Radio: installing cliamp

The radio strip drives [cliamp](https://github.com/bjarneo/cliamp) (MIT), a terminal music player with about 58,000 online radio stations. Without cliamp the strip stays offline and everything else in the band works.

**macOS**

```bash
brew install bjarneo/cliamp/cliamp
```

**Windows** (PowerShell, no admin rights needed)

```powershell
$dir = "$env:LOCALAPPDATA\Programs\cliamp"
Invoke-WebRequest https://github.com/bjarneo/cliamp/releases/latest/download/cliamp-windows-amd64.zip -OutFile "$env:TEMP\cliamp.zip"
Expand-Archive "$env:TEMP\cliamp.zip" -DestinationPath $dir -Force
[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ";$dir\cliamp-windows-amd64", 'User')
```

The zip holds `cliamp.exe` and the codec DLLs it needs. Open a new terminal so the new `Path` applies, then run `cliamp` and press `R` to browse radio stations. cliamp keeps its settings in `%APPDATA%\cliamp`.

Optional, for YouTube, SoundCloud and AAC/Opus streams (both must be on `Path`):

```powershell
winget install Gyan.FFmpeg
winget install yt-dlp.yt-dlp
```

**Linux**: see [cliamp's install guide](https://github.com/bjarneo/cliamp#install).

The band finds cliamp by itself: on macOS and Linux at `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin` or `~/go/bin`, on Windows in the folder above or `~\go\bin`, and otherwise on `Path`. If you install cliamp while Claude is open, just press ▶: the band looks for it again.

> **Windows status.** The Windows path (finding `cliamp.exe`, starting it hidden with PowerShell `Start-Process`, the home folder from `%USERPROFILE%`) is covered by tests that simulate Windows, but has not yet been run on a real Windows machine. If something does not work, please open an issue.

### Notes

- The context gauge counts against 500K tokens (`COMPACT_AT` in `hooks/register.tsx`); keep it in step with `autoCompactWindow` in your `~/.claude/settings.json`.
- Tests: `claude plugin test session-band`.

## License

MIT
