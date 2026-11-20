# AMD AM4 chipsets and BIOS support

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

Researched 2026-11-20.

How I read the pages:
- I could not open amd.com directly (the sandbox proxy blocks it), so every AMD page went through a fetch tool. That tool summarises pages and limits each verbatim quote to about 125 characters. I asked it for exact field values and exact phrases each time. Text in "quotes" below is what it said was verbatim. Tables of values are its rendering of the page, checked with a second fetch where noted.
- The amd.com **product** pages for the Ryzen 5 5600, 5600G, Ryzen 7 5700X and 5700G (`/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-...html`) failed with a client error each time. For those models, and as a cross-check for the others, I used AMD's own **Drivers and Downloads** page for the model, which has a "Specifications" section. Some of those pages carry more fields than others (see the ECC and chipset notes).
- I never opened eBay.

## AM4 BIOS and CPU support (AMD's statements)

**AMD's AM4 chipset page, processor compatibility table** (https://www.amd.com/en/products/processors/chipsets/am4.html, fetched twice with the same result). The columns are "AMD Athlon™ Processors with Radeon Graphics", "AMD Ryzen™ 1000 Series Processors", "AMD Ryzen™ 2000 Series Processors with Radeon™ Graphics", "AMD Ryzen™ 2000 Series Processors", "AMD Ryzen™ 3000 Series Processors with Radeon™ Graphics", "AMD Ryzen™ 3000 Series Processors", "AMD Ryzen™ 4000 Series Processors" and "AMD Ryzen™ 5000 Series Processors". Each column is headed "Compatible with". ✓ = compatible, ✗ = not compatible, "Beta" = the cell text "Selective Beta BIOS update needed".

| Chipset | Athlon w/ Radeon | Ryzen 1000 | Ryzen 2000 w/ Radeon | Ryzen 2000 | Ryzen 3000 w/ Radeon | Ryzen 3000 | Ryzen 4000 | Ryzen 5000 |
|---|---|---|---|---|---|---|---|---|
| X570 | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| B550 | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| A520 | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| X470 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| B450 | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| X370 | ✗ | ✓ | ✓ | ✓ | ✓ | Beta | Beta | Beta |
| B350 | ✗ | ✓ | ✓ | ✓ | ✓ | Beta | Beta | Beta |
| A320 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | Beta | Beta |

