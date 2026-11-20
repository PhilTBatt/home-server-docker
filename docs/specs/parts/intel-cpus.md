# Intel Core and Xeon E CPUs

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

Researched 2026-11-20.

How I read the pages (read this before trusting a fact):
- Direct downloads of intel.com were blocked by the sandbox proxy (`curl` got "CONNECT tunnel failed, response 403"), so every Intel page went through a fetch tool. That tool turns a page into text, answers questions about it and limits each verbatim quote to about 125 characters. Each time I asked it for exact labels and values. Text in "quotes" below is what the tool returned as verbatim. Where the tool said it had paraphrased, I mark it **(tool paraphrase)**.
- intel.com product pages (the old "ARK") have separate tabs: `/specifications.html`, `/compatible.html` (the "Compatible Products" list) and `/ordering.html`. I read each one separately. Counts of processors in a compatible list are the fetch tool's counts.
- **No Intel chipset spec page I read has a "Memory Types" field.** The fetch tool found no "DDR4", "DDR5" or "Memory Types" text anywhere on the Z790 page or the H610 page when I asked it to look specifically, and it reported the field absent on all the others. So "Intel's spec lists DDR4 and DDR5 for the chipset" is **not** what these pages show. Intel lists DDR4 and DDR5 on the **processor** pages and in support articles. Details in each section.
- "not stated" means it was not in what I read. Anything marked "(from memory, unchecked)" is not from a source. I never opened eBay.

## Shared Intel statements for the CPU sections

- **Coolers in the box:**
  - Intel article 000005940 (Last Reviewed 03/11/2026): "All Intel® Core™ and Intel® Core™ Ultra Desktop Processors that have the letters K, KF, KS, XE, or X" / "in their number are not shipped with Intel® Thermal Solution (fan heatsink)." ([KB5940])
  - Intel article 000089190, "Intel® Laminar RM1 Cooler Specifications for Intel® Core Processors 12th, 13th and 14th Generation" (Last Reviewed 12/16/2024). Its 12th gen list is "i7-12700, i7-12700F, i5-12600, i5-12500, i5-12400, i5-12400F, i3-12100, and i3-12100F." It says the cooler "is shipped with the box" and "is not sold separately to end-users." ([KB89190])
  - Intel's RS1 article ("Intel® Laminar RS1 Cooler Specifications", Last Reviewed 01/03/2025) says the RS1 was discontinued and is replaced by the RM1 in boxed Pentium G7400 and Celeron G6900: "As a result of product discontinuance, the Intel® Laminar Cooler RS1 will be replaced with" / "Intel® Laminar Cooler RM1" / "when shipped in box with Pentium G7400 and Celeron G6900 processors." ([KB89192])
  - I found no Intel statement naming a cooler for the boxed 8th/9th gen non-K parts.
- **"Thermal Solution Specification"** on spec pages (for example "PCG 2015C (65W)" or "PCG 2020C") is a thermal design class. The page does not say a cooler is included.
- **Ordering pages:** the boxed SKUs on the i5-8500, i5-12400 and i7-12700K ordering pages are under "Retired and discontinued". None of those pages mentions a cooler ([ORD]).
- **F-suffix (no graphics):**
  - Intel article 000027144 (Last Reviewed 03/11/2026): "Intel® Core® processors ending with the letter F (starting with 9th Generation Intel® Desktop Processors)" … "do not have Intel® Processors Graphics." Its 12th gen list includes the i5-12400F and i7-12700F ([KB27144]).
  - Intel article 000058567 gives the F suffix meaning as "Requires discrete graphics" ([KB58567]).

Sources:
- [KB5940] https://www.intel.com/content/www/us/en/support/articles/000005940.html
- [KB89190] https://www.intel.com/content/www/us/en/support/articles/000089190.html
- [KB89192] https://www.intel.com/content/www/us/en/support/articles/000089192.html
- [KB27144] https://www.intel.com/content/www/us/en/support/articles/000027144.html
- [KB58567] https://www.intel.com/content/www/us/en/support/articles/000058567.html
- [ORD] e.g. https://www.intel.com/content/www/us/en/products/sku/129939/intel-core-i58500-processor-9m-cache-up-to-4-10-ghz/ordering.html, https://www.intel.com/content/www/us/en/products/sku/134586/intel-core-i512400-processor-18m-cache-up-to-4-40-ghz/ordering.html, https://www.intel.com/content/www/us/en/products/sku/134594/intel-core-i712700k-processor-25m-cache-up-to-5-00-ghz/ordering.html

## Intel Core i5-8500

