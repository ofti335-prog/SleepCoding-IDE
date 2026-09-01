# 🌙 SleepCoding IDE

> A modern, lightweight desktop IDE for Windows built with Electron and Monaco Editor.

## ✨ Features

- 🧠 Monaco Editor + IntelliSense
- 🔥 Command Palette
- 🔎 Global Search
- 🐞 Node.js Debugger
- ▶️ Run / Stop / Restart
- 🖥️ Integrated Terminal
- 🌿 Git Integration
- 📑 Split Editor
- 🔍 Minimap / Outline / Breadcrumbs
- 💾 Autosave & File Recovery
- 🎨 Dark / Midnight / Light Themes
- 📝 Markdown Preview
- 🌐 HTML/CSS Live Preview
- 🐍 Python
- 🟨 Node.js
- 📦 npm / pip tools
- 🔗 P2P Collaboration
- 👥 Remote Cursors
- 💬 Collaborative Chat
- 🚀 Modern Startup Screen

---

# 🚀 Installation

## Requirements

- Windows 10 / 11
- Node.js 20 LTS
- npm
- Git
- Visual Studio Build Tools 2022

For `node-pty`, install:

**Desktop development with C++**

Check your installation:

```powershell
node --version
npm --version
git --version
📥 Clone the Repository
git clone https://github.com/ofti335-prog/SleepCoding-IDE.git
cd SleepCoding-IDE
📦 Install Dependencies

Allow Electron and node-pty install scripts:

npm install-scripts approve electron node-pty

Enable npm scripts:

npm config set ignore-scripts false

Install dependencies:

npm install

Check Electron:

npx electron --version
▶️ Run SleepCoding
npm start

SleepCoding will open its startup screen and initialize the IDE.

🖥️ How to Use
Open a Project

Use:

File → Open Folder

Select your project folder.

Open a File

Click a file in Explorer.

Save
Ctrl + S
Command Palette
Ctrl + Shift + P
Split Editor
Ctrl + \
Search

Open the Search panel to search through the entire project.

Terminal

Use the integrated terminal for commands such as:

npm install
npm run dev
git status
python main.py
node app.js
▶️ Run & Debug
Node.js
node app.js

or:

npm run dev
Python
python main.py
Debugger
Open a JavaScript file.
Click next to a line number to create a breakpoint.
Open the Debug panel.
Start debugging.
Use Continue, Pause, Step Over, Step Into and Step Out.
🌿 Git

Clone a repository:

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
🛠️ Build Windows Installer

After testing the development version:

npm run build:win

Output:

dist/

You should get the Windows installer and portable build.

⚠️ Troubleshooting
Electron failed to install correctly
npm config set ignore-scripts false
npm install-scripts approve electron node-pty

Then reinstall:

Remove-Item -Recurse -Force node_modules
npm install
node-pty build error

Install:

Visual Studio Build Tools 2022 → Desktop development with C++

Then:

npm run rebuild
Do not run blindly
npm audit fix --force

It may introduce breaking dependency changes.

📁 Project Structure
SleepCoding-IDE/
├── build/
├── scripts/
├── src/
├── main.js
├── preload.js
├── server.js
├── package.json
├── README.md
└── BUILD-WINDOWS.md
💙 SleepCoding

SleepCoding is an open-source Windows-focused IDE designed to provide a fast and comfortable development environment with modern editor, terminal, Git, debugging and collaboration features.

⭐ Star the repository if you like the project.

GitHub:

https://github.com/ofti335-prog/SleepCoding-IDE
