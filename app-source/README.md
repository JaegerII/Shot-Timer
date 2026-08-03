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

## Schritt 1: Apple Developer Account (komplett im Browser, auch unter Windows)

1. Falls noch nicht vorhanden: Apple-ID anlegen unter
   [appleid.apple.com](https://appleid.apple.com) – geht ohne Apple-Gerät, nur E-Mail + Handynummer
   nötig.
2. Auf [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll) mit
   dieser Apple-ID anmelden.
3. Als **Individual** registrieren (nicht "Organization" – das braucht eine D-U-N-S-Nummer und
   dauert deutlich länger). Individual reicht für eine App unter deinem eigenen Namen völlig aus.
4. Persönliche Daten + Zahlungsdaten eingeben, 99 $/Jahr bezahlen.
5. Apple prüft deine Identität – meist 24–48 Std., manchmal ruft Apple zur Verifizierung an.
6. Nach Freischaltung hast du Zugriff auf [App Store Connect](https://appstoreconnect.apple.com)
   (App-Verwaltung, Metadaten, Einreichung) und das Developer-Portal (Zertifikate, App-IDs).

Das Ganze läuft komplett über den Browser – dafür brauchst du keinen Mac, nur diesen einen Schritt
kann ausschließlich du machen (Identität/Zahlung).

## Schritt 2: Bauen ohne eigenen Mac – Codemagic

Da du keinen Mac hast, ist [Codemagic](https://codemagic.io) der einfachste Weg: eine
Cloud-CI, die auf echten Mac-Rechnern baut, signiert und direkt zu App Store Connect hochlädt.
Kostenloses Kontingent reicht für den Anfang.

Ich habe eine `codemagic.yaml` ins Repo-Root gelegt, die den Workflow für dieses Projekt schon
vorkonfiguriert (Pfad zu `app-source`, Build-Kommando, automatisches Signieren, Upload zu
TestFlight). Ich konnte sie hier nicht selbst testen (kein Zugriff auf Codemagic/Xcode aus meiner
Sandbox) – rechne damit, dass du in der Codemagic-UI noch Kleinigkeiten nachjustieren musst,
besonders beim Signing.

So richtest du es ein:

1. Auf [codemagic.io](https://codemagic.io) mit deinem GitHub-Account einloggen.
2. Repo `JaegerII/Shot-Timer` hinzufügen – Codemagic erkennt die `codemagic.yaml` automatisch.
3. **App Store Connect API Key** erstellen (nötig für automatisches Signieren + Upload):
   - In App Store Connect → **Nutzer und Zugriff → Integrationen → App Store Connect API**
   - Neuen Key generieren (Rolle: "App Manager" reicht), die `.p8`-Datei herunterladen
     (nur einmal möglich!), dir Key-ID und Issuer-ID notieren
   - In Codemagic unter **Teams → Integrations → Apple Developer Portal** diese drei Werte
     eintragen ("App Store Connect API key") – Codemagic verwaltet damit automatisch
     Zertifikate/Profile, du musst nichts manuell exportieren
4. In den Codemagic-App-Einstellungen unter **Environment variables** die Gruppe
   `app_store_credentials` anlegen (Name muss zur `codemagic.yaml` passen) und dort verknüpfen,
   falls Codemagic das nicht automatisch aus Schritt 3 übernimmt.
5. In App Store Connect einmal die App **manuell anlegen** (Bundle-ID
   `com.fortperformance.forttimer`, Name "FORT Timer") – Codemagic kann nur zu einer bereits
   existierenden App hochladen, nicht selbst eine anlegen.
6. Build in Codemagic starten. Bei Erfolg landet die Version automatisch in **TestFlight** (in der
   Konfiguration ist `submit_to_app_store: false` gesetzt – so kannst du erst in Ruhe selbst testen,
   bevor du in App Store Connect manuell auf "Zur Prüfung einreichen" klickst).

Bei jeder Web-Änderung an der App reicht danach: Push aufs Repo → Codemagic-Build erneut starten.

## Weg A (alternativ): Eigener Mac

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

(Alternative zu Codemagic: [Ionic Appflow](https://ionic.io/appflow) funktioniert sehr ähnlich,
falls Codemagic aus irgendeinem Grund nicht passt.)

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
