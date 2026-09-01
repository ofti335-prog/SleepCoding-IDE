SleepCoding IDE

SleepCoding is a Windows-focused Electron IDE designed to combine the familiar workflow of modern editors such as VS Code and JetBrains IDEs with a lightweight, adaptive interface and built-in collaboration tools.

Current release: 1.7.1

License: MIT

Recommended runtime: Node.js 20 LTS on Windows

Highlights

SleepCoding currently combines the following capabilities in one desktop application:

Monaco Editor-based source editing

Multi-file tabs and split editor groups (2 or 3 groups)

Drag-and-drop tabs between editor groups

Command Palette and keyboard-driven workflows

Project Explorer and workspace file operations

Global project search with line-oriented results

Monaco IntelliSense features such as suggestions, parameter hints, folding and sticky scroll

Integrated terminal with node-pty on supported platforms

Node.js and Python run workflows

Node.js debugging through the Node Inspector / Chrome DevTools Protocol

Breakpoints, continue, pause and stepping controls

Debug expression evaluation

Git status, staging, commit, branch, pull, push and GitHub publishing helpers

Markdown preview

Local HTML/CSS preview / live server support

Package/workspace helpers for Node.js and Python projects

Multiple visual themes: SleepCoding Dark, Midnight and Light

P2P collaboration support powered by PeerJS

Remote collaboration UI and chat support

Adaptive JetBrains/VS Code-inspired workbench styling

PyCharm-inspired startup splash screen with real boot progress

Windows installer (NSIS) and portable builds

Screens and UX

The IDE is designed around a workbench layout rather than separate utility windows. The main interface is intended to stay compact while providing room for code, terminals, debugging and project navigation.

Startup splash

Version 1.7.1 introduces an adaptive startup screen inspired by modern JetBrains IDEs. The splash is not only visual: the Electron main process reports boot stages such as renderer startup, workspace services and Monaco initialization.

The main workbench stays hidden until required renderer/editor services are ready. A failsafe recovery path prevents an endless splash if startup takes too long or a renderer service fails.

Editor groups

The editor can be arranged as one, two or three groups. Typical shortcuts include:

Ctrl+Shift+2 — switch to two editor groups

Ctrl+Shift+3 — switch to three editor groups

Ctrl+\\ — split the current editor when supported by the current keymap

Tabs can be dragged between groups to reorganize a workspace.

Requirements

Windows

Recommended environment:

Windows 10 x64 or Windows 11 x64

Node.js 20 LTS

npm (bundled with Node.js)

Git, if you want Git integration

Visual Studio 2022 Build Tools with Desktop development with C++ for native module builds, especially node-pty

Node.js 22 LTS may also work, but Node.js 20 LTS is the recommended baseline for this release because the project includes native dependencies and an Electron 30 runtime.

macOS / Linux

The application contains platform-aware process and terminal code, but the current packaging workflow is focused on Windows. Windows is the primary supported development and distribution target for this release.

Installation from source

Clone or extract the project and open a terminal in its root directory.

1. Check Node.js

node --version
npm --version

For the recommended setup, Node should report a 20.x LTS release.

2. Install dependencies

For a clean checkout:

npm ci

For a normal development cycle where the lock file is intentionally allowed to change:

npm install

3. Start SleepCoding

npm start

The Electron application should open after the startup splash completes.

Important: npm install scripts

SleepCoding uses packages with native or post-install setup steps, including Electron and node-pty.

If npm reports that package install scripts were blocked, Electron may fail to install its binary and you can see an error such as:

Electron failed to install correctly, please delete node_modules and try installing again

On npm versions that require explicit approval, approve the package scripts and reinstall the dependencies. For example:

npm install-scripts approve electron node-pty

Then perform a clean reinstall:

rmdir /s /q node_modules
npm install

If your npm setup exposes script blocking through configuration, also check:

npm config get ignore-scripts

The value should not be true for a normal Electron development install.

Clean Windows build

Before creating a Windows installer, it is strongly recommended to build from a clean dependency tree on Windows.

PowerShell:

Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
npm ci
npm run build:win

Command Prompt:

rmdir /s /q node_modules
del /q package-lock.json
npm install
npm run build:win

Note: Do not delete package-lock.json unless you intentionally want to regenerate the lock file. The preferred reproducible workflow is npm ci with the committed lock file.

The recommended clean workflow is therefore:

Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
npm ci
npm run build:win

Build outputs

The build is configured to generate both an installer and a portable executable in dist/:

dist/
├── SleepCoding-Setup-1.7.1.exe
└── SleepCoding-Portable-1.7.1.exe

The exact artifact names are generated from the current package version.

What npm run build:win does

The Windows build script performs these steps:

Generates the application icon assets.

Applies the Windows winCodeSign compatibility workaround used by the project.

Rebuilds node-pty for the Electron environment.

Runs electron-builder --win.

