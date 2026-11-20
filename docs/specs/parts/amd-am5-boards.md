# AMD AM5 chipsets

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

Researched 2026-11-20.

How I read the pages:
- I could not open amd.com directly (the sandbox proxy blocks it), so every AMD page went through a fetch tool. That tool summarises pages and limits each verbatim quote to about 125 characters. I asked it for exact field values and exact phrases each time. Text in "quotes" below is what it said was verbatim. Tables of values are its rendering of the page, checked with a second fetch where noted.
- The amd.com **product** pages for the Ryzen 5 5600, 5600G, Ryzen 7 5700X and 5700G (`/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-...html`) failed with a client error each time. For those models, and as a cross-check for the others, I used AMD's own **Drivers and Downloads** page for the model, which has a "Specifications" section. Some of those pages carry more fields than others (see the ECC and chipset notes).
- I never opened eBay.

## AM5 chipsets

From AMD's AM5 chipset page, https://www.amd.com/en/products/processors/chipsets/am5.html, read through the fetch tool four times with requests for exact wording. Each quote below was returned as verbatim in at least two of those fetches, except the group-header name "Direct Processor PCIe® Lanes", which only one fetch reported.

- Board and CPU compatibility: "With the AMD Ryzen 600 and 800 series chipsets, all AMD Socket AM5 motherboards are compatible with all AMD Socket AM5 processors." The next sentence is "That means you can choose any Socket AM5 board for AMD Ryzen 7000, 8000, and 9000 compatibility." (https://www.amd.com/en/products/processors/chipsets/am5.html)
- BIOS: the page's only BIOS note is "(A BIOS update may be required for Ryzen 8000 and 9000 series processors on 600 series boards.)" It says nothing about a BIOS update for Ryzen 7000 (https://www.amd.com/en/products/processors/chipsets/am5.html).
- Graphics-slot PCIe generation, from the spec table (https://www.amd.com/en/products/processors/chipsets/am5.html). The generation value sits directly after each row's "GRAPHICS" value, under the group header "Direct Processor PCIe® Lanes", and has no column header of its own. Calling it the graphics-slot generation is my reading of that layout, not an AMD label.

  | Chipset (as named in the spec table) | Graphics | PCIe generation |
  |---|---|---|
  | X870E | "1x16 or 2x8" | "PCIe® 5.0" |
  | X870 | "1x16 or 2x8" | "PCIe® 5.0" |
  | B850 | "1x16 or 2x8" | "PCIe® 4.0" |
  | B840 | "1x16" | "PCIe® 4.0" |
  | X670E | "1x16 or 2x8" | "PCIe® 5.0" |
  | X670 | "1x16 or 2x8" | "PCIe® 4.0" |
  | A620 / A620A | "1x16" | "PCIe® 4.0" |
  | PRO 665* | "1x16 or 2x8" | "PCIe® 4.0" (placement uncertain, see below) |
  | PRO 600* | "1x16 or 2x8" | "PCIe® 4.0" (placement uncertain, see below) |

  - For PRO 665 and PRO 600, "PCIe® 4.0" came through at the end of the row rather than next to the graphics value, in two fetches, so which column it belongs to is less certain. (A second check's fetch placed it next to the graphics value, as in the other rows; still treat it as uncertain.) The asterisk note reads "*Only available through system suppliers. Check with your manufacturer for details."
  - The chipset descriptions on the same page agree for X870E and X670E ("PCIe® 5.0 support for both graphics and NVMe") and for X670 ("PCIe® 5.0 support for NVMes", no mention of graphics). The X870 description also says only "PCIe® 5.0 support for NVMes", without mentioning graphics, although the table shows "PCIe® 5.0" beside its graphics value. Nothing else on the page settles X870.
- Memory: DDR5. The page says "with fast DDR5 memory and PCIe® 5.0 on select motherboards", and one spec-table column is "DDR5 MEMORY OVERCLOCKING ENABLED (Supports AMD EXPO™)". "DDR4" does not appear on the page (https://www.amd.com/en/products/processors/chipsets/am5.html).
- ECC: not stated. The word "ECC" does not appear on the AM5 page (https://www.amd.com/en/products/processors/chipsets/am5.html).
- B650 and B650E are not on the AM5 page: the string "B650" does not appear anywhere on it (https://www.amd.com/en/products/processors/chipsets/am5.html). So the page gives no graphics-slot PCIe generation for B650 or B650E boards.
- The Ryzen 5 7600's own AMD page does list supported chipsets: "A620 , X670E , X670 , B650E , B650 , X870E , X870 , B840 , B850" (https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html). That list includes B650E and B650, which the AM5 page leaves out, and does not name A620A, PRO 665 or PRO 600, which the AM5 page lists.

Sources:
- https://www.amd.com/en/products/processors/chipsets/am5.html
- https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html
