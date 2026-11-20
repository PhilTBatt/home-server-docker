# AMD Ryzen desktop CPUs

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

Researched 2026-11-20.

How I read the pages:
- I could not open amd.com directly (the sandbox proxy blocks it), so every AMD page went through a fetch tool. That tool summarises pages and limits each verbatim quote to about 125 characters. I asked it for exact field values and exact phrases each time. Text in "quotes" below is what it said was verbatim. Tables of values are its rendering of the page, checked with a second fetch where noted.
- The amd.com **product** pages for the Ryzen 5 5600, 5600G, Ryzen 7 5700X and 5700G (`/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-...html`) failed with a client error each time. For those models, and as a cross-check for the others, I used AMD's own **Drivers and Downloads** page for the model, which has a "Specifications" section. Some of those pages carry more fields than others (see the ECC and chipset notes).
- I never opened eBay.

## AMD Ryzen 5 5600

- Socket: "AM4"
- Cores/threads: "6" / "12"
- Clocks: base "3.5 GHz"; max boost "Up to 4.4 GHz"
- Default TDP: "65W"
- Integrated graphics: no. Graphics Model: "Discrete Graphics Card Required"
- Cooler: Thermal Solution (PIB) "AMD Wraith Stealth". AMD's 2022 release also says "All new Ryzen 5 and Ryzen 3 desktop processors announced today are bundled with an AMD Wraith Stealth cooler" (https://ir.amd.com/news-events/press-releases/detail/1053/amd-launches-the-ultimate-gaming-processor-brings).
- Memory: "DDR4"; Memory Channels "2"; Max. Memory "128 GB"; System Memory Subtype "UDIMM"; System Memory Specification "Up to 3200 MT/s"; Max Memory Speed 2x1R "DDR4-3200", 2x2R "DDR4-3200", 4x1R "DDR4-2933", 4x2R "DDR4-2667"
- PCIe: "PCIe® 4.0"; Native PCIe Lanes (Total/Usable) "24 , 20"
- ECC: "Yes (Requires mobo support)"
- Supporting Chipsets: "X570 , X470 , X370 , B550 , B450 , B350 , A520" (no A320; see the conflict noted in the BIOS section)
- Other identifiers: Former Codename "Vermeer"; Processor Architecture "Zen 3"; L3 "32 MB"; Tjmax "90°C"; Launch Date "04/04/2022"; Product ID Boxed "100-100000927BOX"; Tray "100-000000927"
- All fields above are from https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html. The product page `.../5000-series/amd-ryzen-5-5600.html` could not be fetched (client error).

Sources:
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html
- https://ir.amd.com/news-events/press-releases/detail/1053/amd-launches-the-ultimate-gaming-processor-brings

## AMD Ryzen 5 5600X

- Socket: "AM4"
- Cores/threads: "6" / "12"
- Clocks: base "3.7 GHz"; max boost "Up to 4.6 GHz"
- Default TDP: "65W"
- Integrated graphics: no. "Discrete Graphics Card Required"
- Cooler: Thermal Solution (PIB) "AMD Wraith Stealth" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-5-5600x.html). The October 2020 release's table also lists "Wraith Stealth" for the 5600X (https://ir.amd.com/news-events/press-releases/detail/972/amd-launches-amd-ryzen-5000-series-desktop-processors-the).
- Memory: "DDR4"; System Memory Specification "Up to 3200 MT/s". Memory channels, max memory and per-configuration speeds: not stated on this page.
- PCIe: "PCIe® 4.0"
- ECC: not stated (the word "ECC" does not appear on the product page or the spec section of the downloads page)
- Supported chipsets: not stated on the model page (AM4 table: see "Ryzen 5000 Series" column)
- Other identifiers: Former Codename "Vermeer"; L3 "32 MB"; Tjmax "95°C"; Launch Date "11/5/2020"; Product ID Boxed "100-100000065BOX"; Tray "100-000000065"; MPK "100-100000065MPK"
- Sources: product page https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-5-5600x.html. The same values are on https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600x.html.