The relevant package script is:

"build:win": "npm run icon && node scripts/fix-wincodesign.js && npm run rebuild && electron-builder --win"

Why node_modules must not be copied between operating systems

Do not ship or reuse a node_modules directory copied from Linux, macOS, WSL or another Windows machine.

SleepCoding depends on native/platform-specific components. In particular, node-pty needs to be built for the target operating system and Electron ABI. Electron also installs a platform-specific runtime binary.

For a Windows release, install the dependencies directly on Windows and rebuild them there.

Running and debugging code

Node.js

Node.js projects can be launched through the IDE's run workflow.

For debugging, SleepCoding uses Node Inspector and starts Node with an inspector endpoint. The debugger layer communicates with the process through the Chrome DevTools Protocol over WebSocket.

Current debugging operations include:

Start / stop process

Continue

Pause

Step over

Step into

Step out

Line breakpoints in Monaco

Call-frame stack updates when paused

Expression evaluation

Current-source-line highlighting

Breakpoints are set from the Monaco glyph margin (the area to the left of the line numbers).

Python

Python execution uses the platform interpreter available on PATH.

Windows candidates include:

python
py

On Unix-like systems the launcher checks common python3 / python commands.

Make sure Python is installed and available in the terminal environment used to start SleepCoding.

Terminal

SleepCoding uses node-pty when available to provide a real pseudo-terminal. On Windows the default shell is PowerShell.

The terminal layer supports:

Interactive shell input/output

Resize handling

Multiple PTY instances

Terminal process cleanup when the application exits

If native PTY support is unavailable, the main process contains a legacy process-based terminal fallback for development scenarios.

Git integration

Git functionality is implemented in the Electron main process and exposed to the renderer through a restricted preload API.

Current helpers include:

Repository detection

Status parsing

Stage / unstage

Stage all

Discard changes

Commit

Branch listing and checkout

Pull

Push

Repository initialization

GitHub publishing helpers

Showing file content from HEAD

Git must be installed and available as git on PATH.

Check with:

git --version

Before committing from the IDE, configure an identity if your repository does not already have one:

git config --global user.name "Your Name"
git config --global user.email "you@example.com"

Global search

The workspace search engine can recursively scan project files while skipping common generated or VCS directories such as:

node_modules

.git

.hg

.svn

dist

build

out

Search supports normal text matching and regular expressions with case-sensitivity controls.

Search results include the matching file and line information so a result can be opened directly in the editor.

Markdown and web preview

SleepCoding includes preview workflows for documentation and web projects.

Markdown

Markdown files can be rendered in the preview area for quick documentation review.

HTML / CSS

The local preview server can serve a workspace for browser-based testing.

The preview service is implemented with the project's local server layer and can be started/stopped from the IDE workflows.

Package manager helpers

SleepCoding detects common project manifests such as:

package.json

requirements.txt

This makes it possible to expose package/install/update actions without forcing the user to leave the IDE for every dependency workflow.

Themes

The workbench includes three built-in visual modes:

SleepCoding Dark — default dark workspace theme

Midnight — deeper contrast and darker surfaces

Light — light workspace mode

The UI is designed to adapt to smaller windows and different display scales while keeping editor space prioritized.

Extensions / future plugin model

SleepCoding contains the foundation for a local extension/manifest layer. The current architecture intentionally avoids blindly executing arbitrary third-party renderer code.

The goal is to evolve this into a proper extension system with:

Extension manifests

Commands

Editor integrations

Language/tool integrations

Theme packages

Debug adapters

For now, the safest approach is to treat the extension layer as experimental.

Collaboration

SleepCoding contains P2P collaboration support based on PeerJS/WebRTC-style peer connections.

The collaboration layer is intended for:

Shared sessions

Remote editor presence

Collaboration chat

Future remote cursor/selection synchronization

Because peer-to-peer networking depends on network conditions and signaling infrastructure, collaboration behavior can vary between local networks, NAT environments and restricted corporate networks.

Architecture

At a high level, SleepCoding is split into three major layers.

Electron Main Process
│
├── Window lifecycle
├── Startup splash / boot progress
├── Filesystem access
├── PTY / terminal processes
├── Run & debug processes
├── Node Inspector / CDP bridge
├── Git integration
└── Local preview server

Preload Layer
│
└── Restricted IPC API exposed to the renderer

Renderer / UI
│
├── Monaco editor
├── Explorer
├── Command Palette
├── Search
├── Editor groups
├── Debug UI
├── Terminal UI
├── Git UI
├── Preview UI
└── Collaboration UI

Electron security model

The current BrowserWindow configuration uses:

contextIsolation: true

nodeIntegration: false

Renderer features communicate with privileged Electron APIs through the preload bridge rather than directly accessing Node.js APIs.

There is also a current Electron security warning related to Content Security Policy configuration during development. This warning does not cause the monaco is not defined startup failure, but a stricter CSP should be added before production distribution to further harden the renderer.

