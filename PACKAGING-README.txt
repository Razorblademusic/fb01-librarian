FB-01 Librarian v0.2 Windows packaging source

This adds a C# Windows GUI launcher (no command console) and an Inno Setup installer.
The original v0.1 HTML/JS, bank parser, PowerShell and CMD launchers are unchanged.

BUILD: Create a new GitHub repository, upload the complete ZIP contents (including
.github/workflows), then run Actions > Build FB-01 Librarian Windows installer > Run workflow.
Download the FB01-Librarian-v0.2-Windows artifact and run the Setup executable.

RUNTIME: Requires Microsoft Edge. The app opens Edge in standalone app mode, and
serves only the three original application files from 127.0.0.1 on an ephemeral port.
The launcher exits when its dedicated Edge process exits. A temporary Edge profile
is used; MIDI/SysEx permission may need to be granted on each launch.

TEST STATUS: Source packaging prepared and original files preserved. No Windows
compilation, installation or live FB-01 MIDI/SysEx testing has been performed here.
