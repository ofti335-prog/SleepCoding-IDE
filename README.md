# 🌙 SleepCoding IDE

> A modern, lightweight desktop IDE for Windows built with Electron, Monaco Editor, Node.js and more.

![SleepCoding](https://img.shields.io/badge/SleepCoding-IDE-blue)
![Electron](https://img.shields.io/badge/Electron-30-47848F)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6)

GitHub: https://github.com/ofti335-prog/SleepCoding-IDE

---

## ✨ Features

- 🧠 Monaco Editor + IntelliSense
- 🔥 Command Palette
- 🔎 Global project search
- 🐞 Node.js Debugger
- ▶️ Run / Stop / Restart
- 🖥️ Integrated Terminal
- 🌿 Git integration
- 📑 Split Editor
- 🔍 Minimap / Outline / Breadcrumbs
- 💾 Autosave
- ↩️ Snapshots / file recovery
- 🎨 Dark / Midnight / Light themes
- 📝 Markdown Preview
- 🌐 HTML/CSS Live Preview
- 🐍 Python support
- 🟨 Node.js support
- 📦 npm / pip tools
- 🧩 Extension-ready architecture
- 🔗 P2P collaboration
- 👥 Remote cursors
- 💬 Collaborative chat
- 🚀 Modern startup screen with real loading progress

---

# 🚀 Installation

## Requirements

Recommended:

- Windows 10 / 11
- Node.js 20 LTS
- npm
- Git
- Visual Studio Build Tools 2022

For `node-pty`, install:

**Desktop development with C++**

from Visual Studio Installer.

Check your environment:

```powershell
node --version
npm --version
git --version
📥 Clone from GitHub

Open PowerShell or Command Prompt:

git clone https://github.com/ofti335-prog/SleepCoding-IDE.git
cd SleepCoding-IDE

Check the project files:

dir

You should see files such as:

package.json
package-lock.json
main.js
preload.js
app.js
index.html
ide.css
📦 Install Dependencies

First allow installation scripts required by Electron and node-pty:

npm install-scripts approve electron node-pty

Make sure npm scripts are enabled:

npm config set ignore-scripts false

Install dependencies:

npm install

Check Electron:

npx electron --version

Expected:

v30.x.x
▶️ Start SleepCoding

Run:

npm start

SleepCoding will start with its startup screen and load the IDE after the required components are ready.

🧹 If Something Goes Wrong

If Electron or node-pty was installed incorrectly:

PowerShell
Remove-Item -Recurse -Force node_modules
npm install

Then:

npm start

For native module problems:

npm run rebuild

Do not use npm audit fix --force unless you know which packages will be changed.

🖥️ How to Use
Open a Project

Use:

File → Open Folder

Select your project directory.

Example:

MyProject/
├── src/
│   ├── app.js
│   └── styles.css
├── package.json
└── README.md

Click files in Explorer to open them.

✍️ Code Editor

SleepCoding uses Monaco Editor.

Included:

Syntax highlighting
IntelliSense
Autocomplete
Code folding
Minimap
Breadcrumbs
Outline
Multiple tabs
Undo / Redo
Autosave

Save:

Ctrl + S

Command Palette:

Ctrl + Shift + P
📑 Split Editor

Create another editor group:

Ctrl + \

You can work with multiple files at the same time and move tabs between editor groups.

🔎 Search

Use the Search panel to search through the whole project.

Search results can open the matching file and line directly.

🖥️ Terminal

Use the integrated terminal for normal development commands:

npm install
npm run dev
npm run build
git status
python main.py
node app.js
▶️ Run / Stop / Restart

SleepCoding can manage running processes.

Typical commands:

Run
Stop
Restart

Node.js:

node app.js

Python:

python main.py

npm project:

npm run dev
🐞 Node.js Debugger

SleepCoding includes a Node.js debugger using the Node Inspector protocol.

Basic workflow:

Open a .js file.
Click next to the line number to create a breakpoint.
Open the Debug panel.
Start Debug.
Wait until execution stops at the breakpoint.

Debugger controls:

Continue
Pause
Step Over
Step Into
Step Out
Breakpoints
Expression evaluation
Call stack
🌿 Git

SleepCoding works with normal Git repositories.

Clone:

git clone https://github.com/username/project.git
cd project

Check changes:

git status

Stage:

git add .

Commit:

git commit -m "Update project"

Push:

git push

Pull:

git pull

You can also use the integrated terminal and Git interface.

🐍 Python

Check Python:

python --version

Install dependencies:

pip install -r requirements.txt

Run:

python main.py
🟨 Node.js

Create a project:

npm init -y

Install dependencies:

npm install

Run:

node app.js

or:

npm run dev
📝 Markdown

Open a .md file such as:

README.md

Use Markdown Preview to see the rendered document.

🌐 HTML / CSS

Typical web project:

Website/
├── index.html
├── style.css
└── script.js

Use the Live Preview functionality to test your website while developing.

🎨 Themes

Available themes:

SleepCoding Dark
Midnight
Light

Change them from the IDE settings.

📦 Package Manager

Node.js:

npm install package-name
npm uninstall package-name
npm run dev
npm run build

Python:

pip install package-name
🔗 Collaboration

SleepCoding includes:

P2P collaboration
Shared editing
Remote cursors
Remote selections
Collaborative chat

Network configuration may affect P2P connections.

🛠️ Build Windows Installer

After testing the development version:

npm run build:win

Output:

dist/

Typical files:

SleepCoding-Setup-1.7.1.exe
SleepCoding-Portable-1.7.1.exe

Use the Setup version for a normal installation.

⚙️ Useful Commands
npm install
npm start
npm run rebuild
npm run build:win
npx electron --version
npm audit
⚠️ Troubleshooting
Electron failed to install correctly

Run:

npm config set ignore-scripts false
npm install-scripts approve electron node-pty

Then:

Remove-Item -Recurse -Force node_modules
npm install
node-pty build error

Install:

Visual Studio Build Tools 2022 → Desktop development with C++

Then:

npm run rebuild
monaco is not defined

Make sure you are using the latest project version and start the IDE with:

npm start

The startup system waits for Monaco before initializing editor features.

📁 Project Structure
SleepCoding-IDE/
├── main.js
├── preload.js
├── app.js
├── server.js
├── index.html
├── ide.css
├── package.json
├── package-lock.json
├── assets/
└── dist/
🗺️ Roadmap

Future improvements include:

Variables / Locals / Watch debugger panels
Conditional breakpoints
Advanced debugging UI
Better project indexing
More language support
Improved extensions
Better Git visualisation
Improved collaboration
Performance improvements for large projects
💙 SleepCoding

SleepCoding is a modern, lightweight IDE focused on a clean interface, fast development workflow and useful developer tools.

⭐ Star the repository if you like the project.

GitHub:
https://github.com/ofti335-prog/SleepCoding-IDE
