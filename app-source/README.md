# FORT Timer → Apple App Store

Das native iOS-Projekt liegt jetzt im GitHub-Repo unter `app-source/` (Ordner `ios/`), gebaut mit
[Capacitor](https://capacitorjs.com). Es lädt keine externe URL, sondern bündelt die App komplett
offline – das ist wichtig, weil Apple reine "Website-Wrapper" ablehnen kann (Guideline 4.2).

## Was schon erledigt ist

- Capacitor-Projekt mit iOS-Plattform (`app-source/ios/`)
- App-Icon (1024×1024, FORT-Branding) und Splashscreen eingesetzt
- Mikrofon-Berechtigungstext in `Info.plist` hinterlegt (erklärt Zweck, keine Aufnahme/Übertragung)
- Datenschutzerklärung veröffentlicht: **https://jaegerii.github.io/Shot-Timer/privacy.html**
- Bundle-ID vergeben: `com.fortperformance.forttimer` (App-Name: "FORT Timer")

## Was du noch brauchst

1. **Apple Developer Program** – 99 $/Jahr, Anmeldung mit deiner Apple-ID unter
   [developer.apple.com](https://developer.apple.com/programs/). Das kann ich nicht für dich
   erledigen, da es deine Identität/Zahlung erfordert.
2. **Einen Mac mit Xcode** *oder* einen Cloud-Build-Dienst (siehe unten) – ich kann in dieser
   Sandbox kein Xcode ausführen, das native Bauen/Signieren muss auf echtem Apple-Tooling laufen.

## Weg A: Eigener Mac

```bash
git clone https://github.com/JaegerII/Shot-Timer.git
cd Shot-Timer/app-source
npm install
npm run build:ios      # baut die Web-App und synct sie ins iOS-Projekt
npm run ios:open       # öffnet Xcode
```

In Xcode:

1. Projekt "App" auswählen → Tab **Signing & Capabilities** → dein Apple-Developer-Team wählen
   (Xcode registriert die Bundle-ID `com.fortperformance.forttimer` dabei automatisch, falls sie
   in deinem Account noch frei ist)
2. **Product → Archive**
3. Im Organizer: **Distribute App → App Store Connect → Upload**
4. In [App Store Connect](https://appstoreconnect.apple.com) eine neue App anlegen (gleiche
   Bundle-ID), das hochgeladene Build zuweisen, Metadaten ausfüllen (siehe unten), zur Prüfung
   einreichen

Kein CocoaPods nötig – das Projekt nutzt Swift Package Manager, Xcode löst die Abhängigkeiten
beim Öffnen automatisch auf.

## Weg B: Ohne eigenen Mac (Cloud-Build)

Dienste wie [Codemagic](https://codemagic.io) (kostenloses Kontingent) oder Ionic Appflow bauen
iOS-Apps in der Cloud direkt aus dem GitHub-Repo und können auch signieren/hochladen. Grober
Ablauf bei Codemagic:

1. Mit GitHub einloggen, Repo `JaegerII/Shot-Timer` verbinden
2. iOS-Workflow anlegen, als Projektpfad `app-source` und Xcode-Workspace
   `ios/App/App.xcodeproj` angeben, Build-Schritt `npm install && npm run build:ios` voranstellen
3. Apple-Developer-Zugangsdaten/Zertifikat in Codemagic hinterlegen (dafür brauchst du trotzdem
   das Developer-Programm-Konto aus Schritt 1 oben)
4. Codemagic kann automatisch signieren und direkt zu App Store Connect / TestFlight hochladen

## Nach jeder Web-Änderung

Wenn wir hier weiter am Design/Funktionen arbeiten, muss vor einem neuen iOS-Build einmal
`npm run build:ios` laufen (baut die Web-App neu und kopiert sie ins native Projekt), bevor du in
Xcode erneut archivierst.

## App Store Connect – Metadaten-Entwurf

- **App-Name:** FORT Timer
- **Untertitel** (max. 30 Zeichen): Dry-Fire Shot Timer
- **Kategorie:** Sport (primär), Dienstprogramme (sekundär)
- **Preis:** Kostenlos
- **Datenschutz-URL:** https://jaegerii.github.io/Shot-Timer/privacy.html
- **Beschreibung (Entwurf):**

  > FORT Timer ist ein Shot-Timer fürs Dry-Fire-Training zuhause – im Stil klassischer
  > Trainingstimer, aber ohne Munition, ohne Störung. Zufälliger Delay, authentischer Beep, und
  > die App erkennt über das Mikrofon deinen Holster-Zug sowie den Abzugsklick, damit du deine
  > Split-Zeiten trainierst und nachvollziehen kannst, ob du dich verbesserst.
  >
  > • Zufällige Verzögerung wie bei klassischen Trainingstimern
  > • Erkennung von Zug und Schuss über das Mikrofon
  > • Par-Time-Funktion
  > • Trainingsverlauf mit Splits
  > • Funktioniert auch bei gesperrtem Bildschirm
  >
  > Für beste Ergebnisse Kopfhörer verwenden und das Handy in ca. 50 cm Entfernung platzieren.

- **Keywords:** shot timer, dryfire, dry fire, schießtraining, ipsc, practical shooting, training
- **Datenschutz-Fragebogen (App Privacy) in App Store Connect:** "Keine Daten werden erfasst" /
  Mikrofon wird nur lokal verarbeitet, keine Übertragung – passend zur Datenschutzerklärung.
- **Altersfreigabe:** Der Fragebogen enthält Kategorien zu Waffen-/simulierten Waffendarstellungen;
  ehrlich ausfüllen (die App simuliert kein Schießen visuell, sondern ist ein reines Zeitmess-Tool
  für echtes Trockentraining – trotzdem realistisch einschätzen, das kann zu einer 12+/17+
  Einstufung führen).

## Ein ehrlicher Hinweis zum Risiko

Apple lehnt Apps ab, die im Kern "nur eine Website" sind (Guideline 4.2). FORT Timer hat echte
native Funktionalität (Mikrofon-Auswertung, Offline-Betrieb, kein reines Web-Embed), das spricht
dafür – eine Garantie für die Freigabe gibt es trotzdem nie. Falls Apple ablehnt, bekommst du im
Review-Feedback meist einen konkreten Grund, den wir dann gezielt beheben können.

Ich bin kein Anwalt – falls dir eine rechtssichere Datenschutzerklärung/Impressum wichtig ist
(z. B. bei einer Veröffentlichung als eingetragenes Unternehmen), lohnt sich ein kurzer Check
durch einen Fachanwalt, bevor du live gehst.
