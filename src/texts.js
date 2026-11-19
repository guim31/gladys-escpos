// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish "usted".
// -----------------------------------------------------------------------------

export const FEATURE_NAMES = {
  online: { en: 'Reachable', fr: 'Joignable', de: 'Erreichbar', es: 'Accesible' },
  paper_low: {
    en: 'Paper running low',
    fr: 'Papier bientôt fini',
    de: 'Papier fast leer',
    es: 'Papel casi agotado',
  },
  paper_out: { en: 'Out of paper', fr: 'Plus de papier', de: 'Papier leer', es: 'Sin papel' },
  status: { en: 'Status', fr: 'État', de: 'Status', es: 'Estado' },
  tickets: {
    en: 'Tickets printed',
    fr: 'Tickets imprimés',
    de: 'Gedruckte Belege',
    es: 'Tickets impresos',
  },
};

export const DEVICE_NAME = {
  en: 'Ticket printer',
  fr: 'Imprimante de tickets',
  de: 'Bondrucker',
  es: 'Impresora de tickets',
};

// Value of the `status` text feature and of the widget rows.
export const STATUS_TEXT = {
  ready: { en: 'Ready', fr: 'Prête', de: 'Bereit', es: 'Lista' },
  paper_low: {
    en: 'Ready, paper running low',
    fr: 'Prête, papier bientôt fini',
    de: 'Bereit, Papier fast leer',
    es: 'Lista, papel casi agotado',
  },
  paper_out: { en: 'Out of paper', fr: 'Plus de papier', de: 'Papier leer', es: 'Sin papel' },
  cover_open: { en: 'Cover open', fr: 'Capot ouvert', de: 'Deckel offen', es: 'Tapa abierta' },
  error: {
    en: 'Printer error',
    fr: "Erreur de l'imprimante",
    de: 'Druckerfehler',
    es: 'Error de la impresora',
  },
  unknown: {
    en: 'Reachable, paper not reported',
    fr: 'Joignable, papier non signalé',
    de: 'Erreichbar, Papier nicht gemeldet',
    es: 'Accesible, papel no indicado',
  },
  offline: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
};

// Failures, thrown to Gladys (shown in red) and passed to the trigger.
export const ERROR_TEXT = {
  unreachable: {
    en: 'The printer does not answer: check that it is on and its address.',
    fr: "L'imprimante ne répond pas : vérifiez qu'elle est allumée et son adresse.",
    de: 'Der Drucker antwortet nicht: Prüfe, ob er eingeschaltet ist, und seine Adresse.',
    es: 'La impresora no responde: compruebe que está encendida y su dirección.',
  },
  timeout: {
    en: 'The printer did not take the ticket in time.',
    fr: "L'imprimante n'a pas pris le ticket à temps.",
    de: 'Der Drucker hat den Beleg nicht rechtzeitig angenommen.',
    es: 'La impresora no ha aceptado el ticket a tiempo.',
  },
  paper_out: {
    en: 'The printer is out of paper: nothing was sent.',
    fr: "L'imprimante n'a plus de papier : rien n'a été envoyé.",
    de: 'Der Drucker hat kein Papier mehr: Es wurde nichts gesendet.',
    es: 'La impresora no tiene papel: no se ha enviado nada.',
  },
  cover_open: {
    en: 'The printer cover is open: nothing was sent.',
    fr: "Le capot de l'imprimante est ouvert : rien n'a été envoyé.",
    de: 'Der Deckel des Druckers ist offen: Es wurde nichts gesendet.',
    es: 'La tapa de la impresora está abierta: no se ha enviado nada.',
  },
  error: {
    en: 'The printer reported an error.',
    fr: "L'imprimante a signalé une erreur.",
    de: 'Der Drucker hat einen Fehler gemeldet.',
    es: 'La impresora ha indicado un error.',
  },
  unknown_printer: {
    en: 'This printer is not in the integration: add it in the Discover tab.',
    fr: "Cette imprimante n'est pas dans l'intégration : ajoutez-la dans l'onglet Découverte.",
    de: 'Dieser Drucker gehört nicht zur Integration: Füge ihn im Reiter Erkennung hinzu.',
    es: 'Esta impresora no está en la integración: añádala en la pestaña Descubrimiento.',
  },
  no_printer: {
    en: 'No printer configured: enter its address in the configuration.',
    fr: 'Aucune imprimante configurée : saisissez son adresse dans la configuration.',
    de: 'Kein Drucker eingerichtet: Gib seine Adresse in der Konfiguration ein.',
    es: 'Ninguna impresora configurada: indique su dirección en la configuración.',
  },
  empty: {
    en: 'Nothing to print: the message is empty.',
    fr: 'Rien à imprimer : le message est vide.',
    de: 'Nichts zu drucken: Die Nachricht ist leer.',
    es: 'Nada que imprimir: el mensaje está vacío.',
  },
  qr_too_long: {
    en: 'The QR code content is too long (500 bytes at most).',
    fr: 'Le contenu du QR code est trop long (500 octets au plus).',
    de: 'Der Inhalt des QR-Codes ist zu lang (höchstens 500 Byte).',
    es: 'El contenido del código QR es demasiado largo (500 bytes como máximo).',
  },
};

