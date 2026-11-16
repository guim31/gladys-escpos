# Gladys ESC/POS ticket printers

A [Gladys Assistant](https://gladysassistant.com) external integration that
prints from your scenes on **network thermal ticket printers** speaking
ESC/POS on the raw TCP port 9100: Epson TM-T20/T88, Xprinter, Munbyn, Rongta,
HOIN, and Star printers in their ESC/POS mode. The summary of the day, a
shopping list, a note for the family — local only, no cloud, no driver.

> **Developed without the hardware: feedback welcome.** The integration was
> tested against a simulated printer (a TCP server recording the bytes, then a
> renderer of the ESC/POS commands), not a real one.

## What it does

- **Print a ticket** scene action: text with scene variables (`\n` starts a
  new line), optional title (large, double height or bold), date and time,
  QR code, then the cut. Outputs the ticket count of the printer.
- One device per printer: reachable, paper running low, out of paper (from
  the real-time status `DLE EOT`, when the printer answers it), a status text
  and the number of tickets printed by Gladys. Checked once a minute.
- **Ticket not printed** scene trigger (printer unreachable, out of paper,
  cover open…), at most once per printer every 15 minutes.
- **Ticket printer** dashboard widget: tickets of the day and in total,
  status, buttons to print a note typed on the dashboard and a test ticket.
- **Print a test ticket** action: title, date, the accents of the four
  languages and a QR code, to choose the right code page.
- Accents: the text is converted to the printer code page (PC858 by default,
  PC850, WPC1252, PC437, or plain ASCII); what a table lacks is spelled as
  close as possible.

## Requirements

- Gladys Assistant **5.2.0** or later (widget form buttons).
- A thermal ticket printer on the network with a fixed IP address, ESC/POS
  on port 9100. USB and Bluetooth-only printers are not supported.

## Installation

In Gladys, open **Integrations → Install from GitHub**, enter
`https://github.com/guim31/gladys-escpos`, then fill the configuration (see
[the documentation](docs/en.md)): printer addresses, paper width, code page.
Add the printers in the **Discover** tab and print a test ticket.

## Limits

- Text and QR codes only: no images or logos.
- One configuration for every printer.
- When the printer reports its paper status, a ticket is refused while the
  paper is out; otherwise the printer keeps it until reloaded.
- No automatic discovery: ESC/POS printers do not announce themselves.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The ESC/POS commands are written by hand in `src/escpos/` (no dependency
besides the Gladys SDK). `test/fixtures/tickets/render.py` decodes recorded
jobs and renders them as PNG (Python, Pillow, qrcode). The tests run the integration against the SDK's fake
Gladys and fake printers on the loopback. See `CLAUDE.md` for the
architecture.

## Credits

- The command set follows the Epson ESC/POS reference; the code page tables
  were generated from the Python codecs `cp437`, `cp850`, `cp858` and
  `cp1252`.
- Home Assistant has no ESC/POS integration in its core: this one was written
  from scratch.

Not affiliated with Seiko Epson, Star Micronics or any printer maker. ESC/POS
is a trademark of Seiko Epson Corporation.

## License

[Apache-2.0](LICENSE)
