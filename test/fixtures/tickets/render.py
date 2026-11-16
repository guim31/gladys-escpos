"""Independent ESC/POS decoder and renderer: bytes -> PNG (576 dots, 80 mm).
Decodes the text with the Python codec of the code page selected by ESC t,
and fails loudly on any byte sequence it does not know."""
import sys, qrcode
from PIL import Image, ImageDraw, ImageFont

CODECS = {0: 'cp437', 2: 'cp850', 16: 'cp1252', 19: 'cp858'}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
FONTB = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
CW, CH, WIDTH = 12, 24, 576

def render(data, out):
    i, codec, align, bold, size = 0, 'ascii', 0, False, (1, 1)
    rows, line, qr_data, report = [], [], None, []
    def flush():
        nonlocal line
        rows.append(('text', line, align)); line = []
    while i < len(data):
        b = data[i]
        if b == 0x1b:
            c = data[i + 1]
            if c == 0x40: i += 2; report.append('ESC @'); continue
            n = data[i + 2]
            if c == 0x52: report.append(f'ESC R {n}')
            elif c == 0x74: codec = CODECS[n]; report.append(f'ESC t {n} -> {codec}')
            elif c == 0x61: align = n
            elif c == 0x45: bold = bool(n)
            elif c == 0x64:
                if line: flush()
                rows.extend([('text', [], 0)] * n); report.append(f'ESC d {n}')
            else: raise ValueError(f'unknown ESC {c:#x} at {i}')
            i += 3; continue
        if b == 0x1d:
            c = data[i + 1]
            if c == 0x21: n = data[i + 2]; size = ((n >> 4) + 1, (n & 15) + 1); i += 3; continue
            if c == 0x56:
                m = data[i + 2]
                if line: flush()
                rows.append(('cut', m)); report.append(f'GS V {m:#x}')
                i += 4 if m in (0x41, 0x42) else 3; continue
            if c == 0x28 and data[i + 2] == 0x6b:
                pl, ph, cn, fn = data[i + 3], data[i + 4], data[i + 5], data[i + 6]
                ln = pl + ph * 256; params = data[i + 7:i + 5 + ln]
                if fn == 0x43: modsize = params[0]
                if fn == 0x50: qr_data = bytes(params[1:]).decode('utf8')
                if fn == 0x51:
                    if line: flush()
                    rows.append(('qr', qr_data, modsize, align)); report.append(f'QR {qr_data!r} module {modsize}')
                i += 5 + ln; continue
            raise ValueError(f'unknown GS {c:#x} at {i}')
        if b == 0x0a: flush(); i += 1; continue
        if b < 0x20 or b == 0x7f: raise ValueError(f'control byte {b:#x} at {i}')
        line.append((bytes([b]).decode(codec), bold, size)); i += 1
    if line: flush()
    # draw
    h = 40
    for r in rows:
        if r[0] == 'text': h += CH * max([s[1] for _, _, s in r[1]] or [1])
        elif r[0] == 'cut': h += 40
        else: h += 40 * r[2] + 20
    img = Image.new('RGB', (WIDTH + 40, h), 'white'); d = ImageDraw.Draw(img)
    y = 20
    for r in rows:
        if r[0] == 'text':
            chars = r[1]; lh = max([s[1] for _, _, s in chars] or [1])
            w = sum(CW * s[0] for _, _, s in chars)
            x = 20 + ((WIDTH - w) // 2 if r[2] == 1 else 0)
            for ch, bd, (sw, sh) in chars:
                f = ImageFont.truetype(FONTB if bd else FONT, 20)
                tmp = Image.new('L', (CW, CH), 0); ImageDraw.Draw(tmp).text((0, 1), ch, font=f, fill=255)
                tmp = tmp.resize((CW * sw, CH * sh))
                img.paste((0, 0, 0), (x, y + CH * (lh - sh)), tmp); x += CW * sw
            y += CH * lh
        elif r[0] == 'cut':
            for x in range(0, WIDTH + 40, 12): d.line((x, y + 20, x + 6, y + 20), fill=(200, 0, 0), width=2)
            d.text((WIDTH - 120, y + 2), 'partial cut', fill=(200, 0, 0)); y += 40
        else:
            q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=r[2], border=0)
            q.add_data(r[1]); q.make(fit=True); qi = q.make_image().convert('RGB')
            x = 20 + ((WIDTH - qi.width) // 2 if r[3] == 1 else 0)
            img.paste(qi, (x, y + 10)); y += qi.height + 20
    img = img.crop((0, 0, WIDTH + 40, y + 20))
    img.save(out)
    return report, rows

if __name__ == '__main__':
    for path in sys.argv[1:]:
        data = open(path, 'rb').read()
        report, rows = render(data, path.replace('.bin', '.png'))
        text = '\n'.join(''.join(c for c, _, _ in r[1]) for r in rows if r[0] == 'text')
        print(f'== {path}: {len(data)} bytes; ' + '; '.join(report))
        print(text)
