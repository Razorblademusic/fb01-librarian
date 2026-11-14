#define AppName "FB-01 Librarian"
#define AppVersion "0.2.0"
[Setup]
AppId={{B69DF2B8-C27D-4A1A-BAF7-0DFAE8C54240}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={autopf}\FB-01 Librarian
DefaultGroupName={#AppName}
OutputDir=..\dist
OutputBaseFilename=FB01-Librarian-v0.2-Setup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
UninstallDisplayIcon={app}\FB01-Librarian.exe
[Files]
Source: "..\build\FB01-Librarian.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\app.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\bank.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.txt"; DestDir: "{app}"; Flags: ignoreversion
[Icons]
Name: "{group}\FB-01 Librarian"; Filename: "{app}\FB01-Librarian.exe"
Name: "{autodesktop}\FB-01 Librarian"; Filename: "{app}\FB01-Librarian.exe"; Tasks: desktopicon
[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"
[Run]
Filename: "{app}\FB01-Librarian.exe"; Description: "Launch FB-01 Librarian"; Flags: nowait postinstall skipifsilent
