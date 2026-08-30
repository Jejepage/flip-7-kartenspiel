# Projekt: Flip 7 Kartenspiel

## Idee
Eine deutschsprachige, lokale Pass-and-Play-Umsetzung von **Flip 7** für zwei bis vier Personen. Sie bildet die zentrale Spannung des Spiels als verständliche, spielbare Annäherung ab: Karten aufdecken, bei einer Zahl doppelt aufdecken und busten, rechtzeitig passen oder auf sieben unterschiedliche Zahlen spielen.

## Ziel
Eine ohne Installation im Browser ausführbare, zugängliche und auf Mobilgeräten wie Desktop gut bedienbare Partie bis 200 Punkte liefern. Das veröffentlichte Produkt besteht aus genau einer eigenständigen Datei `index.html` und wird anschließend über GitHub Pages ausgeliefert.

## Anforderungen
- Pass-and-Play für **2–4 Spielende** mit frei wählbaren deutschen Namen.
- Deutsche Benutzeroberfläche und verständliche Spielhinweise.
- Kartenstapel mit Zahlenkarten; eine bereits in derselben Runde bei einer Person vorhandene Zahl führt zum Bust und zu 0 Rundenpunkten.
- Nach dem anfänglichen offenen Austeilen je einer Karte wählen aktive Personen im Uhrzeigersinn auf ihrem Zug genau einmal: **Hit** deckt genau eine weitere Karte auf, **Stay/Passen** bankt und beendet ihre Rundenteilnahme. Nach jeder Auflösung wechselt der Zug zur nächsten aktiven Person.
- **Flip-7-Bonus**: sieben unterschiedliche Zahlenkarten in einer Runde beenden die Runde sofort und vergeben den festgelegten Bonus.
- Spielbare Annäherung an Aktions- und Bonuskarten: mindestens `Zweite Chance` (einmaliger Schutz vor einem Zahlen-Duplikat), `+2`, `+4`, `+6`, `+8`, `+10` sowie `Freeze` (Zielperson bankt ihre aktuellen Rundenpunkte). Regeln und Effekte sind in der Oberfläche erläutert.
- Zielwert: **200 Punkte**; bei Gleichstand nach Rundenende wird weitergespielt, bis eine Person allein führt.
- Zug- und Rundenlogik darf keine versteckten Informationen zwischen Spielenden preisgeben, soweit dies bei einem gemeinsamen Bildschirm praktisch möglich ist (Übergabebildschirm vor jedem Zug).
- Responsive, tastaturbedienbare und screenreaderfreundliche Oberfläche: semantische Bedienelemente, sichtbarer Fokus, ausreichende Kontraste, Statusmeldungen per Live-Region und keine Bedienung nur per Farbe.
- Keine Konten, keine Netzwerkanfragen, kein Online-Multiplayer, keine externen Bibliotheken, Fonts oder Assets.
- TDD-freundliche Tests mit Browser und Node-Bordmitteln, ohne Produktionsabhängigkeiten.

## Bildschirme und Interaktionen
1. **Einrichtung**
   - Auswahl von 2–4 Spielenden, Eingabe der Namen, Start der Partie.
   - Validierung: leere Namen erhalten einen eindeutigen Standardnamen; doppelte Namen werden unterscheidbar gemacht.
2. **Übergabe**
   - Zeigt nur an, wer als Nächstes an der Reihe ist, und bietet „Zug anzeigen“.
   - Verhindert, dass die Hand der vorherigen Person beim Weiterreichen sichtbar bleibt.
3. **Spielzug / Runde**
   - Zeigt aktive Person, Gesamtpunktestand, sichere Rundenpunkte, eigene offene Karten, Reststapel und die letzte gezogene Karte.
   - Zu Rundenbeginn erhält jede Person genau eine offene Karte. Anschließend bietet jeder Zug nur „Hit: genau eine Karte aufdecken“ oder „Stay/Passen & Punkte sichern“; es gibt kein fortgesetztes Selbst-Aufdecken im selben Zug.
   - Die aufgedeckte Karte und ein gegebenenfalls erforderliches Aktionsziel werden vollständig aufgelöst; danach folgt über den Übergabebildschirm die nächste noch aktive Person im Uhrzeigersinn.
   - Bust, Zweite Chance, erzwungenes Banken durch Freeze, Flip 7 und leere Zugmöglichkeiten enden nachvollziehbar, übergeben korrekt oder führen zur Rundenwertung.
4. **Rundenergebnis**
   - Zeigt Punkteänderungen, Gesamtstände und wer die nächste Runde beginnt.
5. **Spielende**
   - Zeigt Gewinner:in und Endstände; „Neue Partie“ kehrt zur Einrichtung zurück.
6. **Regeln/Hilfe**
   - Immer erreichbar, erläutert die vereinfachten Karten- und Wertungsregeln in deutscher Sprache.

