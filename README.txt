YAMAHA FB-01 LIBRARIAN 0.1
Portable preview for Windows 10

1. Extract the entire ZIP to a folder. Double-click Start-Librarian.cmd.
2. Use Microsoft Edge or Google Chrome. If a different browser opens,
   copy the local address from the launcher window into Edge or Chrome.
3. Keep the launcher window open while using the app. Save your work
   before closing the browser tab. Banks loaded in the app are held in
   memory for the session.

FIRST HARDWARE TEST
Connect the interface MIDI OUT to the FB-01 MIDI IN and the FB-01 MIDI
OUT to the interface MIDI IN. In the librarian choose Enable MIDI and
allow SysEx access. Select both interface ports and the system channel
shown by the FB-01. Leave Memory Protect on for this test. Choose
Bank 1 (RAM), click Request bank, then Save original .syx. Repeat for
Bank 2. Reopen the backups and confirm you can see all 48 voice slots.
Alternatively, choose Listen for panel dump and initiate a voice bank
dump from the FB-01 front panel.

EDIT A BANK
Open one or more .syx files or receive banks over MIDI. Use as working
bank makes an editable copy. Select a source voice and a working slot
to copy a voice between banks. Rename accepts up to seven printable
ASCII characters. Move up/down swaps two adjacent slots. Save .syx
exports the working bank. Save original .syx exports the selected
source bank message byte for byte.

WRITE TO HARDWARE
After backing up the destination, switch Memory Protect off on the FB-01,
select Bank 1 or Bank 2, and confirm Send working bank. The app waits for
the FB-01's acknowledgement. Request the bank back and check its
contents before relying on the transfer. Restore Memory Protect afterward.
If Windows reports that the MIDI port is busy, close other apps using it.

This preview was checked with synthetic bank data. Windows launcher
and live hardware transfers still need testing. It handles FB-01
48-voice bank dumps. CX5M conversion and editing synthesis parameters
are outside this release.

Protocol reference: Yamaha FB-01 Service Manual, MIDI Data Format.
https://www.synfo.nl/servicemanuals/Yamaha/YAMAHA_FB-01_SERVICE_MANUAL.pdf