- The only note under the table: "Additional hardware combinations may be available through system suppliers. Check with your manufacturer for details." No footnote explains "Selective Beta BIOS update needed" (https://www.amd.com/en/products/processors/chipsets/am4.html).
- The table does not split the Ryzen 4000 and Ryzen 5000 columns into models with and without graphics, so the G models (5600G, 5700G) fall under the plain "Ryzen 5000 Series Processors" column. The page does not say this outright; it is how the table is laid out.
- Oddities I could not check against a second AMD source: B450 shows ✗ for "Athlon Processors with Radeon Graphics" while X470 and A320 show ✓, and A320 shows ✗ for "Ryzen 3000 Series Processors" but "Beta" for the newer 4000 and 5000 series. That is what the page says.
- The page does not name the architecture behind the "Ryzen 3000 Series Processors with Radeon Graphics" column. (From memory, unchecked: these are the Zen+ APUs such as the 3200G and 3400G.)

**AMD support article CPU-99, "BIOS Updates for AMD Ryzen™ Desktop Systems"** (https://www.amd.com/en/resources/support-articles/faqs/cpu-99.html):
- "A BIOS update may be needed when a motherboard does not already support a newer AMD Ryzen™ desktop processor." The article also says: "If the BIOS does not support the installed processor, the computer may fail to boot." (https://www.amd.com/en/resources/support-articles/faqs/cpu-99.html)
- "Get BIOS updates and instructions from the system or motherboard manufacturer's website and documentation." The article lists support pages for ASRock, ASUS, Biostar, Gigabyte and MSI.
- If the system cannot boot, the article (as paraphrased by the fetch tool) suggests four options: ask the retailer about a BIOS update service, temporarily use an older supported processor to flash the BIOS, use USB BIOS Flashback if the board has it, or contact the manufacturer.
- The article has no chipset-by-processor table.

**AMD support article RMA-BKTS, "Unable to Boot New Desktop System Configured with AMD Ryzen™ Series Processor, and Compatible AMD-Powered Motherboard"** (https://www.amd.com/en/resources/support-articles/faqs/RMA-BKTS.html):
- "To enable support for new desktop processors on compatible motherboards, a BIOS update may be required."
- AMD says it "will offer affected and qualified users (as described below) a compatible CPU (“boot-kit”), including thermal solution, for short-term use to perform the BIOS update on their motherboard." This is "available only for systems using AMD Ryzen Series Desktop Processors and compatible AMD Socket AM4 Motherboards."
- Who qualifies (https://www.amd.com/en/resources/support-articles/faqs/RMA-BKTS.html). The kit is "available only for qualified users that:"
  - "Have made a valid purchase of a retail boxed AMD Ryzen™ Series Desktop Processor and,"
  - "Are unable to boot that processor because the user’s current BIOS, on the compatible AMD-Powered motherboard, must be upgraded first."
  - "Have followed the suggested workarounds documented in this article and,"
  - "Are still unable to obtain a resolution for updating to the required BIOS."
- Proof required: "Once you have submitted your claim for a processor loan boot-kit, AMD will require pictures of your AMD Ryzen Series Desktop Processor and compatible AMD-Powered Motherboard, which clearly shows the model numbers and unique serial numbers as well as a copy of the purchase invoice(s) to authorize the request." Also: "The product must be a valid AMD processor with authentic part number (OPN) and serial number (SN)." (The fetch tool returned the longer quotes in parts; they are joined here.) (https://www.amd.com/en/resources/support-articles/faqs/RMA-BKTS.html)
- The page says "Please refer to the table below for compatibility information", but the table is an image that the fetch tool could not read, so which processor and motherboard pairs qualify is not known from this file. The kit "is offered through AMD warranty services" and "must be returned within 10 business days of receipt." (https://www.amd.com/en/resources/support-articles/faqs/RMA-BKTS.html)
- The page does not say whether second-hand, tray or OEM processors qualify. It refers only to "retail boxed" processors. (https://www.amd.com/en/resources/support-articles/faqs/RMA-BKTS.html)
- The page gives no end date. The fetch tool reported that the page metadata shows a last update in May 2024, so whether the offer still runs is not confirmed.

**AMD support article CHIPSET-001, "How to Identify the Manufacturer and Chipset of an AMD-Powered Motherboard"** (https://amd.com/en/resources/support-articles/faqs/CHIPSET-001.html):
- "Some motherboards may not include chipset information in their model name." In that case, "the chipset can be identified by searching for the manufacturer and model".
- On Windows, System Information shows the board: "check the Baseboard Manufacturer, Baseboard Product, and BIOS Version/Date entries".

**AMD press release, 15 March 2022, "AMD Launches the Ultimate Gaming Processor, Brings Enthusiast Performance to an Expanded Lineup of Ryzen Desktop Processors"** (https://ir.amd.com/news-events/press-releases/detail/1053/amd-launches-the-ultimate-gaming-processor-brings):
- "AMD announced it is extending support for Ryzen 5000 Series processors on AMD 300 Series chipsets", "including all the new desktop processors announced today." The processors announced that day included the Ryzen 5 5600 and Ryzen 7 5700X.
- "The latest AMD Ryzen 5000 Series processors will be supported on AMD X370, B350 and A320 chipsets"
- "Selective BETA BIOS updates are expected to become available in April."
- This release does not mention 400 series boards or AGESA.

**AMD press release, 8 October 2020, "AMD Launches AMD Ryzen 5000 Series Desktop Processors: The Fastest Gaming CPUs in the World"** (https://ir.amd.com/news-events/press-releases/detail/972/amd-launches-amd-ryzen-5000-series-desktop-processors-the):
- "AMD 500 series motherboards are ready for AMD Ryzen 5000 Series desktop processors with a simple BIOS update."
- This release does not mention 400 series boards.

**AMD press release, 16 June 2020, "AMD Offers Enthusiasts More Choice Than Ever Before with New Ryzen™ 3000XT Processors"** (https://ir.amd.com/news-events/press-releases/detail/955/amd-offers-enthusiasts-more-choice-than-ever-before-with-new-ryzen-3000xt-processors):
- The 3000XT processors are "compatible with all motherboards equipped with a Ryzen 3000-ready BIOS", "including day one support on the entire 500 series chipset families".

**AMD's May 2020 statement on "Zen 3" processors on B450 and X470, secondary.** AMD's spec pages list the 5600, 5700X, 5600G and 5700G as "Zen 3" (https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html, https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html, https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600g.html, https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700g.html). Tom's Hardware's headline for the article below is "AMD Reverses Course, Will Enable Zen 3 and Ryzen 4000 Support on B450 and X470 Motherboards" (secondary; confirmed by a second check on 2026-11-20). The article body discusses only "Zen 3", and its only other mention of "Ryzen 4000" is "The company also confirmed that Ryzen 4000 will land this year." It does not say whether "Ryzen 4000" means the same processors as "Zen 3". AMD's AM4 table has a separate "Ryzen 4000 Series Processors" column that AMD does not define. The original AMD community blog link now redirects away, so this is AMD's statement as quoted by Tom's Hardware, 19 May 2020 (https://www.tomshardware.com/news/amd-reverses-course-will-enable-zen-3-support-on-b450-and-x470-motherboards):
- "select beta BIOSes for AMD B450 and X470 motherboards."
- "These optional BIOS updates will disable support for many existing AMD Ryzen" [Desktop Processor models]
- "The select beta BIOSes will enable a one-way upgrade path for AMD Ryzen Processors"
- "Flashing back to an older BIOS version will not be supported."
- "CPU releases beyond “Zen 3” will require a newer motherboard."
- This was AMD's plan in 2020. I did not find a later AMD page saying whether it still applies to current BIOS releases. Check the board maker's BIOS notes for the specific board.

**Two AMD sources that do not fully agree on A320 and Ryzen 5000:**
- The AM4 table shows A320 + Ryzen 5000 as "Selective Beta BIOS update needed", and the 2022 press release names A320 among the supported chipsets.
- But the "Supporting Chipsets" field on AMD's Ryzen 5 5600 and Ryzen 7 5700X spec pages reads "X570 , X470 , X370 , B550 , B450 , B350 , A520", which leaves out A320 (see those sections).

Sources:
- https://www.amd.com/en/products/processors/chipsets/am4.html
- https://www.amd.com/en/resources/support-articles/faqs/cpu-99.html
- https://www.amd.com/en/resources/support-articles/faqs/RMA-BKTS.html
- https://amd.com/en/resources/support-articles/faqs/CHIPSET-001.html
- https://ir.amd.com/news-events/press-releases/detail/1053/amd-launches-the-ultimate-gaming-processor-brings
- https://ir.amd.com/news-events/press-releases/detail/972/amd-launches-amd-ryzen-5000-series-desktop-processors-the
- https://ir.amd.com/news-events/press-releases/detail/955/amd-offers-enthusiasts-more-choice-than-ever-before-with-new-ryzen-3000xt-processors
- https://www.tomshardware.com/news/amd-reverses-course-will-enable-zen-3-support-on-b450-and-x470-motherboards (secondary)
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600g.html
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700g.html

---

Notes for all the chipset sections below:
- **CPU support** comes from the AM4 compatibility table above.
- **Memory:** the AM4 page says "AMD Socket AM4 features motherboards with DDR4 memory, PCIe® 4.0 for NVMe and graphics…" (truncated by the fetch tool). It names no other memory type.
- **ECC:** the word "ECC" does not appear on AMD's AM4 chipset page. AMD does not state chipset-level ECC support there.
- **PCIe:** the figures below come from the AM4 spec table. Its column headers are "Graphics5", "NVMe8", "PCIe® Generation6", "PCIe® Lanes (Total/Usable)9" and "Overclocking Enabled1"; the trailing digits are footnote numbers. A group header "Direct Processor PCIe®" sits over some of these columns, but the fetched text lost the column spans, so I can't say exactly which columns it covers. The page does not separately say what generation the chipset's own lanes are.
- **AM4 page footnotes** that apply across chipsets:
  - footnote 6: "PCIe® 4.0 requires a 3rd Gen Ryzen or newer processor."
  - footnote 5: "A-Series and Ryzen processors with Radeon graphics for socket AM4 are limited to 1x8 PCIe Gen3 lanes for the graphics card."
  - footnote 9, paraphrased by the fetch tool: usable lanes are the concurrent graphics, NVMe and general-purpose lanes from the chipset and processor.
  - footnote 7: "Combined chipset and processor I/O with a 3rd Gen AMD Ryzen™ or newer processor." Two fetches both showed the marker on two spec-table headers only, rendered "USB7" and "Maximum SATA Ports7". This file gives no USB or SATA figures, so footnote 7 does not qualify any value here (https://www.amd.com/en/products/processors/chipsets/am4.html).
- **USB:** the "USB 3.2 Gen2" column values came through merged with footnote digits (e.g. "129", "69"), so I have left USB counts out.

## AMD A320 chipset (AM4)

- CPU support (AMD table): Athlon with Radeon Graphics ✓, Ryzen 1000 ✓, Ryzen 2000 with Radeon ✓, Ryzen 2000 ✓, Ryzen 3000 with Radeon ✓, **Ryzen 3000 ✗**, Ryzen 4000 "Selective Beta BIOS update needed", Ryzen 5000 "Selective Beta BIOS update needed" (https://www.amd.com/en/products/processors/chipsets/am4.html).
- Later CPUs: AMD's 2022 release says "The latest AMD Ryzen 5000 Series processors will be supported on AMD X370, B350 and A320 chipsets" and "Selective BETA BIOS updates are expected to become available in April." (https://ir.amd.com/news-events/press-releases/detail/1053/amd-launches-the-ultimate-gaming-processor-brings).
- Conflict: A320 is **not** in the "Supporting Chipsets" list on AMD's spec pages for the Ryzen 5 5600 and Ryzen 7 5700X (https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html, https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html).
- PCIe (AM4 spec table): Graphics "1x16"; NVMe "1x4"; PCIe Generation "PCIe®3.0"; lanes total/usable "32/24"; Overclocking Enabled "No" (https://www.amd.com/en/products/processors/chipsets/am4.html).
- Multi-GPU: not stated for A320. Its description is "Essential computing and media playback" (same page).
- Memory: DDR4 (AM4 page, platform-wide statement: https://www.amd.com/en/products/processors/chipsets/am4.html).
- ECC: not stated by AMD.

Sources:
- https://www.amd.com/en/products/processors/chipsets/am4.html
- https://ir.amd.com/news-events/press-releases/detail/1053/amd-launches-the-ultimate-gaming-processor-brings
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html

## AMD B350 chipset (AM4)

- CPU support (AMD table): Athlon with Radeon Graphics ✗, Ryzen 1000 ✓, Ryzen 2000 with Radeon ✓, Ryzen 2000 ✓, Ryzen 3000 with Radeon ✓, Ryzen 3000 / 4000 / 5000 all "Selective Beta BIOS update needed" (https://www.amd.com/en/products/processors/chipsets/am4.html).
- Later CPUs: B350 is named in AMD's 2022 statement on Ryzen 5000 support with "Selective BETA BIOS updates" (https://ir.amd.com/news-events/press-releases/detail/1053/amd-launches-the-ultimate-gaming-processor-brings). B350 is in the "Supporting Chipsets" list on the Ryzen 5 5600 and 5700X spec pages (https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html, https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html).
- PCIe (AM4 spec table): Graphics "1x16"; NVMe "1x4"; PCIe Generation "PCIe®3.0"; lanes "36/28"; Overclocking Enabled "Yes" (https://www.amd.com/en/products/processors/chipsets/am4.html).
- Description: "...but don’t need the maximum PCIe® bandwidth required by multi-GPU configurations." (https://www.amd.com/en/products/processors/chipsets/am4.html)
- Memory: DDR4 (AM4 page: https://www.amd.com/en/products/processors/chipsets/am4.html).
- ECC: not stated by AMD.

Sources:
- https://www.amd.com/en/products/processors/chipsets/am4.html
- https://ir.amd.com/news-events/press-releases/detail/1053/amd-launches-the-ultimate-gaming-processor-brings
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html

## AMD X370 chipset (AM4)

- CPU support (AMD table): Athlon with Radeon Graphics ✗, Ryzen 1000 ✓, Ryzen 2000 with Radeon ✓, Ryzen 2000 ✓, Ryzen 3000 with Radeon ✓, Ryzen 3000 / 4000 / 5000 all "Selective Beta BIOS update needed" (https://www.amd.com/en/products/processors/chipsets/am4.html).
- Later CPUs: X370 is named in AMD's 2022 statement on Ryzen 5000 support with "Selective BETA BIOS updates" (https://ir.amd.com/news-events/press-releases/detail/1053/amd-launches-the-ultimate-gaming-processor-brings). X370 is in the 5600 and 5700X "Supporting Chipsets" lists (https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html, https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html).
- PCIe (AM4 spec table): Graphics "1x16/ 2x8"; NVMe "1x4"; PCIe Generation "PCIe®3.0"; lanes "40/32"; Overclocking Enabled "Yes" (https://www.amd.com/en/products/processors/chipsets/am4.html).
- Description: "supports dual graphics card configurations thanks to two PCIe® 3.0 graphics card slots." (same page)
- Memory: DDR4 (AM4 page: https://www.amd.com/en/products/processors/chipsets/am4.html).
- ECC: not stated by AMD.

Sources:
- https://www.amd.com/en/products/processors/chipsets/am4.html
- https://ir.amd.com/news-events/press-releases/detail/1053/amd-launches-the-ultimate-gaming-processor-brings
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html

## AMD B450 chipset (AM4)

- CPU support (AMD table): Athlon with Radeon Graphics ✗, Ryzen 1000 ✗, Ryzen 2000 with Radeon ✗, Ryzen 2000 ✓, Ryzen 3000 with Radeon ✓, Ryzen 3000 ✓, Ryzen 4000 ✓, Ryzen 5000 ✓ (https://www.amd.com/en/products/processors/chipsets/am4.html).
  - The ✗ for Ryzen 1000 and Ryzen 2000 with Radeon on B450 (while X470 shows ✓) is what the fetched table shows. I have no second AMD source on it.
- Later CPUs: the AM4 table shows Ryzen 5000 as plain ✓ with no BIOS note. AMD's general line is that "A BIOS update may be needed when a motherboard does not already support a newer AMD Ryzen™ desktop processor." The same article says: "If the BIOS does not support the installed processor, the computer may fail to boot." (https://www.amd.com/en/resources/support-articles/faqs/cpu-99.html).
  - AMD's May 2020 plan for Zen 3 on B450/X470 was "select beta BIOSes", one-way, disabling support for many older Ryzen models. This is quoted secondhand by Tom's Hardware (https://www.tomshardware.com/news/amd-reverses-course-will-enable-zen-3-support-on-b450-and-x470-motherboards), and I have no AMD page on its current status.
- PCIe (AM4 spec table): Graphics "1x16"; NVMe "1x4"; PCIe Generation "PCIe®3.0"; lanes "36/28"; Overclocking Enabled "Yes" (https://www.amd.com/en/products/processors/chipsets/am4.html).
- Description: "...but don’t need the maximum PCIe® bandwidth required by multi-GPU configurations." (same page)
- Memory: DDR4 (AM4 page: https://www.amd.com/en/products/processors/chipsets/am4.html).
- ECC: not stated by AMD.

Sources:
- https://www.amd.com/en/products/processors/chipsets/am4.html
- https://www.amd.com/en/resources/support-articles/faqs/cpu-99.html
- https://www.tomshardware.com/news/amd-reverses-course-will-enable-zen-3-support-on-b450-and-x470-motherboards (secondary)

## AMD X470 chipset (AM4)

- CPU support (AMD table): ✓ in every column, from Athlon with Radeon Graphics to Ryzen 5000 (https://www.amd.com/en/products/processors/chipsets/am4.html).
- Later CPUs: same as B450. The table has no BIOS note, AMD says generally that a BIOS update may be needed (CPU-99), and there is the secondhand May 2020 beta-BIOS statement (see the B450 section). CPU-99 also says: "If the BIOS does not support the installed processor, the computer may fail to boot." (https://www.amd.com/en/resources/support-articles/faqs/cpu-99.html)
- PCIe (AM4 spec table): Graphics "1x16/ 2x8"; NVMe "1x4"; PCIe Generation "PCIe®3.0"; lanes "40/32"; Overclocking Enabled "Yes" (https://www.amd.com/en/products/processors/chipsets/am4.html).
- Description: "supports dual graphics card configurations thanks to two PCIe® 3.0 graphics card slots." (same page)
- Chipset lanes: AMD's Ryzen 5 5600 and Ryzen 7 5700X spec pages list "Additional Usable PCIe Lanes from Motherboard" as "X470: 2x Gen 3, 8x Gen 2" (https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html). That is AMD's wording, and I have not interpreted it further.
- Memory: DDR4 (AM4 page: https://www.amd.com/en/products/processors/chipsets/am4.html).
- ECC: not stated by AMD.

Sources:
- https://www.amd.com/en/products/processors/chipsets/am4.html
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html
- https://www.amd.com/en/resources/support-articles/faqs/cpu-99.html

## AMD A520 chipset (AM4)

- CPU support (AMD table): Athlon with Radeon Graphics ✗, **Ryzen 1000 ✗, Ryzen 2000 with Radeon ✗, Ryzen 2000 ✗, Ryzen 3000 with Radeon ✗**, Ryzen 3000 ✓, Ryzen 4000 ✓, Ryzen 5000 ✓ (https://www.amd.com/en/products/processors/chipsets/am4.html).
- AMD release, June 2020: "AMD announced the A520 chipset for socket AM4 and 3rd Gen AMD Ryzen desktop processors". The release calls it "the latest addition to the AMD 500 Series chipset family" (https://ir.amd.com/news-events/press-releases/detail/955/amd-offers-enthusiasts-more-choice-than-ever-before-with-new-ryzen-3000xt-processors).
- Later CPUs: "AMD 500 series motherboards are ready for AMD Ryzen 5000 Series desktop processors with a simple BIOS update." (https://ir.amd.com/news-events/press-releases/detail/972/amd-launches-amd-ryzen-5000-series-desktop-processors-the)
- PCIe (AM4 spec table): Graphics "1x16"; NVMe "1x4"; PCIe Generation "**PCIe®3.0**"; lanes "34/26"; Overclocking Enabled "**No**" (https://www.amd.com/en/products/processors/chipsets/am4.html).
- Memory: DDR4 (AM4 page: https://www.amd.com/en/products/processors/chipsets/am4.html).
- ECC: not stated by AMD.

Sources:
- https://www.amd.com/en/products/processors/chipsets/am4.html
- https://ir.amd.com/news-events/press-releases/detail/955/amd-offers-enthusiasts-more-choice-than-ever-before-with-new-ryzen-3000xt-processors
- https://ir.amd.com/news-events/press-releases/detail/972/amd-launches-amd-ryzen-5000-series-desktop-processors-the

## AMD B550 chipset (AM4)

- CPU support (AMD table): Athlon with Radeon Graphics ✗, **Ryzen 1000 ✗, Ryzen 2000 with Radeon ✗, Ryzen 2000 ✗, Ryzen 3000 with Radeon ✗**, Ryzen 3000 ✓, Ryzen 4000 ✓, Ryzen 5000 ✓ (https://www.amd.com/en/products/processors/chipsets/am4.html).
- AMD release, June 2020: "Today also marks worldwide availability of the AMD B550 chipset, the first mainstream chipset with support for PCIe® 4.0." (https://ir.amd.com/news-events/press-releases/detail/955/amd-offers-enthusiasts-more-choice-than-ever-before-with-new-ryzen-3000xt-processors).
- Later CPUs: "AMD 500 series motherboards are ready for AMD Ryzen 5000 Series desktop processors with a simple BIOS update." (https://ir.amd.com/news-events/press-releases/detail/972/amd-launches-amd-ryzen-5000-series-desktop-processors-the)
- PCIe (AM4 spec table): Graphics "1x16/ 2x8"; NVMe "1x4"; PCIe Generation "**PCIe®4.0(Graphics and NVMe only)**"; lanes "38/30"; Overclocking Enabled "Yes" (https://www.amd.com/en/products/processors/chipsets/am4.html).
  - Subheading "PCIe® 4.0 Ready for AMD Ryzen™ processors"; description "...and PCIe® 4.0 connectivity for NVMe storage and graphics."
  - Footnote: "PCIe® 4.0 requires a 3rd Gen Ryzen or newer processor." (same page)
  - AMD's own G-model pages list "PCIe® 3.0" for the 5600G and 5700G (see those sections). So a G-series CPU on B550 would not give PCIe 4.0 by AMD's CPU specs. That is my reading of two AMD pages together, not a sentence AMD wrote.
- Chipset's own lane generation: not stated by AMD beyond "(Graphics and NVMe only)" above.
- Memory: DDR4 (AM4 page: https://www.amd.com/en/products/processors/chipsets/am4.html).
- ECC: not stated by AMD.
  - Secondary (ASUS, a board maker): ASUS's FAQ "[Motherboard] List of AMD Ryzen™ Processors with support for ECC memory" (last updated 2026/09/14) marks "AMD Ryzen™ 5000 Series Processors" as "Supported" for ECC functions with "V" under "Support with B550". It also says that for APUs (Ryzen 3000/4000 G-series) "only PRO processors (e.g. Ryzen 3 PRO 3200G) will support ECC memory". It has no 5000 G-series row (https://www.asus.com/support/faq/1045186/). That is about ASUS boards and is not an AMD statement.

Sources:
- https://www.amd.com/en/products/processors/chipsets/am4.html
- https://ir.amd.com/news-events/press-releases/detail/955/amd-offers-enthusiasts-more-choice-than-ever-before-with-new-ryzen-3000xt-processors
- https://ir.amd.com/news-events/press-releases/detail/972/amd-launches-amd-ryzen-5000-series-desktop-processors-the
- https://www.asus.com/support/faq/1045186/ (secondary, board maker)

## AMD X570 chipset (AM4)

- CPU support (AMD table): Athlon with Radeon Graphics ✗, **Ryzen 1000 ✗, Ryzen 2000 with Radeon ✗**, Ryzen 2000 ✓, Ryzen 3000 with Radeon ✓, Ryzen 3000 ✓, Ryzen 4000 ✓, Ryzen 5000 ✓ (https://www.amd.com/en/products/processors/chipsets/am4.html).
- AMD release, July 2019: "AMD designed and unveiled the new X570 chipset for AMD Socket AM4", "enabling the world's first platform with PCIe® 4.0 support for consumers." (https://ir.amd.com/news-events/press-releases/detail/899/amd-unleashes-ultimate-pc-gaming-platform-with-worldwide-availability-of-amd-radeon-rx-5700-series-graphics-cards-and-amd-ryzen-3000-series-desktop-processors).
- Later CPUs: "AMD 500 series motherboards are ready for AMD Ryzen 5000 Series desktop processors with a simple BIOS update." (https://ir.amd.com/news-events/press-releases/detail/972/amd-launches-amd-ryzen-5000-series-desktop-processors-the)
- PCIe (AM4 spec table): Graphics "1x16/ 2x8"; NVMe "1x4"; PCIe Generation "PCIe®4.0"; lanes "44/36"; Overclocking Enabled "Yes" (https://www.amd.com/en/products/processors/chipsets/am4.html).
  - Description: "supports dual graphics card configurations thanks to two PCIe® 4.0 graphics card slots."
  - Footnote: "PCIe® 4.0 requires a 3rd Gen Ryzen or newer processor." (same page)
- Chipset lanes: AMD's Ryzen 5 5600 and 5700X spec pages list "Additional Usable PCIe Lanes from Motherboard" as "X570: 16x Gen 4" (https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html).
- Memory: DDR4 (AM4 page: https://www.amd.com/en/products/processors/chipsets/am4.html).
- ECC: not stated by AMD.
  - Secondary (ASUS FAQ): "V" under "Support with X570" for "AMD Ryzen™ 5000 Series Processors", "Supported" (https://www.asus.com/support/faq/1045186/).

Sources:
- https://www.amd.com/en/products/processors/chipsets/am4.html
- https://ir.amd.com/news-events/press-releases/detail/899/amd-unleashes-ultimate-pc-gaming-platform-with-worldwide-availability-of-amd-radeon-rx-5700-series-graphics-cards-and-amd-ryzen-3000-series-desktop-processors
- https://ir.amd.com/news-events/press-releases/detail/972/amd-launches-amd-ryzen-5000-series-desktop-processors-the
- https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html
- https://www.asus.com/support/faq/1045186/ (secondary, board maker)

---

Note for all the CPU sections below: on AMD's newer spec pages, "Supporting Chipsets" and "ECC Support" appear only for some models (5600, 5700X, 7600). For the 5600X, 5600G, 5700G, 5800X, 5900X and 5950X these fields are **absent** from both the product page (where it loaded) and the Drivers and Downloads spec section. Where absent, I write "not stated", and chipset support then comes only from the AM4 table's "Ryzen 5000 Series" column.
