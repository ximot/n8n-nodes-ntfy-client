# Design: Dropdown nazw nagłówków w Ntfy Send

**Data:** 2026-06-16
**Status:** Zatwierdzony (brainstorming)
**Wydanie:** 0.2.1 (bump `package.json` z 0.2.0)
**Branch:** `feat/header-dropdown` (bez pushowania do `master`)

## Problem

Pole `Additional Headers` w nodzie **Ntfy Send** wymaga ręcznego wpisania nazwy
nagłówka (np. `X-Markdown`, `X-Click`). Wymaga to znajomości API ntfy, co jest
barierą dla nietechnicznych użytkowników — a do takich n8n jest kierowany.
Title / Priority / Tags mają już dedykowane pola; reszta ntfy-owych opcji jest
ukryta za wolnym tekstem.

## Cel

Zamienić pole `Name` we wpisie nagłówka z pola tekstowego na **listę rozwijaną**
ze znanymi nagłówkami ntfy (przyjazne etykiety), zachowując opcję `Custom…` jako
furtkę dla dowolnego nagłówka. Jeden spójny mechanizm — bez mnożenia dedykowanych
pól.

## Zakres

W zakresie:
- Zmiana definicji pola `additionalHeaders` w `NtfySend.node.ts`.
- Wydzielenie logiki budowania dodatkowych nagłówków do testowalnej funkcji
  w `utils.ts`.
- Testy jednostkowe nowej funkcji.
- Bump wersji `package.json` 0.2.0 → 0.2.1 i wpis w dokumentacji/README.
- Cała praca na branchu `feat/header-dropdown`; brak pushy do `master`.

Poza zakresem:
- Typowane wartości per nagłówek (np. toggle dla `X-Markdown`) — świadomie
  pominięte (YAGNI); wartość pozostaje generycznym polem tekstowym.
- Dedykowane pola dla popularnych opcji — odrzucone na rzecz spójnego dropdownu.
- Zmiany w nodzie `NtfyTrigger` i w danych uwierzytelniających.

## UI: struktura pola

`Additional Headers` pozostaje `fixedCollection` z `multipleValues: true`.
Zmienia się wnętrze pojedynczego wpisu „Header":

| Pole          | Typ                | Zachowanie                                              |
|---------------|--------------------|---------------------------------------------------------|
| `name`        | `options` (dropdown) | Predefiniowane nagłówki + `Custom…`                   |
| `customName`  | `string`           | Widoczne tylko gdy `name === '__custom__'` (`displayOptions`) |
| `value`       | `string`           | Wartość nagłówka                                        |

### Opcje dropdownu `name`

Etykieta przyjazna dla użytkownika, `value` = realna nazwa nagłówka HTTP:

| Etykieta (name)        | value         | Podpowiedź (placeholder/description) |
|------------------------|---------------|--------------------------------------|
| Click Action URL       | `X-Click`     | `https://example.com`                |
| Attachment URL         | `X-Attach`    | `https://example.com/file.jpg`       |
| Attachment Filename    | `X-Filename`  | `file.jpg`                           |
| Icon URL               | `X-Icon`      | `https://example.com/icon.png`       |
| Format as Markdown     | `X-Markdown`  | `true`                               |
| Delay / Schedule       | `X-Delay`     | `30min`, `tomorrow`, `9am`           |
| Custom…                | `__custom__`  | (pokazuje pole `customName`)         |

Pozostałe nagłówki ntfy (`X-Email`, `X-Call`, `X-Actions`, `X-Cache`,
`X-Firebase`, `X-UnifiedPush` itd.) są osiągalne przez `Custom…`.

Domyślna wartość `name`: `X-Click`.

## Logika (utils.ts)

Wydzielona, czysta funkcja — bez zależności od `IExecuteFunctions`:

```ts
const CUSTOM_HEADER_VALUE = '__custom__';
const VALID_HEADER_NAME = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

interface AdditionalHeaderEntry {
  name: string;
  customName?: string;
  value: string;
}

/**
 * Rozwiązuje wpisy z pola Additional Headers do mapy nagłówków.
 * Rzuca Error przy niepoprawnej nazwie nagłówka (custom).
 * Pomija wpisy z pustą nazwą efektywną lub pustą wartością.
 * Przy duplikatach wygrywa ostatni wpis.
 */
export function buildAdditionalHeaders(
  entries: AdditionalHeaderEntry[],
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of entries) {
    const name = (entry.name === CUSTOM_HEADER_VALUE ? entry.customName : entry.name)?.trim();
    const value = entry.value?.trim();
    if (!name || !value) continue;
    if (!VALID_HEADER_NAME.test(name)) {
      throw new Error(
        `Invalid header name: "${name}". Header names may only contain ` +
          `letters, digits, and hyphens.`,
      );
    }
    headers[name] = value;
  }
  return headers;
}
```

Stałe `CUSTOM_HEADER_VALUE` i `VALID_HEADER_NAME` eksportowane, aby definicja
node'a mogła użyć tej samej wartości sentinel.

## Logika (NtfySend.node.ts → execute)

Zastępuje obecną pętlę inline (linie ~145-155):

```ts
const additionalHeaders = this.getNodeParameter('additionalHeaders', i) as {
  header?: AdditionalHeaderEntry[];
};
try {
  Object.assign(headers, buildAdditionalHeaders(additionalHeaders.header ?? []));
} catch (error) {
  throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex: i });
}
```

`NodeOperationError` (z `itemIndex`) tworzony jest w warstwie node'a; czysta
funkcja rzuca zwykły `Error`. Zachowuje to obecne zachowanie `continueOnFail`.

## Zmiana zachowania względem stanu obecnego

Dziś pomijany jest tylko wpis z pustą **nazwą**. Nowa logika pomija też wpis z
pustą **wartością** — wybranie np. `X-Click` z dropdownu bez podania URL nie ma
sensu i nie powinno wysyłać pustego nagłówka. Świadoma, drobna zmiana.

## Zgodność wsteczna

`value` opcji dropdownu = realna nazwa nagłówka, więc istniejące workflowy z
ręcznie wpisanym `X-Markdown` / `X-Click` itd. zmapują się automatycznie na
odpowiednią pozycję listy. Wpisy spoza listy (np. `X-Email`) trzeba raz
przełączyć na `Custom…` i wpisać nazwę ponownie. Ryzyko minimalne — funkcja jest
świeża (v0.2.0, jeszcze nieopublikowana na npm), brak realnych workflowów w
produkcji.

## Testy (utils.test.ts)

Dla `buildAdditionalHeaders`:
- predefiniowany nagłówek → mapowany 1:1 (`X-Click`)
- `Custom…` z poprawną nazwą → użyta `customName`
- `Custom…` z pustą `customName` → wpis pominięty
- `Custom…` z niepoprawną nazwą (np. `X Bad`) → rzuca `Error`
- pusta wartość przy poprawnej nazwie → wpis pominięty
- duplikat tej samej nazwy → wygrywa ostatnia wartość
- pusta tablica / brak wpisów → `{}`
- whitespace w nazwie/wartości → trymowane

## Dokumentacja

Aktualizacja `README.md`: opis nowego dropdownu i opcji `Custom…` (zastąpienie
obecnego akapitu o ręcznym wpisywaniu nazw nagłówków).