Sources:
- https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-5-5600x.html
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600x.html
- https://ir.amd.com/news-events/press-releases/detail/972/amd-launches-amd-ryzen-5000-series-desktop-processors-the

## AMD Ryzen 5 5600G

- Socket: "AM4"
- Cores/threads: "6" / "12"
- Clocks: base "3.9 GHz"; max boost "Up to 4.4 GHz"
- Default TDP: "65W"; AMD Configurable TDP (cTDP) "45-65W"
- Integrated graphics: yes. Graphics Model "Radeon™ Graphics"; Graphics Core Count "7"; Graphics Frequency "1900 MHz"
- Cooler: Thermal Solution (PIB) "AMD Wraith Stealth"
- Memory: "DDR4"; Memory Channels "2"; System Memory Specification "Up to 3200 MT/s". Max memory and per-configuration speeds: not stated.
- PCIe: "**PCIe® 3.0**"
- ECC: not stated (no ECC field). The secondary ASUS FAQ has no 5000 G-series row (see B550).
- Supported chipsets: not stated on the model page (AM4 table: "Ryzen 5000 Series" column)
- Other identifiers: Former Codename "Cezanne"; Processor Architecture "Zen 3"; L3 "16 MB"; Tjmax "95°C"; Launch Date "4/13/2021"; Product ID Boxed "100-100000252BOX"; Tray "100-000000252"; MPK "100-100000252MPK"
- Source: https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600g.html. The product page `.../5000-series/amd-ryzen-5-5600g.html` could not be fetched (client error).

Sources:
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600g.html

## AMD Ryzen 7 5700X

- Socket: "AM4"
- Cores/threads: "8" / "16"
- Clocks: base "3.4 GHz"; max boost "Up to 4.6 GHz"
- Default TDP: "65W"
- Integrated graphics: no. "Discrete Graphics Card Required"
- Cooler: Thermal Solution (PIB) "**Not Included**". The 2022 release table also shows "N/A" in the cooler column (https://ir.amd.com/news-events/press-releases/detail/1053/amd-launches-the-ultimate-gaming-processor-brings).
- Memory: "DDR4"; Memory Channels "2"; Max. Memory "128 GB"; Subtype "UDIMM"; System Memory Specification "Up to 3200 MT/s"; Max Memory Speed "2x1R DDR4-3200 2x2R DDR4-3200 4x1R DDR4-2933 4x2R DDR4-2667"
- PCIe: "PCIe® 4.0"; Native PCIe Lanes (Total/Usable) "24 , 20"; Additional Usable PCIe Lanes from Motherboard "X570 16x Gen 4 X470 2x Gen 3, 8x Gen 2"
- ECC: "Yes (Requires mobo support)"
- Supporting Chipsets: "X570 , X470 , X370 , B550 , B450 , B350 , A520" (no A320)
- Other identifiers: Former Codename "Vermeer"; Architecture "Zen 3"; L3 "32 MB"; Tjmax "90°C"; Launch Date "04/04/2022"; Product ID Boxed "100-100000926WOF* , 100-100000926WOZ*" (the asterisk is not explained on the page); Tray "100-000000926"; MPK "100-100000926NPK* , 100-100000926KPK*"
- Source: https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html (fetched twice). The product page `.../5000-series/amd-ryzen-7-5700x.html` failed twice (client error).

Sources:
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html
- https://ir.amd.com/news-events/press-releases/detail/1053/amd-launches-the-ultimate-gaming-processor-brings

## AMD Ryzen 7 5700G

- Socket: "AM4"
- Cores/threads: "8" / "16"
- Clocks: base "3.8 GHz"; max boost "Up to 4.6 GHz"
- Default TDP: "65W"; cTDP "45-65W"
- Integrated graphics: yes. Graphics Model "Radeon™ Graphics"; Graphics Core Count "8"; Graphics Frequency "2000 MHz"
- Cooler: Thermal Solution (PIB) "AMD Wraith Stealth"
- Memory: "DDR4"; Memory Channels "2"; System Memory Specification "Up to 3200 MT/s". Max memory and per-configuration speeds: not stated.
- PCIe: "**PCIe® 3.0**"
- ECC: not stated (no ECC field)
- Supported chipsets: not stated on the model page (AM4 table: "Ryzen 5000 Series" column)
- Other identifiers: Former Codename "Cezanne"; Architecture "Zen 3"; L3 "16 MB"; Tjmax "95°C"; Launch Date "4/13/2021"; Product ID Boxed "100-100000263BOX"; Tray "100-000000263"; MPK "100-100000263MPK"
- Source: https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700g.html (the fetch tool rendered this one as a table and said it restated values). The product page `.../5000-series/amd-ryzen-7-5700g.html` could not be fetched (client error).

Sources:
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700g.html

## AMD Ryzen 7 5800X

- Socket: "AM4" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x.html)
- Cores/threads: "8" / "16" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x.html)
- Clocks: base "3.8 GHz"; max boost "Up to 4.7 GHz" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x.html)
- Default TDP: "**105W**" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x.html)
- Integrated graphics: no. "Discrete Graphics Card Required" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x.html)
- Cooler: Thermal Solution (PIB) "**Not Included**"; Recommended Cooler "Premium air cooler recommended for optimal performance" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x.html)
- Memory: "DDR4"; System Memory Specification "Up to 3200 MT/s". Channels, max memory and per-configuration speeds: not stated. (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x.html)
- PCIe: "PCIe® 4.0" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x.html)
- ECC: not stated (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x.html)
- Supported chipsets: not stated on the model page (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x.html) (AM4 table: "Ryzen 5000 Series" column, https://www.amd.com/en/products/processors/chipsets/am4.html)
- Other identifiers: Former Codename "Vermeer"; L3 "32 MB"; Tjmax "90°C"; Launch Date "11/5/2020"; Product ID Boxed "100-100000063WOF"; Tray "100-000000063" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x.html)

