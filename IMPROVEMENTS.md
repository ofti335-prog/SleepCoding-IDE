# SleepCoding 1.7.0

## Editor
- 2/3 independent editor groups with lazy Monaco instances.
- Drag tabs into an editor group.
- Split shortcuts: Ctrl+Shift+2 / Ctrl+Shift+3.
- Monaco ergonomics tuned for suggestions, parameter hints, sticky scroll and large projects.

## Debugger
- Node `--inspect-brk=0` launches are connected automatically via Chrome DevTools Protocol over WebSocket.
- Debug panel: Continue, Pause, Step Over, Step Into, Step Out, Evaluate.
- Click the Monaco glyph margin to set/remove line breakpoints while debugging.
- Paused call-frame stack is shown and the current source line is highlighted.

## UI
- More compact IDE chrome and run/debug/split controls.
- SleepCoding Dark, Midnight and Light themes.

## Compatibility
- Existing Git, terminal, preview and P2P collaboration are kept intact.
- No `node_modules` is shipped in the archive.


## 1.7.1 boot pipeline
- PyCharm-inspired adaptive splash with real renderer boot progress.
- Main window stays hidden until Monaco + IDE enhancements are initialized.
- Monaco-dependent enhancement UI is no longer created before Monaco exists.
- Boot timeout falls back to recovery mode instead of hanging forever.
