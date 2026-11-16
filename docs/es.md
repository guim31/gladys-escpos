# Impresoras de tickets ESC/POS

Imprima desde sus escenas en una impresora térmica de tickets de la red: el
resumen del día, una lista de la compra, una nota para la familia. Todo se
queda en su red local.

> Desarrollada sin el hardware: sus comentarios son bienvenidos. La
> integración se ha probado con una impresora simulada, no con una real.

## Qué obtiene

- Una acción de escena **Imprimir un ticket**: un texto con variables de
  escena, opcionalmente con título (grande, doble altura o negrita), la fecha
  y la hora, un código QR, y luego el corte del papel.
- Un dispositivo por impresora: **Accesible**, **Papel casi agotado**, **Sin
  papel**, un texto **Estado** (lista, papel, tapa abierta, error,
  inaccesible) y el número de **Tickets impresos** por Gladys. La impresora
  se comprueba una vez por minuto.
- Un disparador de escena **Ticket no impreso**, para recibir un aviso cuando
  una escena no ha podido imprimir.
- Un widget del panel **Impresora de tickets**, con un botón para imprimir
  una nota escrita en el panel.

## Antes de empezar

- Una impresora térmica de tickets que hable **ESC/POS** en la red (puerto
  TCP directo **9100**): Epson TM-T20/T88, Xprinter, Munbyn, Rongta, HOIN…
  Las Star funcionan en su modo de emulación ESC/POS. Las impresoras solo
  USB o Bluetooth no son compatibles.
- Una **dirección IP fija** para la impresora (una reserva DHCP en su
  router). La mayoría imprime su dirección si mantiene pulsado el botón de
  avance de papel al encenderla.
- Gladys 5.2 o posterior.

## Configuración

1. En **Integraciones → Impresoras de tickets ESC/POS → Configuración**,
   indique las **direcciones de las impresoras**, separadas por comas:
   `192.168.1.50`, o `192.168.1.51:9101` para otro puerto.
2. Elija el **ancho del papel**: 58 mm imprime 32 caracteres por línea,
   80 mm imprime 48 (o 42 en algunos modelos: elíjalo si las líneas del
   ticket de prueba salen cortadas).
3. Deje activado **Cortar el papel tras cada ticket** si la impresora tiene
   cortador.
4. Guarde, abra la pestaña **Descubrimiento** y añada las impresoras.
5. Haga clic en **Imprimir un ticket de prueba**: cada impresora configurada
   imprime un título, la fecha, los acentos de los cuatro idiomas y un código
   QR.

**Preguntar a la impresora el estado del papel** usa los comandos de estado
en tiempo real (DLE EOT). La mayoría de las impresoras responde; cuando una
no responde, el estado indica «papel no indicado» y las funciones de papel
quedan vacías. Desactívelo solo si una impresora imprime caracteres extraños.

El **idioma de los textos de la integración** fija los nombres de los
dispositivos, la fecha y el ticket de prueba, y los mensajes de error.

## Escenas

**Imprimir un ticket** (acción): elija la impresora y escriba el texto. El
campo tiene una sola línea: escriba `\n` donde deba empezar una nueva línea,
por ejemplo `Leche\nPan\n{{triggerEvent.data.name}}`. Opcional: un título y
su estilo, la fecha y la hora, un código QR (un enlace o un texto, 500 bytes
como máximo). La acción devuelve el número de tickets impresos en esta
impresora.

Si la impresora está inaccesible, sin papel o con la tapa abierta, no se
imprime nada, la acción falla (en rojo en el registro de la escena) y se
lanza el disparador **Ticket no impreso**, como máximo una vez por impresora
cada 15 minutos. Sus variables dan el nombre de la impresora, el motivo y el
mensaje de error: una escena puede entonces avisarle por otro canal.

Las funciones de la impresora también sirven como disparadores y condiciones
habituales: por ejemplo «Sin papel pasa a 1» → enviar un mensaje.

## Panel

El widget **Impresora de tickets** muestra los tickets impresos hoy y en
total, y el estado de las impresoras. Con una impresora elegida en sus
ajustes, ofrece también dos botones, cada uno se puede ocultar:

- **Imprimir una nota**: se abre un formulario en el panel, escriba un
  título y un texto, el ticket se imprime con la fecha.
- **Ticket de prueba**.

## Acentos y páginas de códigos

Una impresora de tickets no tiene fuentes para cada idioma: imprime con una
tabla de caracteres (página de códigos). La integración convierte el texto a
la tabla elegida:

- **PC858** (por defecto) sirve para Epson y la mayoría de los clones:
  acentos franceses, alemanes, españoles y el símbolo del euro.
- Si el ticket de prueba imprime letras incorrectas, pruebe **PC850** y
  luego **WPC1252**.
- **Sin acentos** imprime letras simples (é → e): funciona en todas las
  impresoras.

Los caracteres que faltan en una tabla se escriben de la forma más parecida
(’ → ', œ → oe, € → EUR); los emojis y los demás alfabetos se imprimen como
`?`.

## Límites

- Solo texto: ni imágenes ni logotipos.
- Una única configuración para todas las impresoras (ancho, página de
  códigos, corte).
- Sin papel no se imprime nada: el ticket no se guarda para más tarde.
- Las impresoras no se descubren automáticamente: las impresoras ESC/POS no
  se anuncian en la red.

## Solución de problemas

- **La impresora sigue «Inaccesible»**: compruebe su dirección (página de
  prueba de la impresora), que está en la misma red y que el puerto 9100
  está abierto (`nc -vz 192.168.1.50 9100` desde otro ordenador).
- **No se imprime nada, sin error**: algunas impresoras solo aceptan una
  conexión a la vez: cierre las demás aplicaciones que la usan.
- **Acentos incorrectos**: cambie la página de códigos e imprima un ticket de
  prueba.
- **Líneas cortadas o demasiado cortas**: cambie el ancho del papel.
- Registros: en la página de la integración; `LOG_LEVEL=debug` muestra cada
  comprobación.
