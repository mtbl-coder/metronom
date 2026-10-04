# Stroik i Metronom

- **Aplikacja w przeglądarce (Android i iPhone):** https://mtbl-coder.github.io/metronom/
- **Plik APK (Android):** https://github.com/mtbl-coder/metronom/releases/latest/download/stroik.apk

Aplikacja na telefon (PWA – działa w przeglądarce, można ją zainstalować na ekranie głównym i używać offline) dla muzyków, szczególnie grających na instrumentach dętych.

## Stroik

- Rozpoznawanie wysokości dźwięku z mikrofonu (metoda McLeoda – odporna na alikwoty, dobra dla saksofonu, klarnetu, trąbki, fletu, głosu, smyczków). Zakres ok. 27 Hz – 4,5 kHz.
- **Dwie nazwy jednocześnie**: dźwięk koncertowy (jak na fortepianie) » dźwięk w stroju instrumentu, np. saksofon altowy: koncertowe **E♭ » C**.
- Transpozycje: C, B♭ (klarnet, trąbka, sax sopranowy), B♭ 8va (sax tenorowy, klarnet basowy), E♭ (sax altowy), E♭ 8va (sax barytonowy), Es wysoki (klarnet Es), F (waltornia, rożek angielski), A (klarnet A), G (flet altowy), D (trąbka D), piccolo, gitara/kontrabas.
- Strojenie **A4** 400–480 Hz (przyciski ±1 Hz, wpis z dokładnością 0,5 Hz, reset do 440 Hz).
- Wskazówka ±50 centów, odchyłka w centach i w **Hz od nominału**, częstotliwość grana i docelowa.
- **Podświetlenie na zielono**, gdy dźwięk mieści się w zielonej strefie (domyślnie ±5 centów, regulowane 1–20); żółte – blisko.
- Wykres odchyłki w czasie (do oceny stabilności dźwięku).
- Nazewnictwo: C D E … B, polskie/niemieckie (Cis, Es, B, H) lub Do Re Mi; krzyżyki albo bemole.
- Kamerton – ton wzorcowy dowolnego dźwięku (z uwzględnieniem A4).
- Regulowana czułość mikrofonu.

## Metronom (wszystko na jednym ekranie)

- Tempo 20–300 BPM: przyciski −/+ (przytrzymanie przyspiesza), suwak, wpis, **TAP** (wystukanie), włoska nazwa tempa.
- Metrum 1–16 uderzeń, **akcenty** dla każdego uderzenia (akcent / zwykłe / cisza – dotknij kropki).
- Podziały: ćwierćnuty, ósemki, triole, szesnastki, swing, kwintole.
- Brzmienia: klik, drewno, beep, perkusja, krowi dzwonek, ton; głośność.
- Błysk ekranu, wibracje, licznik czasu i taktów.
- **Trener tempa** (co N taktów o X BPM do tempa docelowego) i **minutnik** (zatrzymanie po czasie).
- Blokada wygaszania ekranu podczas gry.
- Mini-metronom (tempo + start/stop) dostępny także na ekranie stroika.

Rytm jest planowany zegarem Web Audio z wyprzedzeniem, więc jest stabilny nawet przy obciążonym telefonie.

## Uruchomienie

Aplikacja nie wymaga budowania – to statyczne pliki.

```bash
npm start          # serwer lokalny na http://localhost:8080
npm test           # testy detekcji wysokości i nazewnictwa
```

Mikrofon w przeglądarce działa tylko przez **HTTPS** (lub `localhost`). Najprościej opublikować przez GitHub Pages – workflow `.github/workflows/pages.yml` publikuje stronę po wypchnięciu na gałąź `main` (w ustawieniach repozytorium: *Settings → Pages → Source: GitHub Actions*).

Na telefonie: otwórz adres strony w Chrome (Android) lub Safari (iOS) → menu → **Dodaj do ekranu głównego**. Aplikacja uruchamia się wtedy jak natywna i działa bez internetu.

## APK (Android)

Po każdym wypchnięciu na `main` workflow `.github/workflows/android.yml` pakuje aplikację w APK (Capacitor) i publikuje go w zakładce **Releases**. Projekt `android/` jest generowany w CI (`npx cap add android` + `scripts/android-setup.sh`), więc nie trzeba go trzymać w repozytorium.

APK jest podpisany kluczem z `android-signing/debug.keystore` (klucz deweloperski, hasło `android`), dzięki czemu kolejne wersje instalują się jako aktualizacja. Do publikacji w Google Play trzeba użyć prywatnego klucza trzymanego w sekretach repozytorium.

Lokalnie (wymaga Android SDK i Javy 21):

```bash
npm ci && npm run build:web && npx cap add android && scripts/android-setup.sh
cd android && ./gradlew assembleDebug
```

## Struktura

| Plik | Zawartość |
|---|---|
| `js/pitch.js` | detekcja wysokości (MPM) |
| `js/notes.js` | nazwy dźwięków, transpozycje, centy, nazwy temp |
| `js/tuner.js` | mikrofon, stabilizacja odczytów, generator tonu |
| `js/metronome.js` | silnik metronomu i syntezowane brzmienia |
| `js/app.js` | interfejs i zapis ustawień |