- **Family / launch:** "8th Generation Intel® Core™ i5 Processors", "Products formerly Coffee Lake", Launch Date "Q2'18" ([SPEC]).
- **Socket:** "FCLGA1151" ([SPEC]).
- **Cores / threads:** 6 / 6. Hyper-Threading "No" ([SPEC]).
- **Clocks:** base 3.00 GHz, max turbo 4.10 GHz ([SPEC]).
- **Power:** "TDP": "65 W". The page has no base power or max turbo power fields ([SPEC]).
- **Integrated graphics:** yes, "Intel® UHD Graphics 630" ([SPEC]).
- **Memory:** "DDR4-2666". Max memory size "128 GB". "Max # of Memory Channels": "2". "ECC Memory Supported": "No" ([SPEC]).
- **PCIe:** "3.0". "Up to 1x16, 2x8, 1x8+2x4". "Max # of PCI Express Lanes": "16" ([SPEC]).
- **Cooler:** not stated. "Thermal Solution Specification": "PCG 2015C (65W)" ([SPEC]). I found no Intel statement naming a cooler for the boxed 8th/9th gen non-K parts. The ordering page lists the boxed SKUs under "Retired and discontinued" and does not mention a cooler ([ORD]).
- **Compatible chipsets (Intel's list):** "Intel® B365 Chipset", "Intel® H370 Chipset", "Intel® B360 Chipset", "Intel® H310 Chipset" and "Intel® Z370 Chipset". **Z390 and Q370 are not in this list** ([COMP]), and their chipset lists leave out the i5-8500 too ([Q370C], [Z390C]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/129939/intel-core-i58500-processor-9m-cache-up-to-4-10-ghz/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/129939/intel-core-i58500-processor-9m-cache-up-to-4-10-ghz/compatible.html
- [ORD] https://www.intel.com/content/www/us/en/products/sku/129939/intel-core-i58500-processor-9m-cache-up-to-4-10-ghz/ordering.html
- [Q370C] https://www.intel.com/content/www/us/en/products/sku/133282/intel-q370-chipset/compatible.html
- [Z390C] https://www.intel.com/content/www/us/en/products/sku/133293/intel-z390-chipset/compatible.html

## Intel Core i5-9500

- **Family / launch:** "9th Generation Intel® Core™ i5 Processors", "Products formerly Coffee Lake", Launch Date "Q2'19" ([SPEC]).
- **Socket:** "FCLGA1151" ([SPEC]).
- **Cores / threads:** 6 / 6 ([SPEC]).
- **Clocks:** base 3.00 GHz, max turbo 4.40 GHz ([SPEC]).
- **Power:** "TDP": "65 W". No base power or max turbo power fields ([SPEC]).
- **Integrated graphics:** yes, "Intel® UHD Graphics 630" ([SPEC]).
- **Memory:** "DDR4-2666", 128 GB max, 2 channels, "ECC Memory Supported": "No" ([SPEC]).
- **PCIe:** "3.0", "Up to 1x16, 2x8, 1x8+2x4", 16 lanes ([SPEC]).
- **Cooler:** not stated. "Thermal Solution Specification": "PCG 2015C (65W)" ([SPEC]).
- **Compatible chipsets (Intel's list):** B365, Z390, Q370, H370, B360, H310, Z370, all under "Intel® 300 Series Desktop Chipsets" ([COMP]).
- **BIOS:** this is a 9th gen part, so Intel's 300-series note applies: boards "may need a BIOS update" ([KB25694]) or "may require a BIOS update … in order to boot" ([KB33135]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/134895/intel-core-i59500-processor-9m-cache-up-to-4-40-ghz/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/134895/intel-core-i59500-processor-9m-cache-up-to-4-40-ghz/compatible.html
- [KB25694] https://www.intel.com/content/www/us/en/support/articles/000025694.html
- [KB33135] https://www.intel.com/content/www/us/en/support/articles/000033135.html

## Intel Core i7-8700

- **Family / launch:** "8th Generation Intel® Core™ i7 Processors", "Products formerly Coffee Lake", Launch Date "Q4'17" ([SPEC]).
- **Socket:** "FCLGA1151" ([SPEC]).
- **Cores / threads:** 6 / 12. Hyper-Threading "Yes" ([SPEC]).
- **Clocks:** base 3.20 GHz, max turbo 4.60 GHz ([SPEC]).
- **Power:** "TDP": "65 W". No base power or max turbo power fields ([SPEC]).
- **Integrated graphics:** yes, "Intel® UHD Graphics 630" ([SPEC]).
- **Memory:** "DDR4-2666", 128 GB max, 2 channels, "ECC Memory Supported‡": "No" ([SPEC]).
- **PCIe:** "3.0", "Up to 1x16, 2x8, 1x8+2x4", 16 lanes ([SPEC]).
- **Cooler:** not stated. "Thermal Solution Specification": "PCG 2015C (65W)" ([SPEC]).
- **Compatible chipsets (Intel's list):** B365, Z390, Q370, H370, B360, H310, Z370 ([COMP]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/126686/intel-core-i78700-processor-12m-cache-up-to-4-60-ghz/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/126686/intel-core-i78700-processor-12m-cache-up-to-4-60-ghz/compatible.html

## Intel Core i7-9700

- **Family / launch:** "9th Generation Intel® Core™ i7 Processors", "Products formerly Coffee Lake", Launch Date "Q2'19" ([SPEC]).
- **Socket:** "FCLGA1151" ([SPEC]).
- **Cores / threads:** 8 / 8 ([SPEC]).
- **Clocks:** base 3.00 GHz, max turbo 4.70 GHz ([SPEC]).
- **Power:** "TDP": "65 W". No base power or max turbo power fields ([SPEC]).
- **Integrated graphics:** yes, "Intel® UHD Graphics 630" ([SPEC]).
- **Memory:** "DDR4-2666", 128 GB max, 2 channels, "ECC Memory Supported ‡": "No" ([SPEC]).
- **PCIe:** "3.0", "Up to 1x16, 2x8, 1x8+2x4", 16 lanes ([SPEC]).
- **Cooler:** not stated. "Thermal Solution Specification": "PCG 2015C (65W)" ([SPEC]).
- **Compatible chipsets (Intel's list):** B365, Z390, Q370, H370, B360, H310, Z370 ([COMP]).
- **BIOS:** a 9th gen part, so the same 300-series BIOS note as the i5-9500 applies ([KB25694], [KB33135]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/191792/intel-core-i79700-processor-12m-cache-up-to-4-70-ghz/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/191792/intel-core-i79700-processor-12m-cache-up-to-4-70-ghz/compatible.html
- [KB25694] https://www.intel.com/content/www/us/en/support/articles/000025694.html
- [KB33135] https://www.intel.com/content/www/us/en/support/articles/000033135.html

## Intel Core i5-12400

- **Family / launch:** "12th Generation Intel® Core™ i5 Processors", "Products formerly Alder Lake", Launch Date "Q1'22" ([SPEC]).
- **Socket:** "FCLGA1700" ([SPEC]).
- **Cores / threads:** 6 cores (6 P-cores, 0 E-cores), 12 threads ([SPEC]).
- **Clocks:** P-core base 2.50 GHz, max turbo 4.40 GHz ([SPEC]).
- **Power:** "Processor Base Power": "65 W". "Maximum Turbo Power": "117 W". There is no TDP field ([SPEC]).
- **Integrated graphics:** yes, "Intel® UHD Graphics 730" (24 execution units, outputs "eDP 1.4b, DP 1.4a, HDMI 2.1") ([SPEC]).
- **Memory:**
  - "Up to DDR5 4800 MT/s" and "Up to DDR4 3200 MT/s". 128 GB max. 2 channels. Max bandwidth "76.8 GB/s" ([SPEC]).
  - One type per system: "Mix of technologies in one system is not allowed." ([DS12])
- **ECC:**
  - **Not stated.** The page has no ECC field. The only "ECC" on it is inside "ECCN" in the legal note ([SPEC]). A skill should report "not stated", not "No".
  - Intel: "Note that ECC memory support requires both processor and chipset support." ([KB96922])
  - Of the chipsets on this CPU's compatible list, only W680 says "ECC Memory Supported ‡": "Yes" ([W680]). H770, B760, Z790, Q670, H610, H670, B660, H610E and Z690 say "No" ([H770], [B760], [Z790], [Q670], [H610], [H670], [B660], [H610E], [Z690]).
  - None of the Intel pages read for this file says whether ECC works with this CPU on any board (inference from what was read, not stated by Intel). For a similar case, the i5-12600KF, whose spec page also has no ECC field ([I512600KF]), an Intel Customer Support Engineer wrote: "I have reviewed the specifications of the Intel® Core™ i5-12600KF Processor, and it does not support ECC." ([FORUMECC], forum reply by NormanS_Intel, 16 Dec 2024; about the i5-12600KF, not this CPU.) A skill should report ECC as "not stated" and should not suggest that it will work.
- **PCIe:** "5.0 and 4.0", "Up to 1x16+4, 2x8+4", 20 lanes ([SPEC]).
- **Cooler:**
  - The spec page says nothing. "Thermal Solution Specification": "PCG 2020C" ([SPEC]).
  - Intel's RM1 article lists the i5-12400 as shipping with the Laminar RM1 in the box ([KB89190]).
  - The ordering page shows boxed SKUs BX8071512400 in both C0 (SRL4V) and H0 (SRL5Y) steppings, under "Retired and discontinued" ([ORD]).
- **Compatible chipsets (Intel's list):** 700 series H770, B760, Z790; 600 series W680, Q670, H610, H670, B660, H610E, Z690 ([COMP]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/134586/intel-core-i512400-processor-18m-cache-up-to-4-40-ghz/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/134586/intel-core-i512400-processor-18m-cache-up-to-4-40-ghz/compatible.html
- [ORD] https://www.intel.com/content/www/us/en/products/sku/134586/intel-core-i512400-processor-18m-cache-up-to-4-40-ghz/ordering.html
- [KB89190] https://www.intel.com/content/www/us/en/support/articles/000089190.html
- [DS12] https://cdrdv2-public.intel.com/655258/655258-011.pdf
- [KB96922] https://www.intel.com/content/www/us/en/support/articles/000096922.html
- [W680] https://www.intel.com/content/www/us/en/products/sku/218834/intel-w680-chipset/specifications.html
- [H770] https://www.intel.com/content/www/us/en/products/sku/229720/intel-h770-chipset/specifications.html
- [B760] https://www.intel.com/content/www/us/en/products/sku/229719/intel-b760-chipset/specifications.html
- [Z790] https://www.intel.com/content/www/us/en/products/sku/229721/intel-z790-chipset/specifications.html
- [Q670] https://www.intel.com/content/www/us/en/products/sku/218827/intel-q670-chipset/specifications.html
- [H610] https://www.intel.com/content/www/us/en/products/sku/218829/intel-h610-chipset/specifications.html
- [H670] https://www.intel.com/content/www/us/en/products/sku/218831/intel-h670-chipset/specifications.html
- [B660] https://www.intel.com/content/www/us/en/products/sku/218832/intel-b660-chipset/specifications.html
- [H610E] https://www.intel.com/content/www/us/en/products/sku/225973/intel-h610e-chipset/specifications.html
- [Z690] https://www.intel.com/content/www/us/en/products/sku/218833/intel-z690-chipset/specifications.html
- [FORUMECC] https://community.intel.com/t5/Mobile-and-Desktop-Processors/i5-12600KF-ECC-Support/m-p/1649727 (thread "i5-12600KF ECC Support"; reply by NormanS_Intel, "Intel Customer Support Engineer", December 16, 2024)
- [I512600KF] https://www.intel.com/content/www/us/en/products/sku/134590/intel-core-i512600kf-processor-20m-cache-up-to-4-90-ghz/specifications.html (no "ECC Memory Supported" field; the only "ECC" on the page is in "ECCN" in the legal text)

## Intel Core i5-12400F

- **Family / launch:** "12th Generation Intel® Core™ i5 Processors", Launch Date "Q1'22" ([SPEC]).
- **Socket:** "FCLGA1700" ([SPEC]).
- **Cores / threads:** 6 (6 P-cores, 0 E-cores) / 12 ([SPEC]).
- **Clocks:** P-core base 2.50 GHz, max turbo 4.40 GHz ([SPEC]).
- **Power:** "Processor Base Power": "65 W". "Maximum Turbo Power": "117 W" ([SPEC]).
- **Integrated graphics:**
  - **None.** The spec page has no graphics field ([SPEC]).
  - Intel's no-graphics list includes the i5-12400F ([KB27144]).
  - The F suffix means "Requires discrete graphics" ([KB58567]).
- **Memory:** "Up to DDR5 4800 MT/s" and "Up to DDR4 3200 MT/s", 128 GB max, 2 channels ([SPEC]).
- **ECC:**
  - **Not stated.** The page has no ECC field, and the only "ECC" on it is inside "ECCN" in the legal note ([SPEC]). A skill should report "not stated", not "No".
  - Intel: "Note that ECC memory support requires both processor and chipset support." ([KB96922])
  - Of the chipsets on this CPU's compatible list, only W680 says "ECC Memory Supported ‡": "Yes" ([W680]). B760, H770, Z790, Q670, H610, H670, B660 and Z690 say "No" ([B760], [H770], [Z790], [Q670], [H610], [H670], [B660], [Z690]).
  - None of the Intel pages read for this file says whether ECC works with this CPU on any board (inference from what was read, not stated by Intel). For a similar case, the i5-12600KF, whose spec page also has no ECC field ([I512600KF]), an Intel Customer Support Engineer wrote: "I have reviewed the specifications of the Intel® Core™ i5-12600KF Processor, and it does not support ECC." ([FORUMECC], forum reply by NormanS_Intel, 16 Dec 2024; about the i5-12600KF, not this CPU.) A skill should report ECC as "not stated" and should not suggest that it will work.
- **PCIe:** "5.0 and 4.0", "Up to 1x16+4, 2x8+4", 20 lanes ([SPEC]).
- **Cooler:** the spec page says nothing ("PCG 2020C"). Intel's RM1 article lists the i5-12400F as boxed with the Laminar RM1 ([KB89190]).
- **Compatible chipsets (Intel's list):** B760, H770, Z790; W680, Q670, H610, H670, B660, Z690. Unlike the i5-12400 list, this one has no H610E ([COMP]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/134587/intel-core-i512400f-processor-18m-cache-up-to-4-40-ghz/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/134587/intel-core-i512400f-processor-18m-cache-up-to-4-40-ghz/compatible.html
- [KB89190] https://www.intel.com/content/www/us/en/support/articles/000089190.html
- [KB27144] https://www.intel.com/content/www/us/en/support/articles/000027144.html
- [KB58567] https://www.intel.com/content/www/us/en/support/articles/000058567.html
- [KB96922] https://www.intel.com/content/www/us/en/support/articles/000096922.html
- [W680] https://www.intel.com/content/www/us/en/products/sku/218834/intel-w680-chipset/specifications.html
- [B760] https://www.intel.com/content/www/us/en/products/sku/229719/intel-b760-chipset/specifications.html
- [H770] https://www.intel.com/content/www/us/en/products/sku/229720/intel-h770-chipset/specifications.html
- [Z790] https://www.intel.com/content/www/us/en/products/sku/229721/intel-z790-chipset/specifications.html
- [Q670] https://www.intel.com/content/www/us/en/products/sku/218827/intel-q670-chipset/specifications.html
- [H610] https://www.intel.com/content/www/us/en/products/sku/218829/intel-h610-chipset/specifications.html
- [H670] https://www.intel.com/content/www/us/en/products/sku/218831/intel-h670-chipset/specifications.html
- [B660] https://www.intel.com/content/www/us/en/products/sku/218832/intel-b660-chipset/specifications.html
- [Z690] https://www.intel.com/content/www/us/en/products/sku/218833/intel-z690-chipset/specifications.html
- [FORUMECC] https://community.intel.com/t5/Mobile-and-Desktop-Processors/i5-12600KF-ECC-Support/m-p/1649727 (thread "i5-12600KF ECC Support"; reply by NormanS_Intel, "Intel Customer Support Engineer", December 16, 2024)
- [I512600KF] https://www.intel.com/content/www/us/en/products/sku/134590/intel-core-i512600kf-processor-20m-cache-up-to-4-90-ghz/specifications.html (no "ECC Memory Supported" field; the only "ECC" on the page is in "ECCN" in the legal text)

## Intel Core i5-12600K

- **Family / launch:** "12th Generation Intel® Core™ i5 Processors", Launch Date "Q4'21" ([SPEC]).
- **Socket:** "FCLGA1700" ([SPEC]).
- **Cores / threads:** 10 (6 P-cores, 4 E-cores) / 16 ([SPEC]).
- **Clocks:** P-core base 3.70 GHz, max turbo 4.90 GHz ([SPEC]).
- **Power:** "Processor Base Power": "125 W". "Maximum Turbo Power": "150 W" ([SPEC]).
- **Integrated graphics:** yes, "Intel® UHD Graphics 770" ([SPEC]).
- **Memory:** "Up to DDR5 4800 MT/s" and "Up to DDR4 3200 MT/s", 128 GB max, 2 channels ([SPEC]).
- **ECC:**
  - "ECC Memory Supported": "Yes" ([SPEC]).
  - Intel: "Note that ECC memory support requires both processor and chipset support." ([KB96922])
  - Of the chipsets on this CPU's compatible list, only W680 says "ECC Memory Supported ‡": "Yes" ([W680]). B760, H770, Z790, Q670, H610, H670, B660 and Z690 say "No" ([B760], [H770], [Z790], [Q670], [H610], [H670], [B660], [Z690]).
  - The page itself does not name a chipset needed for ECC. So ECC needs a W680 board (inference, not stated by Intel: this joins KB96922 with the chipset pages; no single Intel sentence says it). Intel's article on Core i5 desktop processors adds: "If your processor is supporting ECC, you need to check with your motherboard vendor if they are also supporting it." ([KB6047])
- **PCIe:** "5.0 and 4.0", "Up to 1x16+4, 2x8+4", 20 lanes ([SPEC]).
- **Cooler:** **no cooler.** It is a K part, and Intel says those are "not shipped with Intel® Thermal Solution (fan heatsink)" ([KB5940]). "Thermal Solution Specification": "PCG 2020A" ([SPEC]).
- **Overclocking:** the spec page has no unlocked/overclocking statement (tool reported none). Intel's chipset pages list CPU ("IA") overclocking only for Z690 and Z790 ([Z690], [Z790]).
- **Compatible chipsets (Intel's list):** B760, H770, Z790; W680, Q670, H610, H670, B660, Z690 ([COMP]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/134589/intel-core-i512600k-processor-20m-cache-up-to-4-90-ghz/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/134589/intel-core-i512600k-processor-20m-cache-up-to-4-90-ghz/compatible.html
- [KB5940] https://www.intel.com/content/www/us/en/support/articles/000005940.html
- [Z690] https://www.intel.com/content/www/us/en/products/sku/218833/intel-z690-chipset/specifications.html
- [Z790] https://www.intel.com/content/www/us/en/products/sku/229721/intel-z790-chipset/specifications.html
- [KB96922] https://www.intel.com/content/www/us/en/support/articles/000096922.html
- [W680] https://www.intel.com/content/www/us/en/products/sku/218834/intel-w680-chipset/specifications.html
- [B760] https://www.intel.com/content/www/us/en/products/sku/229719/intel-b760-chipset/specifications.html
- [H770] https://www.intel.com/content/www/us/en/products/sku/229720/intel-h770-chipset/specifications.html
- [Q670] https://www.intel.com/content/www/us/en/products/sku/218827/intel-q670-chipset/specifications.html
- [H610] https://www.intel.com/content/www/us/en/products/sku/218829/intel-h610-chipset/specifications.html
- [H670] https://www.intel.com/content/www/us/en/products/sku/218831/intel-h670-chipset/specifications.html
- [B660] https://www.intel.com/content/www/us/en/products/sku/218832/intel-b660-chipset/specifications.html
- [KB6047] https://www.intel.com/content/www/us/en/support/articles/000006047/processors.html ("Information about Intel® Core™ i5 Desktop Processors", Last Reviewed 02/06/2025, section "Error Correction Code (ECC) memory support")

## Intel Core i7-12700

- **Family / launch:** "12th Generation Intel® Core™ i7 Processors", Launch Date "Q1'22" ([SPEC]).
- **Socket:** "FCLGA1700" ([SPEC]).
- **Cores / threads:** 12 (8 P-cores, 4 E-cores) / 20 ([SPEC]).
- **Clocks:** P-core base 2.10 GHz, max turbo 4.90 GHz ([SPEC]).
- **Power:** "Processor Base Power": "65 W". "Maximum Turbo Power": "180 W" ([SPEC]).
- **Integrated graphics:** yes, "Intel® UHD Graphics 770" ([SPEC]).
- **Memory:** "Up to DDR5 4800 MT/s" and "Up to DDR4 3200 MT/s", 128 GB max, 2 channels ([SPEC]).
- **ECC:**
  - "ECC Memory Supported": "Yes" ([SPEC]).
  - Intel: "Note that ECC memory support requires both processor and chipset support." ([KB96922])
  - Of the chipsets on this CPU's compatible list, only W680 says "ECC Memory Supported ‡": "Yes" ([W680]). H770, B760, Z790, Q670, H610, H670, B660, H610E and Z690 say "No" ([H770], [B760], [Z790], [Q670], [H610], [H670], [B660], [H610E], [Z690]).
  - The page itself does not name a chipset needed for ECC. So ECC needs a W680 board (inference, not stated by Intel: this joins KB96922 with the chipset pages; no single Intel sentence says it). Intel's article on Core i7 desktop processors adds: "If your processor is supporting ECC, you need to check with your motherboard vendor to see if they are also supporting it." ([KB6778])
- **PCIe:** "5.0 and 4.0", "Up to 1x16+4, 2x8+4", 20 lanes ([SPEC]).
- **Cooler:** the spec page says nothing ("PCG 2020C"). Intel's RM1 article lists the i7-12700 as boxed with the Laminar RM1 ([KB89190]).
- **Compatible chipsets (Intel's list):** H770, B760, Z790; W680, Q670, H610, H670, B660, H610E, Z690 ([COMP]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/134591/intel-core-i712700-processor-25m-cache-up-to-4-90-ghz/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/134591/intel-core-i712700-processor-25m-cache-up-to-4-90-ghz/compatible.html
- [KB89190] https://www.intel.com/content/www/us/en/support/articles/000089190.html
- [KB96922] https://www.intel.com/content/www/us/en/support/articles/000096922.html
- [W680] https://www.intel.com/content/www/us/en/products/sku/218834/intel-w680-chipset/specifications.html
- [H770] https://www.intel.com/content/www/us/en/products/sku/229720/intel-h770-chipset/specifications.html
- [B760] https://www.intel.com/content/www/us/en/products/sku/229719/intel-b760-chipset/specifications.html
- [Z790] https://www.intel.com/content/www/us/en/products/sku/229721/intel-z790-chipset/specifications.html
- [Q670] https://www.intel.com/content/www/us/en/products/sku/218827/intel-q670-chipset/specifications.html
- [H610] https://www.intel.com/content/www/us/en/products/sku/218829/intel-h610-chipset/specifications.html
- [H670] https://www.intel.com/content/www/us/en/products/sku/218831/intel-h670-chipset/specifications.html
- [B660] https://www.intel.com/content/www/us/en/products/sku/218832/intel-b660-chipset/specifications.html
- [H610E] https://www.intel.com/content/www/us/en/products/sku/225973/intel-h610e-chipset/specifications.html
- [Z690] https://www.intel.com/content/www/us/en/products/sku/218833/intel-z690-chipset/specifications.html
- [KB6778] https://www.intel.com/content/www/us/en/support/articles/000006778/processors.html ("Information about Intel® Core™ i7 Desktop Processors", Last Reviewed 03/26/2025, under "Memory", "Error Correction Code (ECC) for memory")

## Intel Core i7-12700K

- **Family / launch:** "12th Generation Intel® Core™ i7 Processors", Launch Date "Q4'21" ([SPEC]).
- **Socket:** "FCLGA1700" ([SPEC]).
- **Cores / threads:** 12 (8 P-cores, 4 E-cores) / 20 ([SPEC]).
- **Clocks:** P-core base 3.60 GHz, max turbo 5.00 GHz ([SPEC]).
- **Power:** "Processor Base Power": "125 W". "Maximum Turbo Power": "190 W" ([SPEC]).
- **Integrated graphics:** yes, "Intel® UHD Graphics 770" ([SPEC]).
- **Memory:** "Up to DDR5 4800 MT/s" and "Up to DDR4 3200 MT/s", 128 GB max, 2 channels ([SPEC]).
- **ECC:**
  - "ECC Memory Supported": "Yes" ([SPEC]).
  - Intel: "Note that ECC memory support requires both processor and chipset support." ([KB96922])
  - Of the chipsets on this CPU's compatible list, only W680 says "ECC Memory Supported ‡": "Yes" ([W680]). B760, H770, Z790, Q670, H610, H670, B660 and Z690 say "No" ([B760], [H770], [Z790], [Q670], [H610], [H670], [B660], [Z690]).
  - The page itself does not name a chipset needed for ECC. So ECC needs a W680 board (inference, not stated by Intel: this joins KB96922 with the chipset pages; no single Intel sentence says it). Intel's article on Core i7 desktop processors adds: "If your processor is supporting ECC, you need to check with your motherboard vendor to see if they are also supporting it." ([KB6778])
- **PCIe:** "5.0 and 4.0", "Up to 1x16+4, 2x8+4", 20 lanes ([SPEC]).
- **Cooler:**
  - **No cooler.** It is a K part ([KB5940]). "Thermal Solution Specification": "PCG 2020A" ([SPEC]).
  - The ordering page lists the tray SKU CM8071504553828 and boxed SKUs BX8071512700K and BXC8071512700K (both "Retired and discontinued"). It says nothing about a cooler ([ORD]).
- **Compatible chipsets (Intel's list):** B760, H770, Z790, W680, Q670, H610, H670, B660, Z690 ([COMP]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/134594/intel-core-i712700k-processor-25m-cache-up-to-5-00-ghz/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/134594/intel-core-i712700k-processor-25m-cache-up-to-5-00-ghz/compatible.html
- [ORD] https://www.intel.com/content/www/us/en/products/sku/134594/intel-core-i712700k-processor-25m-cache-up-to-5-00-ghz/ordering.html
- [KB5940] https://www.intel.com/content/www/us/en/support/articles/000005940.html
- [KB96922] https://www.intel.com/content/www/us/en/support/articles/000096922.html
- [W680] https://www.intel.com/content/www/us/en/products/sku/218834/intel-w680-chipset/specifications.html
- [B760] https://www.intel.com/content/www/us/en/products/sku/229719/intel-b760-chipset/specifications.html
- [H770] https://www.intel.com/content/www/us/en/products/sku/229720/intel-h770-chipset/specifications.html
- [Z790] https://www.intel.com/content/www/us/en/products/sku/229721/intel-z790-chipset/specifications.html
- [Q670] https://www.intel.com/content/www/us/en/products/sku/218827/intel-q670-chipset/specifications.html
- [H610] https://www.intel.com/content/www/us/en/products/sku/218829/intel-h610-chipset/specifications.html
- [H670] https://www.intel.com/content/www/us/en/products/sku/218831/intel-h670-chipset/specifications.html
- [B660] https://www.intel.com/content/www/us/en/products/sku/218832/intel-b660-chipset/specifications.html
- [Z690] https://www.intel.com/content/www/us/en/products/sku/218833/intel-z690-chipset/specifications.html
- [KB6778] https://www.intel.com/content/www/us/en/support/articles/000006778/processors.html ("Information about Intel® Core™ i7 Desktop Processors", Last Reviewed 03/26/2025, under "Memory", "Error Correction Code (ECC) for memory")

## Intel Core i7-12700F

- **Family / launch:** "12th Generation Intel® Core™ i7 Processors", Launch Date "Q1'22" ([SPEC]).
- **Socket:** "FCLGA1700" ([SPEC]).
- **Cores / threads:** 12 (8 P-cores, 4 E-cores) / 20 ([SPEC]).
- **Clocks:** P-core base 2.10 GHz, max turbo 4.90 GHz ([SPEC]).
- **Power:** "Processor Base Power": "65 W". "Maximum Turbo Power": "180 W" ([SPEC]).
- **Integrated graphics:** **none.** The spec page has no graphics field ([SPEC]). The i7-12700F is in Intel's no-graphics list ([KB27144]), and the F suffix means "Requires discrete graphics" ([KB58567]).
- **Memory:** "Up to DDR5 4800 MT/s" and "Up to DDR4 3200 MT/s", 128 GB max, 2 channels, max bandwidth "76.8 GB/s" ([SPEC]).
- **ECC:**
  - **Not stated.** The page has no ECC field. The only "ECC" on it is inside "ECCN" in the legal note ([SPEC]). A skill should report "not stated", not "No". The i7-12700 page says "Yes", so the two pages differ ([I712700]).
  - Intel: "Note that ECC memory support requires both processor and chipset support." ([KB96922])
  - Of the chipsets on this CPU's compatible list, only W680 says "ECC Memory Supported ‡": "Yes" ([W680]). B760, H770, Z790, Q670, H610, H670, B660 and Z690 say "No" ([B760], [H770], [Z790], [Q670], [H610], [H670], [B660], [Z690]).
  - None of the Intel pages read for this file says whether ECC works with this CPU on any board (inference from what was read, not stated by Intel). For a similar case, the i5-12600KF, whose spec page also has no ECC field ([I512600KF]), an Intel Customer Support Engineer wrote: "I have reviewed the specifications of the Intel® Core™ i5-12600KF Processor, and it does not support ECC." ([FORUMECC], forum reply by NormanS_Intel, 16 Dec 2024; about the i5-12600KF, not this CPU.) A skill should report ECC as "not stated" and should not suggest that it will work.
- **PCIe:** "5.0 and 4.0", "Up to 1x16+4, 2x8+4", 20 lanes ([SPEC]).
- **Cooler:** the spec page says nothing ("PCG 2020C"). Intel's RM1 article lists the i7-12700F as boxed with the Laminar RM1 ([KB89190]).
- **Compatible chipsets (Intel's list):** B760, H770, Z790; W680, Q670, H610, H670, B660, Z690 ([COMP]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/134592/intel-core-i712700f-processor-25m-cache-up-to-4-90-ghz/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/134592/intel-core-i712700f-processor-25m-cache-up-to-4-90-ghz/compatible.html
- [I712700] https://www.intel.com/content/www/us/en/products/sku/134591/intel-core-i712700-processor-25m-cache-up-to-4-90-ghz/specifications.html
- [KB89190] https://www.intel.com/content/www/us/en/support/articles/000089190.html
- [KB27144] https://www.intel.com/content/www/us/en/support/articles/000027144.html
- [KB58567] https://www.intel.com/content/www/us/en/support/articles/000058567.html
- [KB96922] https://www.intel.com/content/www/us/en/support/articles/000096922.html
- [W680] https://www.intel.com/content/www/us/en/products/sku/218834/intel-w680-chipset/specifications.html
- [B760] https://www.intel.com/content/www/us/en/products/sku/229719/intel-b760-chipset/specifications.html
- [H770] https://www.intel.com/content/www/us/en/products/sku/229720/intel-h770-chipset/specifications.html
- [Z790] https://www.intel.com/content/www/us/en/products/sku/229721/intel-z790-chipset/specifications.html
- [Q670] https://www.intel.com/content/www/us/en/products/sku/218827/intel-q670-chipset/specifications.html
- [H610] https://www.intel.com/content/www/us/en/products/sku/218829/intel-h610-chipset/specifications.html
- [H670] https://www.intel.com/content/www/us/en/products/sku/218831/intel-h670-chipset/specifications.html
- [B660] https://www.intel.com/content/www/us/en/products/sku/218832/intel-b660-chipset/specifications.html
- [Z690] https://www.intel.com/content/www/us/en/products/sku/218833/intel-z690-chipset/specifications.html
- [FORUMECC] https://community.intel.com/t5/Mobile-and-Desktop-Processors/i5-12600KF-ECC-Support/m-p/1649727 (thread "i5-12600KF ECC Support"; reply by NormanS_Intel, "Intel Customer Support Engineer", December 16, 2024)
- [I512600KF] https://www.intel.com/content/www/us/en/products/sku/134590/intel-core-i512600kf-processor-20m-cache-up-to-4-90-ghz/specifications.html (no "ECC Memory Supported" field; the only "ECC" on the page is in "ECCN" in the legal text)

## Intel Xeon E-2236

- **Family / launch:** "Intel® Xeon® E Processor", "Products formerly Coffee Lake", Vertical Segment "Server", Launch Date "Q2'19" ([SPEC]).
  - Watch the SKU number: sku/191043 is the **E-2246G**, not the E-2236. The E-2236 is sku/191040.
- **Socket:** "FCLGA1151" ([SPEC]).
- **Cores / threads:** 6 / 12 ([SPEC]).
- **Clocks:** base 3.40 GHz, max turbo 4.80 GHz ([SPEC]).
- **Power:** "TDP": "80 W". "TCASE": "73.0°C" ([SPEC]).
- **Integrated graphics:** **none.** The "GPU Specifications" fields are all "N/A" or "No", for example "Graphics Output": "N/A" ([SPEC]).
- **Memory:**
  - "DDR4-2666", 128 GB max, 2 channels ([SPEC]).
  - The Description field says: "Support for up to 128GB system memory may require a BIOS update." / "Please contact your hardware provider regarding availability for your system." ([SPEC])
- **ECC:** "ECC Memory Supported ‡": "Yes", with the general ‡ "may not be available on all computing systems" footnote ([SPEC]).
- **PCIe:** "3.0", "1x16,2x8,1x8+2x4", 16 lanes ([SPEC]).
- **Cooler:** "Included Items": "This product is available in tray and box. For boxed product, a thermal solution is included" ([SPEC]). The page has no Thermal Solution Specification field ([SPEC]).
- **Compatible chipsets (Intel's list):** "Intel® C246 Chipset" (under "Intel® C240 Series Chipsets"), plus "Intel® Server Board M10JNP2SB" ([COMP]). No 300-series desktop chipset is listed.

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/191040/intel-xeon-e2236-processor-12m-cache-3-40-ghz/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/191040/intel-xeon-e2236-processor-12m-cache-3-40-ghz/compatible.html