Sources:
- https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-7-5800x.html
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5800x.html (same values)

## AMD Ryzen 9 5900X

- Socket: "AM4" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5900x.html)
- Cores/threads: "12" / "24" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5900x.html)
- Clocks: base "3.7 GHz"; max boost "Up to 4.8 GHz" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5900x.html)
- Default TDP: "105W" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5900x.html)
- Integrated graphics: no. "Discrete Graphics Card Required" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5900x.html)
- Cooler: Thermal Solution (PIB) "Not Included"; Recommended Cooler "Liquid cooler recommended for optimal performance" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5900x.html)
- Memory: "DDR4"; System Memory Specification "Up to 3200 MT/s". Channels, max memory and per-configuration speeds: not stated. (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5900x.html)
- PCIe: "PCIe® 4.0" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5900x.html)
- ECC: not stated (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5900x.html)
- Supported chipsets: not stated on the model page (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5900x.html) (AM4 table: "Ryzen 5000 Series" column, https://www.amd.com/en/products/processors/chipsets/am4.html)
- Other identifiers: Former Codename "Vermeer"; L3 "64 MB"; Tjmax "90°C"; Launch Date "11/5/2020"; Product ID Boxed "100-100000061WOF"; Tray "100-000000061" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5900x.html)

Sources:
- https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5900x.html
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-9-5900x.html (same values)

## AMD Ryzen 9 5950X