export const CONNECTION_TEXT = {
  no_printer: {
    en: 'No printer configured yet.',
    fr: 'Aucune imprimante configurée pour le moment.',
    de: 'Noch kein Drucker eingerichtet.',
    es: 'Todavía no hay ninguna impresora configurada.',
  },
  invalid: {
    en: 'Some printer addresses are invalid: {list}',
    fr: "Certaines adresses d'imprimante sont invalides : {list}",
    de: 'Einige Druckeradressen sind ungültig: {list}',
    es: 'Algunas direcciones de impresora no son válidas: {list}',
  },
  init_failed: {
    en: 'The integration could not start: see its logs.',
    fr: "L'intégration n'a pas pu démarrer : voir ses journaux.",
    de: 'Die Integration konnte nicht starten: siehe ihre Protokolle.',
    es: 'La integración no ha podido iniciarse: consulte sus registros.',
  },
};

export const TEST_TICKET = {
  title: { en: 'Test ticket', fr: 'Ticket de test', de: 'Testbeleg', es: 'Ticket de prueba' },
  message: {
    en: 'Gladys can print here.',
    fr: 'Gladys peut imprimer ici.',
    de: 'Gladys kann hier drucken.',
    es: 'Gladys puede imprimir aquí.',
  },
  characters: {
    en: 'If a letter below shows wrong, choose another code page in the configuration:',
    fr: 'Si une lettre ci-dessous est mal imprimée, choisissez une autre page de codes dans la configuration :',
    de: 'Wird ein Buchstabe unten falsch gedruckt, wähle in der Konfiguration eine andere Codepage:',
    es: 'Si una letra de abajo se imprime mal, elija otra página de códigos en la configuración:',
  },
};

// The accents of the four languages, printed by the test ticket.
export const SAMPLE_CHARACTERS =
  'àâäçéèêëîïôöùûüÿ ÀÂÇÉÈÊÎÔÙÛ\näöüß ÄÖÜ ñ ¿¡ áíóú ÁÍÓÚÑ\n€ £ ° « » œ';

export const ACTION_TEXT = {
  printed: {
    en: 'Printed on {printers}.',
    fr: 'Imprimé sur {printers}.',
    de: 'Gedruckt auf {printers}.',
    es: 'Impreso en {printers}.',
  },
  failed: {
    en: '{printer}: {error}',
    fr: '{printer} : {error}',
    de: '{printer}: {error}',
    es: '{printer}: {error}',
  },
};

export const WIDGET_TEXT = {
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  total: { en: 'In total', fr: 'Au total', de: 'Insgesamt', es: 'En total' },
  print: {
    en: 'Print a note',
    fr: 'Imprimer un mot',
    de: 'Notiz drucken',
    es: 'Imprimir una nota',
  },
  test: { en: 'Test ticket', fr: 'Ticket de test', de: 'Testbeleg', es: 'Ticket de prueba' },
  title: { en: 'Title', fr: 'Titre', de: 'Titel', es: 'Título' },
  message: { en: 'Message', fr: 'Message', de: 'Nachricht', es: 'Mensaje' },
  empty: {
    en: 'No ticket printer added yet: add one in the Discover tab of the integration.',
    fr: "Aucune imprimante de tickets ajoutée : ajoutez-en une dans l'onglet Découverte de l'intégration.",
    de: 'Noch kein Bondrucker hinzugefügt: Füge einen im Reiter Erkennung der Integration hinzu.',
    es: 'Todavía no se ha añadido ninguna impresora de tickets: añada una en la pestaña Descubrimiento de la integración.',
  },
  missing: {
    en: 'The chosen printer no longer exists: edit the widget.',
    fr: "L'imprimante choisie n'existe plus : modifiez le widget.",
    de: 'Der gewählte Drucker existiert nicht mehr: Bearbeite das Widget.',
    es: 'La impresora elegida ya no existe: edite el widget.',
  },
};

/** Fill `{name}` placeholders of every language. */
export function fill(text, values) {
  return Object.fromEntries(
    Object.entries(text).map(([lang, value]) => [
      lang,
      value.replace(/\{(\w+)\}/g, (_, key) => {
        const replacement = values[key];
        return typeof replacement === 'object' ? (replacement?.[lang] ?? '') : String(replacement);
      }),
    ]),
  );
}

/** Error thrown by a handler: Gladys shows the multi-language message in red. */
export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}
