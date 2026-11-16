# ESC/POS-Bondrucker

Drucke aus deinen Szenen auf einem Thermo-Bondrucker im Netzwerk: die
Tagesübersicht, eine Einkaufsliste, eine Notiz für die Familie. Alles bleibt
in deinem lokalen Netzwerk.

> Ohne die Hardware entwickelt: Rückmeldungen sind willkommen. Die
> Integration wurde mit einem simulierten Drucker getestet, nicht mit einem
> echten.

## Was du bekommst

- Eine Szenenaktion **Beleg drucken**: ein Text mit Szenenvariablen,
  optional mit Titel (groß, doppelte Höhe oder fett), Datum und Uhrzeit,
  einem QR-Code, danach der Papierschnitt.
- Ein Gerät pro Drucker: **Erreichbar**, **Papier fast leer**, **Papier
  leer**, ein Text **Status** (bereit, Papier, Deckel offen, Fehler, nicht
  erreichbar) und die Anzahl der von Gladys **gedruckten Belege**. Der
  Drucker wird einmal pro Minute geprüft.
- Ein Szenenauslöser **Beleg nicht gedruckt**, um gewarnt zu werden, wenn
  eine Szene nicht drucken konnte.
- Ein Dashboard-Widget **Bondrucker** mit einem Knopf, um eine auf dem
  Dashboard getippte Notiz zu drucken.

## Bevor du anfängst

- Ein Thermo-Bondrucker, der im Netzwerk **ESC/POS** spricht (roher
  TCP-Port **9100**): Epson TM-T20/T88, Xprinter, Munbyn, Rongta, HOIN…
  Star-Drucker funktionieren in ihrem ESC/POS-Emulationsmodus. Drucker nur
  mit USB oder Bluetooth werden nicht unterstützt.
- Eine **feste IP-Adresse** für den Drucker (DHCP-Reservierung im Router).
  Die meisten Drucker drucken ihre Adresse, wenn du beim Einschalten die
  Vorschubtaste gedrückt hältst.
- Gladys 5.2 oder neuer.

## Konfiguration

1. Trage unter **Integrationen → ESC/POS-Bondrucker → Konfiguration** die
   **Druckeradressen** ein, durch Kommas getrennt: `192.168.1.50` oder
   `192.168.1.51:9101` für einen anderen Port.
2. Wähle die **Papierbreite**: 58 mm druckt 32 Zeichen pro Zeile, 80 mm
   druckt 48 (bei manchen Modellen 42: wähle das, wenn die Zeilen des
   Testbelegs abgeschnitten sind).
3. Lass **Papier nach jedem Beleg schneiden** an, wenn der Drucker einen
   Abschneider hat.
4. Speichere, öffne den Reiter **Erkennung** und füge die Drucker hinzu.
5. Klicke auf **Testbeleg drucken**: Jeder eingerichtete Drucker druckt einen
   Titel, das Datum, die Sonderzeichen der vier Sprachen und einen QR-Code.

**Drucker nach dem Papierstatus fragen** nutzt die Echtzeit-Statusbefehle
(DLE EOT). Die meisten Drucker antworten; antwortet einer nicht, zeigt der
Status „Papier nicht gemeldet“ und die Papierfunktionen bleiben leer.
Schalte es nur aus, wenn ein Drucker wirre Zeichen druckt.

Die **Sprache der Texte der Integration** bestimmt die Gerätenamen, das
Datum und den Testbeleg sowie die Fehlermeldungen.

## Szenen

**Beleg drucken** (Aktion): Wähle den Drucker und schreibe den Text. Das
Feld hat nur eine Zeile: Schreibe `\n`, wo eine neue Zeile beginnen soll, zum
Beispiel `Milch\nBrot\n{{triggerEvent.data.name}}`. Optional: ein Titel und
sein Stil, Datum und Uhrzeit, ein QR-Code (ein Link oder ein Text, höchstens
500 Byte). Die Aktion gibt die Anzahl der auf diesem Drucker gedruckten
Belege zurück.

Ist der Drucker nicht erreichbar, ohne Papier oder sein Deckel offen, wird
nichts gedruckt, die Aktion schlägt fehl (rot im Szenenprotokoll) und der
Auslöser **Beleg nicht gedruckt** wird ausgelöst, höchstens einmal pro
Drucker alle 15 Minuten. Seine Variablen liefern den Druckernamen, den Grund
und die Fehlermeldung: Eine Szene kann dich dann über einen anderen Kanal
warnen.

Die Funktionen des Druckers dienen auch als gewohnte Auslöser und
Bedingungen: zum Beispiel „Papier leer wird 1“ → eine Nachricht senden.

## Dashboard

Das Widget **Bondrucker** zeigt die heute und insgesamt gedruckten Belege
und den Status der Drucker. Ist in seinen Einstellungen ein Drucker gewählt,
bietet es auch zwei Knöpfe, jeder lässt sich ausblenden:

- **Notiz drucken**: Ein Formular öffnet sich auf dem Dashboard, tippe einen
  Titel und einen Text, der Beleg wird mit Datum gedruckt.
- **Testbeleg**.

## Umlaute und Codepages

Ein Bondrucker hat keine Schriften für jede Sprache: Er druckt mit einer
Zeichentabelle (Codepage). Die Integration wandelt den Text in die gewählte
Tabelle um:

- **PC858** (Standard) passt für Epson und die meisten Nachbauten:
  französische, deutsche und spanische Sonderzeichen und das Euro-Zeichen.
- Druckt der Testbeleg falsche Buchstaben, versuche **PC850**, dann
  **WPC1252**.
- **Ohne Akzente** druckt einfache Buchstaben (ä → a): Das funktioniert auf
  jedem Drucker.

Zeichen, die einer Tabelle fehlen, werden so ähnlich wie möglich geschrieben
(’ → ', œ → oe, € → EUR); Emojis und andere Alphabete werden als `?`
gedruckt.

## Grenzen

- Nur Text: keine Bilder oder Logos.
- Eine Konfiguration für alle Drucker (Breite, Codepage, Schnitt).
- Meldet der Drucker seinen Papierstatus, wird nichts gesendet, solange das
  Papier fehlt oder der Deckel offen ist. Ein Drucker, der ihn nicht meldet
  (oder mit ausgeschalteter Statusoption), behält den Beleg und druckt ihn
  nach dem Nachfüllen.
- Die Drucker werden nicht automatisch erkannt: ESC/POS-Drucker melden sich
  nicht im Netzwerk an.

## Fehlerbehebung

- **Der Drucker bleibt „Nicht erreichbar“**: Prüfe seine Adresse
  (Testseite des Druckers), dass er im selben Netzwerk ist und dass Port 9100
  offen ist (`nc -vz 192.168.1.50 9100` von einem anderen Rechner).
- **Nichts wird gedruckt, ohne Fehler**: Manche Drucker nehmen nur eine
  Verbindung gleichzeitig an: Schließe die anderen Anwendungen, die ihn
  nutzen.
- **Falsche Umlaute**: Ändere die Codepage und drucke einen Testbeleg.
- **Zeilen abgeschnitten oder zu kurz**: Ändere die Papierbreite.
- **Der QR-Code wird als Text gedruckt oder das Papier nicht geschnitten**:
  Manchen sehr billigen Nachbauten fehlen diese Befehle; schalte den Schnitt
  aus, lass den QR-Code leer.
- Protokolle: auf der Seite der Integration; `LOG_LEVEL=debug` zeigt jede
  Prüfung.
