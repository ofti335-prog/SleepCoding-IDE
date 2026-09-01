# Сборка SleepCoding в Windows

## Требования
- Windows 10/11 x64
- Node.js 20 LTS или новее (рекомендуется Node 20/22 LTS)
- Visual Studio 2022 Build Tools с workload **Desktop development with C++**
- Git (если нужен Git внутри IDE)

## Чистая сборка
Из корня проекта:

```powershell
Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
npm ci
npm run build:win
```

Готовые файлы появятся в `dist/`:
- `SleepCoding-Setup-1.5.0.exe` — установщик NSIS
- `SleepCoding-Portable-1.5.0.exe` — portable-версия

## Почему раньше ломалось
В архиве были `node_modules`, установленные в другой ОС. Их нельзя переносить между Windows/Linux/macOS: native-модуль `node-pty` и npm launcher-файлы зависят от платформы. Поэтому сборку нужно начинать с `npm ci` на самой Windows-машине.

Скрипт `build:win` дополнительно:
1. генерирует `build/icon.png` и `build/icon.ico`;
2. исправляет известную проблему распаковки `winCodeSign` без прав на создание symlink;
3. пересобирает `node-pty` под используемую версию Electron;
4. запускает `electron-builder --win`.


## SleepCoding 1.7

New IDE layer: Node Inspector debugging (breakpoints, continue, pause, step over/into/out, evaluate), 2/3 editor groups, draggable tabs between groups, debugger panel, and JetBrains/VS Code-inspired editor ergonomics.

For a clean Windows install, use Node.js 20 LTS, then `npm install` and `npm start`. Build with `npm run build:win`.
