# Imprimantes de tickets ESC/POS

Imprimez depuis vos scènes sur une imprimante thermique de tickets du réseau :
le résumé du jour, une liste de courses, un mot pour la famille. Tout reste
sur votre réseau local.

> Développée sans le matériel : vos retours sont les bienvenus. L'intégration
> a été testée contre une imprimante simulée, pas une vraie.

## Ce que vous obtenez

- Une action de scène **Imprimer un ticket** : un texte avec variables de
  scène, en option un titre (grand, double hauteur ou gras), la date et
  l'heure, un QR code, puis la coupe du papier.
- Un appareil par imprimante : **Joignable**, **Papier bientôt fini**,
  **Plus de papier**, un texte **État** (prête, papier, capot ouvert, erreur,
  injoignable) et le nombre de **Tickets imprimés** par Gladys. L'imprimante
  est vérifiée une fois par minute.
- Un déclencheur de scène **Ticket non imprimé**, pour être prévenu quand une
  scène n'a pas pu imprimer.
- Un widget de tableau de bord **Imprimante de tickets**, avec un bouton pour
  imprimer un mot tapé sur le tableau de bord.

## Avant de commencer

- Une imprimante thermique de tickets qui parle **ESC/POS** sur le réseau
  (port TCP brut **9100**) : Epson TM-T20/T88, Xprinter, Munbyn, Rongta,
  HOIN… Les Star fonctionnent dans leur mode d'émulation ESC/POS. Les
  imprimantes seulement USB ou Bluetooth ne sont pas prises en charge.
- Une **adresse IP fixe** pour l'imprimante (réservation DHCP dans votre box).
  La plupart impriment leur adresse si l'on garde le bouton d'avance papier
  enfoncé à l'allumage.
- Gladys 5.2 ou plus récent.

## Configuration

1. Dans **Intégrations → Imprimantes de tickets ESC/POS → Configuration**,
   saisissez les **adresses des imprimantes**, séparées par des virgules :
   `192.168.1.50`, ou `192.168.1.51:9101` pour un autre port.
2. Choisissez la **largeur du papier** : 58 mm imprime 32 caractères par
   ligne, 80 mm en imprime 48 (ou 42 sur certains modèles : choisissez-le si
   les lignes du ticket de test sont coupées).
3. Laissez **Couper le papier après chaque ticket** activé si l'imprimante a
   un massicot.
4. Enregistrez, ouvrez l'onglet **Découverte** et ajoutez les imprimantes.
5. Cliquez sur **Imprimer un ticket de test** : chaque imprimante configurée
   imprime un titre, la date, les accents des quatre langues et un QR code.

**Demander l'état du papier à l'imprimante** utilise les commandes de statut
en temps réel (DLE EOT). La plupart des imprimantes répondent ; quand l'une
ne répond pas, l'état indique « papier non signalé » et les fonctionnalités
papier restent vides. Ne le désactivez que si une imprimante sort des
caractères parasites.

La **langue des textes de l'intégration** fixe les noms des appareils, la
date et le ticket de test, et les messages d'erreur.

## Scènes

**Imprimer un ticket** (action) : choisissez l'imprimante et écrivez le
texte. Le champ n'a qu'une ligne : écrivez `\n` là où une nouvelle ligne doit
commencer, par exemple `Lait\nPain\n{{triggerEvent.data.name}}`. En option :
un titre et son style, la date et l'heure, un QR code (un lien ou un texte,
500 octets au plus). L'action renvoie le nombre de tickets imprimés sur cette
imprimante.

Si l'imprimante est injoignable, n'a plus de papier ou a le capot ouvert,
rien n'est imprimé, l'action échoue (en rouge dans le journal de la scène) et
le déclencheur **Ticket non imprimé** se lance, au plus une fois par
imprimante toutes les 15 minutes. Ses variables donnent le nom de
l'imprimante, la raison et le message d'erreur : une scène peut alors vous
prévenir par un autre canal.

Les fonctionnalités de l'imprimante servent aussi de déclencheurs et de
conditions habituels : par exemple « Plus de papier passe à 1 » → envoyer un
message.

## Tableau de bord

Le widget **Imprimante de tickets** affiche les tickets imprimés aujourd'hui
et au total, et l'état des imprimantes. Avec une imprimante choisie dans ses
réglages, il propose aussi deux boutons, chacun masquable :

- **Imprimer un mot** : un formulaire s'ouvre sur le tableau de bord, tapez
  un titre et un texte, le ticket est imprimé avec la date.
- **Ticket de test**.

## Accents et pages de codes

Une imprimante de tickets n'a pas de polices pour chaque langue : elle
imprime avec une table de caractères (page de codes). L'intégration convertit
le texte vers la table choisie :

- **PC858** (par défaut) convient à Epson et à la plupart des clones :
  accents français, allemands, espagnols et le symbole euro.
- Si le ticket de test imprime de mauvaises lettres, essayez **PC850**, puis
  **WPC1252**.
- **Sans accents** imprime des lettres simples (é → e) : cela marche sur
  toutes les imprimantes.

Les caractères absents d'une table sont écrits au plus proche (’ → ', œ →
oe, € → EUR) ; les émojis et les autres alphabets s'impriment en `?`.

## Limites

- Texte seulement : pas d'images ni de logos.
- Une seule configuration pour toutes les imprimantes (largeur, page de
  codes, coupe).
- Rien n'est imprimé quand le papier manque : le ticket n'est pas gardé pour
  plus tard.
- Les imprimantes ne sont pas découvertes automatiquement : les imprimantes
  ESC/POS ne s'annoncent pas sur le réseau.

## Dépannage

- **L'imprimante reste « Injoignable »** : vérifiez son adresse (page de test
  de l'imprimante), qu'elle est sur le même réseau et que le port 9100 est
  ouvert (`nc -vz 192.168.1.50 9100` depuis un autre ordinateur).
- **Rien ne s'imprime, sans erreur** : certaines imprimantes n'acceptent
  qu'une connexion à la fois : fermez les autres applications qui
  l'utilisent.
- **Mauvais accents** : changez la page de codes, puis imprimez un ticket de
  test.
- **Lignes coupées ou trop courtes** : changez la largeur du papier.
- Journaux : dans la page de l'intégration ; `LOG_LEVEL=debug` montre chaque
  vérification.
