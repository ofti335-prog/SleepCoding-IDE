leepCoding IDE

A lightweight, Windows-focused Electron IDE inspired by VS Code and JetBrains IDEs.

Version: 1.7.1 · License: MIT · Recommended: Windows 10/11 + Node.js 20 LTS

Repository: https://github.com/ofti335-prog/SleepCoding-IDE

✨ Features

Monaco Editor with IntelliSense and multi-file tabs

1/2/3 editor groups + draggable tabs

Command Palette and global project search

Integrated Terminal (node-pty)

Node.js and Python run support

Node.js Debugger with breakpoints, pause/continue, stepping and evaluation

Git integration and GitHub workflow helpers

Markdown preview and HTML/CSS live preview

SleepCoding Dark, Midnight and Light themes

P2P collaboration and chat

Adaptive JetBrains/VS Code-style UI

PyCharm-inspired startup splash with boot progress

Windows installer (NSIS) and portable build

🚀 Quick Start (Windows)

1. Install requirements

Windows 10/11 x64

Node.js 20 LTS

Git

Visual Studio 2022 Build Tools with Desktop development with C++ (needed for native modules such as node-pty)

2. Clone the repository

git clone https://github.com/ofti335-prog/SleepCoding-IDE.git
cd SleepCoding-IDE

Or download the ZIP from GitHub and open a terminal in the extracted folder.

3. Allow Electron and node-pty install scripts

Some npm configurations block lifecycle scripts. SleepCoding needs the install scripts of Electron and node-pty.

npm install-scripts approve electron node-pty

If npm reports that scripts are still blocked:

npm config set ignore-scripts false

4. Install dependencies

npm install

For a clean checkout with package-lock.json, you can use:

npm ci

5. Start SleepCoding

npm start

The startup splash will wait for the main renderer services and Monaco to initialize before showing the IDE.

6. Check Electron (optional)

npx electron --version

For this release, Electron 30.x is expected.

🛠️ Build setup.exe

Build on Windows from a clean dependency tree:

Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
npm install
npm run build:win

Or, with a valid lockfile:

Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
npm ci
npm run build:win

Artifacts are created in dist/:

SleepCoding-Setup-1.7.1.exe
SleepCoding-Portable-1.7.1.exe

⌨️ Basic Usage

Open Folder — choose a workspace directory from the Explorer.

Open a file — click it in Explorer; it opens as an editor tab.

Command Palette — use the command palette to search IDE actions.

Split editor — Ctrl+Shift+2 for two groups, Ctrl+Shift+3 for three groups.

Terminal — open the integrated terminal and run normal shell commands.

Run Node/Python — open a supported source file and use the Run action.

Debug Node — start a Node debug session, set breakpoints by clicking the editor gutter, then use Continue/Step controls.

Git — open a Git repository as your project and use the Git panel for status, staging, commit, branch, pull and push workflows.

Markdown — open a .md file and use Markdown Preview.

HTML/CSS — use the local preview/live-server workflow for web projects.

Themes — switch between SleepCoding Dark, Midnight and Light in settings/appearance controls.

🌿 Git Workflow

Create or open a Git repository:

git clone https://github.com/USERNAME/REPOSITORY.git
cd REPOSITORY

Then open that folder in SleepCoding.

Useful Git commands if you prefer the terminal:

git status
git add .
git commit -m "Your message"
git push

Git credentials are handled by Git/your configured GitHub authentication, not by SleepCoding itself.

📦 Useful npm Commands

npm start          Run the IDE
npm run server     Start the collaboration/server component
npm run rebuild    Rebuild native node-pty dependencies
npm run icon       Generate/convert application icons
npm run build:win  Build the Windows installer + portable app
npm run dist       Alias for the Windows build

⚠️ Troubleshooting

Electron failed to install correctly

Run:

npm install-scripts approve electron node-pty
npm config set ignore-scripts false
Remove-Item -Recurse -Force node_modules
npm install
npm start

node-pty build errors

Install Visual Studio 2022 Build Tools with Desktop development with C++, then reinstall dependencies.

monaco is not defined

Use the current 1.7.1 build. Monaco is initialized as part of the startup pipeline before editor enhancement features are created.

npm audit reports vulnerabilities

Do not run npm audit fix --force during initial setup. It can introduce breaking dependency changes. Get the IDE running first and update dependencies deliberately.

npm blocks install scripts

Check:

npm config get ignore-scripts

If it returns true:

npm config set ignore-scripts false

Then reinstall dependencies.

📁 Project Structure

SleepCoding-IDE/
├─ main.js          Electron main process
├─ preload.js       Secure renderer bridge
├─ server.js        Local/collaboration server
├─ src/             UI, editor and IDE code
├─ scripts/         Build and native-module helpers
├─ build/           Build resources and icon files
├─ package.json     Dependencies and build configuration
└─ README.md        This file

📌 Notes

Windows is the primary supported platform for this release. Do not copy node_modules from another operating system; native dependencies such as node-pty must be installed/built on the target machine.

For bug reports, include your Windows version, Node.js version, npm version, the command you ran, and the full terminal/DevTools error.

License

MIT — see the project license for details.