## Daten
- **Spielkonfiguration:** `players: [{ id, name }]`, 2–4 Einträge.
- **Partiestatus:** Gesamtpunkte je Person, Rundenstarter, aktiver Index, Phase (`setup`, `handoff`, `turn`, `roundResult`, `gameOver`) und Gewinner:in.
- **Rundenstatus:** gemischter Kartenstapel, offene Karten je Person, bereits gesehene Zahlen je Person, Rundenpunkte, gebankte/gebustete Ergebnisse, Schutz durch `Zweite Chance`, gewählte Ziele und Ereignistext.
- **Kartenmodell:** einfache Objekte `{ type: 'number' | 'bonus' | 'action', value?, label?, points?, effect? }`.
- **Deck-Annahme:** Zahlen 0–12 mit steigender Duplikat-Häufigkeit; Bonuskarten `+2` bis `+10`; Aktionskarten `Zweite Chance` und `Freeze`. Die konkreten Häufigkeiten werden im Quellcode als transparente Annäherung dokumentiert und sind nicht als offizielle Regelreproduktion auszugeben.
- Kein Persistenzzwang: Beim Neuladen beginnt eine neue Partie; kein Local Storage nötig.

## Architektur
- **Produktionsdatei:** ausschließlich `index.html` mit eingebettetem HTML, CSS und JavaScript; keine Build-Schritte und keine externen Ressourcen.
- **JavaScript:** ein gekapseltes Modul/IIFE mit klar getrenntem, zustandslosem Spielkern (Stapelbau, Mischen über injizierbare Zufallsfunktion, Kartenauflösung, Punkteberechnung, Siegerermittlung) und DOM-Controller/Renderer. Der Renderer erzeugt semantisches DOM aus einem zentralen Zustand statt verstreuter UI-Zustände.
- **Zugmodell:** ein expliziter Zustandsautomat beschränkt erlaubte Aktionen je Phase und verhindert ungültige Übergänge.
- **Testbarkeit:** Das `<script>` exportiert den reinen Spielkern zusätzlich für Node, ohne dass die Produktionsseite etwas laden muss. Tests in `tests/engine.test.js` lesen `index.html`, extrahieren/evaluieren den markierten Spielkern mit Node `vm` und verwenden `node --test`; Browser-Prüfungen erfolgen manuell mit Tastatur und responsiver Ansicht. Dies fügt keine Laufzeit- oder Produktionsabhängigkeit hinzu.
- **Veröffentlichung:** GitHub Pages wird später aus dem Standard-Branch/Root veröffentlicht, sodass `index.html` direkt als Einstieg dient. Die konkrete Repository- und Branch-Konfiguration wird erst in der Veröffentlichungsphase geprüft.

## Umsetzungsstufen

### Stufe 1: Spielkern und testbares Fundament
**Umfang:** `index.html` als leeres, aber lauffähiges Grundgerüst anlegen; reinen Spielkern, Kartendaten, zentralen Zustand und Node-Test-Harness einführen. TDD-Zyklen für Stapelbau, Duplikat-Bust, Banken, Punktezählung und Flip-7-Erkennung durchführen.

**Akzeptanzkriterien:**
- `node --test tests/engine.test.js` deckt mindestens Deckaufbau, Duplikat-Bust, Banken und Flip 7 ab und besteht.
- Der Spielkern benötigt weder DOM noch externe Pakete.
- `index.html` lädt lokal ohne Konsolenfehler und ohne externe Requests.

**Status: DONE**

### Stufe 2: Lokaler Spielablauf für Zahlenkarten
**Umfang:** Einrichtung für 2–4 Namen, Übergabebildschirm, aktive Person, einzelnes Aufdecken oder Passen, Bust, Rundenwechsel und Ziel 200 mit UI verbinden. Tests zuerst für jede neue Zustandsübergangsfamilie ergänzen.

**Akzeptanzkriterien:**
- Zwei bis vier Personen können lokal mehrere Runden spielen, bis eine Person mindestens 200 Punkte erreicht.
- Eine doppelte Zahl derselben Person wertet die aktuelle Runde mit 0 Punkten.
- Banken erhöht nur die Gesamtpunkte der aktiven Person; Anzeige und aktive Person wechseln korrekt.
- Alle automatisierten Tests bestehen und ein manueller Zwei-Personen-Durchlauf gelingt.

**Status: DONE**

### Stufe 3: Bonus-, Aktionskarten und Rundenauswertung
**Umfang:** Bonuskarten, Zweite Chance, Freeze mit Zielauswahl, Flip-7-Bonus, Rundenergebnis sowie Gleichstandsregel implementieren; Regeln in der UI dokumentieren. Jeden Effekt testgetrieben ergänzen.

