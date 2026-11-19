# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Network ESC/POS ticket printers (raw TCP port 9100): Epson TM, Xprinter,
  Munbyn, Rongta, HOIN, Star in ESC/POS mode. One device per printer, with
  reachability, paper running low, out of paper, a status text and the count
  of tickets printed, checked once a minute.
- **Print a ticket** scene action: a text with scene variables (`\n` for a
  new line), an optional title in three styles, the date, a QR code, then the
  cut. Nothing is sent when the printer reports no paper or an open cover.
- **Ticket not printed** scene trigger, at most once per printer every 15
  minutes.
- **Ticket printer** dashboard widget: tickets of the day, status, buttons
  to print a note typed on the dashboard and a test ticket.
- **Print a test ticket** action, with the accents of the four languages.
- Code pages PC858, PC850, WPC1252, PC437 or plain ASCII for the accents;
  58 mm and 80 mm paper; cutter or not.
- Texts in English, French, German and Spanish.