- Socket: "AM4" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5950x.html)
- Cores/threads: "16" / "32" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5950x.html)
- Clocks: base "3.4 GHz"; max boost "Up to 4.9 GHz" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5950x.html)
- Default TDP: "105W" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5950x.html)
- Integrated graphics: no. "Discrete Graphics Card Required" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5950x.html)
- Cooler: Thermal Solution (PIB) "Not Included"; Recommended Cooler "Liquid cooler recommended for optimal performance" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5950x.html)
- Memory: "DDR4"; System Memory Specification "Up to 3200 MT/s". Channels, max memory and per-configuration speeds: not stated. (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5950x.html)
- PCIe: "PCIe® 4.0" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5950x.html)
- ECC: not stated (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5950x.html)
- Supported chipsets: not stated on the model page (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5950x.html) (AM4 table: "Ryzen 5000 Series" column, https://www.amd.com/en/products/processors/chipsets/am4.html)
- Other identifiers: Former Codename "Vermeer"; L3 "64 MB"; Tjmax "90°C"; Launch Date "11/5/2020"; Product ID Boxed "100-100000059WOF"; Tray "100-000000059" (https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5950x.html)

Sources:
- https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-9-5950x.html
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-9-5950x.html (same values)

## AMD Ryzen 5 7600

- Socket: "**AM5**" (not AM4) (https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html)
- Cores/threads: "6" / "12" (https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html)
- Clocks: base "3.8 GHz"; max boost "Up to 5.1 GHz" (https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html)
- Default TDP: "65W" (https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html)
- Integrated graphics: yes. Graphics Model "AMD Radeon™ Graphics"; Graphics Core Count "2"; Graphics Frequency "2200 MHz" (https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html)
- Cooler: Thermal Solution (PIB) "AMD Wraith Stealth" (https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html)
- Memory: "**DDR5**"; Memory Channels "2"; Max. Memory "128 GB"; Subtype "UDIMM"; Max Memory Speed (per configuration) "2x1R DDR5-5200", "2x2R DDR5-5200", "4x1R DDR5-3600", "4x2R DDR5-3600" (https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html)
- PCIe: "PCIe® 5.0"; Native PCIe Lanes (Total/Usable) "28 , 24"; Additional Usable PCIe Lanes from Motherboard "X670E 12x Gen4", "X670 12x Gen4", "B650E 8x Gen4", "B650 8x Gen4" (https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html)
- Note: "PCIe® 5.0" above is AMD's CPU figure. AMD's AM5 page shows "PCIe® 4.0" beside the graphics value for B850, B840, X670 and A620 / A620A, and "PCIe® 5.0" for X870E, X870 and X670E (reading the generation as the graphics slot's is an inference from the table layout). The AM5 page has no B650 or B650E row, so AMD's pages give no graphics-slot PCIe generation for B650 or B650E boards, although the 7600 lists both as supporting chipsets (see "AM5 chipsets" above; https://www.amd.com/en/products/processors/chipsets/am5.html).
- ECC: "Yes (Requires mobo support)" (https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html)
- Supporting Chipsets: "A620 , X670E , X670 , B650E , B650 , X870E , X870 , B840 , B850" (https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html)
- Other identifiers: Former Codename "Raphael AM5"; Architecture "Zen 4"; L3 "32 MB"; Tjmax "95°C"; Launch Date "01/14/2023"; Product ID Boxed "100-100001015BOX"; Tray "100-000001015" (https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html)

Sources:
- https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html

## Telling them apart

Only AMD-stated facts. Each line points to the model sections above, which carry the URLs.

- **Read the part number (OPN).** AMD: "The Processor’s Part Number (OPN) and Serial Number (S/N) can be found on the product packaging and on the surface of the processor" (https://www.amd.com/en/resources/support-articles/faqs/PIBRMASD.html). AMD's Serial Number Lookup tool can "obtain the ordering part number (OPN) and packaging type information for AMD Processors" (https://www.amd.com/en/resources/support-articles/faqs/SNV-LUT.html; tool link given there: https://globalcustomercare.amd.com/anonymous/serialnumberquery?lang=EN-US). The OPNs AMD lists:

  | Model | Boxed | Tray |
  |---|---|---|
  | 5600 | 100-100000927BOX | 100-000000927 |
  | 5600X | 100-100000065BOX | 100-000000065 |
  | 5600G | 100-100000252BOX | 100-000000252 |
  | 5700X | 100-100000926WOF / WOZ | 100-000000926 |
  | 5700G | 100-100000263BOX | 100-000000263 |
  | 5800X | 100-100000063WOF | 100-000000063 |
  | 5900X | 100-100000061WOF | 100-000000061 |
  | 5950X | 100-100000059WOF | 100-000000059 |
  | 7600 | 100-100001015BOX | 100-000001015 |

- **Retail box authenticity.** AMD says "Every genuine AMD Ryzen™ and EPYC™ retail package is sealed with a tamper evident security label" and to "Confirm the CPU serial marking in the window match the secured label serial marking." (https://www.amd.com/en/resources/support-articles/warranty/PIB-AUTHENTICITY.html). For non-boxed purchases, "warranty service and questions regarding authenticity will be provided by the point of purchase not AMD" (same page).
- **G = integrated graphics (in this list).** The 5600G and 5700G list "Radeon™ Graphics" (7 and 8 graphics cores). The 5600, 5600X, 5700X, 5800X, 5900X and 5950X all say "Discrete Graphics Card Required".
  - The 7600 (no G) also has graphics ("AMD Radeon™ Graphics", 2 cores), so "no G means no graphics" holds for these AM4 models but not for the AM5 7600.
- **G models are PCIe 3.0 with smaller L3.** 5600G/5700G: "PCIe® 3.0", L3 "16 MB", codename "Cezanne". Non-G 5000 models: "PCIe® 4.0", L3 "32 MB" or "64 MB", codename "Vermeer".
- **5600 vs 5600X.**
  - Base/boost 3.5/4.4 GHz vs 3.7/4.6 GHz.
  - Same "65W" TDP and same "AMD Wraith Stealth" cooler. **AMD does not list a TDP or cooler difference.**
  - Tjmax "90°C" vs "95°C".
  - Launch 04/04/2022 vs 11/5/2020.
  - Different OPNs (927 vs 065).
- **5600X vs 5600G.** Base 3.7 vs 3.9 GHz; boost 4.6 vs 4.4 GHz; graphics none vs Radeon 7-core; PCIe 4.0 vs 3.0; L3 32 MB vs 16 MB.
- **5700X vs 5800X.**
  - 65W vs 105W.
  - Base/boost 3.4/4.6 vs 3.8/4.7 GHz.
  - Neither includes a cooler ("Not Included"). AMD recommends a "Premium air cooler" for the 5800X; no Recommended Cooler field on the 5700X page.
- **5700X vs 5700G.**
  - Cooler "Not Included" vs "AMD Wraith Stealth".
  - Graphics none vs Radeon 8-core.
  - PCIe 4.0 vs 3.0.
  - Base 3.4 vs 3.8 GHz (both boost "Up to 4.6 GHz").
- **5900X vs 5950X.** 12/24 vs 16/32 cores/threads. Both 105W, no cooler, "Liquid cooler recommended".
- **Which box should include a cooler (AMD's Thermal Solution (PIB) line).**
  - Wraith Stealth: 5600, 5600X, 5600G, 5700G, 7600.
  - "Not Included": 5700X, 5800X, 5900X, 5950X.
  - A listing for one of the last four "with stock cooler" is not describing AMD's standard retail box. That is an inference from AMD's field, not an AMD sentence.
- **Socket and memory split the 7600 from the rest.** The 7600 is "AM5" with "DDR5"; all eight 5000-series models here are "AM4" with "DDR4".

Sources:
- https://www.amd.com/en/resources/support-articles/faqs/PIBRMASD.html
- https://www.amd.com/en/resources/support-articles/faqs/SNV-LUT.html
- https://www.amd.com/en/resources/support-articles/warranty/PIB-AUTHENTICITY.html
- The per-model spec pages listed in each CPU section above.