**Akzeptanzkriterien:**
- Jede spezifizierte Bonus-/Aktionskarte ist ziehbar, zeigt ihren Effekt verständlich und verändert den Zustand korrekt.
- Flip 7 endet die Runde automatisch, vergibt den dokumentierten Bonus und wird getestet.
- Freeze bankt das aktuelle Ergebnis der gewählten anderen Person; Zweite Chance neutralisiert genau ein Zahlen-Duplikat.
- Bei mehreren Personen mit mindestens 200 Punkten gewinnt erst eine allein führende Person.

**Status: DONE**

### Stufe 4: Zugängliche, responsive Fertigstellung
**Umfang:** Layout, Kartenvisualisierung, Hilfedialog/-bereich, Fokusführung, Live-Status, Kontrast und Mobilansicht verbessern; Edge-Cases und Reset absichern.

**Akzeptanzkriterien:**
- Vollständige Bedienung per Tastatur ist möglich und der Fokus bleibt nach Zustandswechseln nachvollziehbar.
- Screenreader-Status meldet Kartenereignisse und Zugwechsel; Controls haben deutsche Namen.
- Die Oberfläche bleibt bei ca. 320 px und Desktopbreite ohne horizontales Scrollen bedienbar.
- `node --test` besteht; manueller Tastatur- und Mobil-Smoke-Test ist dokumentiert.

**Status: DONE**

### Stufe 5: Unabhängiger Test und GitHub-Pages-Veröffentlichung
**Umfang:** Einen unabhängigen Tester gegen die Akzeptanzkriterien prüfen lassen, Fehler beheben, die GitHub-Pages-Einstellung gemäß dem realen Remote konfigurieren und die Live-Seite prüfen.

**Akzeptanzkriterien:**
- Unabhängiger Tester liefert ein dokumentiertes PASS für Funktion, Zugänglichkeit und Kernregeln.
- Produkt bleibt eine eigenständige `index.html`; es gibt keine Produktionsabhängigkeiten oder externen Requests.
- Die Änderungen sind in das konfigurierte GitHub-Remote gepusht und der Push wurde mit `git ls-remote` oder gleichwertig verifiziert.
- GitHub Pages liefert die Seite erfolgreich aus; die veröffentlichte URL wurde geladen und getestet.

**Status: DONE**

### Stufe 6: Tischkarten-Design und regelgetreuer Einzelkarten-Zug
**Umfang:** `index.html` und `tests/engine.test.js` auf ein eigenständiges, zugängliches Tischkarten-Design umstellen und den Zustandsautomaten auf das offizielle Grundmuster korrigieren: Zu Beginn erhält jede Person eine offene Karte; danach wählen die noch aktiven Personen im Uhrzeigersinn je Zug genau einen Hit oder Stay. Ein Hit deckt genau eine Karte auf, löst sie vollständig auf und übergibt dann an die nächste berechtigte Person. Die Hilfe benennt Quellen und weiterhin beabsichtigte Regelannäherungen transparent.

**Akzeptanzkriterien:**
- Die Oberfläche vermittelt mit ausschließlich eigenem HTML/CSS (z. B. Tischfläche, Kartenrücken/-vorderseiten, Chips/Marker und eigene Typografie) eine physische Kartenrunde; weder Logo, Kartenillustrationen noch andere Assets des Originalspiels werden kopiert oder extern geladen.
- Tastaturbedienung, sichtbarer Fokus, Kontrast, Live-Status und die Bedienbarkeit bei ca. 320 px sowie am Desktop bleiben erhalten; das aufgefrischte Layout lässt Karten, aktive Person, Hand-off und primäre Aktion klar erkennen.
- Ein deterministischer Test belegt das anfängliche offene Austeilen genau einer Karte pro Person. Danach führt Hit für eine aktive Person zu genau einer aufgedeckten Karte und zur Übergabe an die nächste aktive Person im Uhrzeigersinn; dieselbe Person erhält nicht unmittelbar erneut eine Ziehentscheidung.
- Stay bankt auf dem eigenen Zug ohne weitere Karte und übergibt an die nächste aktive Person. Bust/Duplikat, eine verbrauchte Zweite Chance, Freeze mit erzwungenem Banken sowie jede Zielauswahl bzw. sonstige erzwungene Auflösung schließen den auslösenden Zug ab und übergeben an die nächste berechtigte Person oder werten die Runde aus, wenn keine Person mehr aktiv ist.
- Flip 7 beendet die Runde weiterhin sofort; alle Zustandsübergänge sind mit `node --test tests/engine.test.js` abgedeckt und bestehen. Ein manueller 2–4-Personen-Smoke-Test prüft die Abfolge Erstausteilen → Hit/Stay → Hand-off sowie Tastatur- und Mobilansicht.
- Regeln/Hilfe verweisen auf die geprüften Regelquellen (Happy Piranha und Dized) und unterscheiden klar zwischen diesem Zugablauf und verbleibenden transparent dokumentierten Annäherungen, insbesondere Deckhäufigkeiten und ggf. nicht umgesetzten Karten-/Wertungseffekten.

**Status: DONE**