Startup pipeline

The 1.7.1 boot process is intentionally staged to avoid race conditions between the renderer and Monaco.

Conceptually:

Electron startup
      ↓
Adaptive splash
      ↓
Main BrowserWindow preparation
      ↓
Renderer boot
      ↓
Monaco loading
      ↓
IDE enhancements
      ↓
Workspace services
      ↓
Ready

The main workbench is shown only after the required editor/IDE initialization path has completed.

This design prevents errors such as:

ReferenceError: monaco is not defined

which can occur if UI enhancement code attempts to create Monaco-dependent editor groups before the Monaco loader has completed.

Project structure

SleepCoding/
├── build/
│   ├── icon.ico
│   └── icon.png
├── scripts/
│   ├── convert-icon.js
│   ├── fix-wincodesign.js
│   ├── make-icon.js
│   ├── patch-pty.js
│   └── rebuild-pty.js
├── src/
│   ├── index.html
│   └── splash.html
├── main.js
├── preload.js
├── server.js
├── package.json
├── package-lock.json
├── BUILD-WINDOWS.md
├── IMPROVEMENTS.md
└── README.md

NPM scripts

Command

Purpose

npm start

Start the Electron IDE in development mode

npm server

Start the local Node/Express server directly

npm rebuild

Rebuild native PTY dependencies for Electron

npm icon

Generate/convert application icons

npm dist

Alias for the Windows distribution build

npm run build:win

Build NSIS installer + portable Windows executable

Troubleshooting

Electron failed to install correctly

Typical cause: Electron's post-install script did not run.

Try:

rmdir /s /q node_modules
npm install-scripts approve electron node-pty
npm install
npm start

If the problem persists, check your npm script policy:

npm config get ignore-scripts

monaco is not defined

This indicates that Monaco-dependent UI code executed before Monaco finished loading.

Version 1.7.1 adds a staged boot pipeline specifically to prevent this race. Make sure you are running the 1.7.1 source tree and reinstall dependencies after switching versions:

rmdir /s /q node_modules
npm ci
npm start

node-pty build errors

Install Visual Studio 2022 Build Tools with:

Desktop development with C++

Windows SDK

MSVC build tools

Then run:

npm run rebuild

Git not detected

Verify:

git --version

If the command is not found, install Git for Windows and restart the terminal / IDE so the updated PATH is loaded.

Python does not run

Verify one of these commands works in the same environment:

python --version
py --version

Windows installer build fails with native dependencies

Use a clean Windows install of dependencies. Do not reuse a node_modules directory copied from another OS or another Electron major version.

Recommended:

Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
npm ci
npm run build:win

Development workflow

A recommended development loop is:

Make a small change.

Run npm start.

Check DevTools for renderer errors if the UI does not initialize.

Test editor, terminal, filesystem and Git behavior when your change touches those areas.

Run a clean Windows build before releasing.

Useful version information:

node --version
npm --version
git --version

Inside the application, the Electron/Node/Chrome runtime versions are also available through the app version API.

Performance notes

Large workspaces can be expensive for any browser-based IDE. SleepCoding already avoids scanning common dependency/VCS directories and configures Monaco for a more IDE-like editing experience.

For better performance on large repositories:

keep node_modules and generated build directories excluded from scans;

avoid opening hundreds of large files at once;

use a 2-group or 3-group layout only when needed;

keep live preview disabled for workspaces that do not need it;

use a modern Windows machine with sufficient RAM for large JavaScript/TypeScript repositories.

Security notes

SleepCoding can execute local commands and interact with the filesystem because it is an IDE. Treat workspace code as executable code and only open projects you trust.

GitHub publishing helpers may handle repository credentials/tokens. Keep tokens private and prefer environment/credential-manager based authentication for production workflows.

Before shipping a production build, consider adding a strict renderer Content Security Policy and reviewing every IPC handler for path/command validation.

Release checklist

Before publishing a Windows release:

node --version
npm --version
npm ci
npm start
npm run build:win

Then verify:

installer launches correctly;

portable build launches correctly;

Monaco editor opens a real file;

terminal starts;

Node run works;

Node debug session can attach;

breakpoints work;

Git features work in a Git repository;

Markdown / HTML preview works;

the application starts through the splash without renderer errors.

Roadmap

The architecture is intended to grow toward a more complete IDE experience. High-value future areas include:

richer Variables / Locals / Watch panels for the debugger;

conditional and hit-count breakpoints;

a Debug Console;

source maps and better TypeScript debugging;

persistent undo/redo history across sessions;

stronger language-server integrations;

a more complete extension API;

deeper collaborative cursor/selection synchronization;

extension-host isolation;

stricter production CSP and IPC hardening;

automatic update delivery.

License

SleepCoding is released under the MIT License.

See package.json for the project metadata and version information.
