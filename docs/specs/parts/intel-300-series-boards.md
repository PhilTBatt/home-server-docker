# Intel LGA1151 300-series chipsets

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

Researched 2026-11-20.

How I read the pages (read this before trusting a fact):
- Direct downloads of intel.com were blocked by the sandbox proxy (`curl` got "CONNECT tunnel failed, response 403"), so every Intel page went through a fetch tool. That tool turns a page into text, answers questions about it and limits each verbatim quote to about 125 characters. Each time I asked it for exact labels and values. Text in "quotes" below is what the tool returned as verbatim. Where the tool said it had paraphrased, I mark it **(tool paraphrase)**.
- intel.com product pages (the old "ARK") have separate tabs: `/specifications.html`, `/compatible.html` (the "Compatible Products" list) and `/ordering.html`. I read each one separately. Counts of processors in a compatible list are the fetch tool's counts.
- **No Intel chipset spec page I read has a "Memory Types" field.** The fetch tool found no "DDR4", "DDR5" or "Memory Types" text anywhere on the Z790 page or the H610 page when I asked it to look specifically, and it reported the field absent on all the others. So "Intel's spec lists DDR4 and DDR5 for the chipset" is **not** what these pages show. Intel lists DDR4 and DDR5 on the **processor** pages and in support articles. Details in each section.
- "not stated" means it was not in what I read. Anything marked "(from memory, unchecked)" is not from a source. I never opened eBay.

## Shared Intel statements for the LGA1151 300-series chipsets

- Intel support article 000025694, "Compatibility of Desktop 9th and 8th Generation Intel® Core™ Processors", Last Reviewed 07/02/2025 ([KB25694]). The tool returned the body as consecutive verbatim pieces:
  - "9th and 8th Generation Intel® Core™ Desktop Processors use an LGA1151 socket."
  - "However, they require motherboards based on Intel® 300 Series Chipset."
  - "Some Intel® 300 Series Chipset based motherboards may need a BIOS update" / "to support 9th Generation Intel® Core™ Desktop Processors." / "Please check with your motherboard manufacturer for details."
  - "These processors aren't backward compatible with motherboards based on Intel® 200 Series Chipset" / "and Intel® 100 Series Chipset."
  - "Similarly, 7th Generation Intel® Core™ Processors and 6th Generation Intel® Core™ Processors" / "aren't compatible with the Intel® 300 Series Chipset motherboards."
  - "The Desktop 9th and 8th Generation Intel® Core™ processors supports only DDR4 memory."
- Intel support article 000033135, "Required BIOS Updates Available for Intel® 300 Series Chipset and 9th Gen Intel® Core™ Desktop Processor-based System Build", Last Reviewed 02/05/2026 ([KB33135]):
  - "The Intel® 300 Series Chipset is a scalable chipset designed for motherboards that support the 9th Gen" / "and 8th Gen Intel® Core™ desktop processors."
  - "The latest release of the 9th Gen Intel® Core processors contains several changes."
  - "This may require a BIOS update to your Intel® 300 Series Chipset-based motherboard in order to boot."
  - The article does not name Z370 or any single chipset **(tool paraphrase)**.
- Intel PDF "technical-advisory-bios-update.pdf", dated April 2019 and marked "Intel Confidential – For Use Under CNDA", although it is hosted publicly on intel.com ([TA]):
  - "The latest release of the 9th Gen Intel® Core processors contains changes that may require BIOS update to boot."
  - "Affected processors include the processors identified for conversion in PCN 116781-00, published February 25, 2019."
  - It names no individual 300-series chipsets and no stepping. I did not read PCN 116781-00.
- **Chipset spec pages:** none of the 300-series pages has a Memory Types or Max # of Memory Channels field. The fetch tool reported that "DDR" does not appear on the B360 page.
- **Intel's lists leave out the i5-8500 on Z390 and Q370, in both directions.** The i5-8500 page lists only B365, H370, B360, H310 and Z370 ([I58500C]). The Q370 and Z390 compatible lists leave out the i5-8500 while listing the i5-8400, i5-8600 and others ([Q370C], [Z390C]). Intel gives no reason, and none of the three pages has a footnote about it. (My judgement, inference, not stated by Intel: this may be a gap in the lists rather than an incompatibility. I would not read it as "not compatible" without a board maker's CPU support list.)

Sources:
- [KB25694] https://www.intel.com/content/www/us/en/support/articles/000025694.html
- [KB33135] https://www.intel.com/content/www/us/en/support/articles/000033135.html
- [TA] https://www.intel.com/content/dam/www/public/us/en/documents/technical-specifications/technical-advisory-bios-update.pdf
- [I58500C] https://www.intel.com/content/www/us/en/products/sku/129939/intel-core-i58500-processor-9m-cache-up-to-4-10-ghz/compatible.html
- [Q370C] https://www.intel.com/content/www/us/en/products/sku/133282/intel-q370-chipset/compatible.html
- [Z390C] https://www.intel.com/content/www/us/en/products/sku/133293/intel-z390-chipset/compatible.html

## Intel H310 chipset (LGA1151, 300 series)

- **Family / launch:** "Intel® 300 Series Desktop Chipsets", "Products formerly Coffee Lake", Launch Date "Q2'18", TDP "6 W" ([SPEC]).
- **CPU generations (compatible list):**
  - Headings: 9th gen Core i9 (5), i7 (5), i5 (10), i3 (8); 8th gen Core i7 (8), i5 (7), i3 (5); Pentium Gold (9); Celeron G (6). There is no 8th-gen i9 heading ([COMP]).
  - i5-8500, i7-8700, i5-9500 and i7-9700 are all listed. No Xeon E is listed. There is no BIOS footnote ([COMP]).
- **BIOS notes:** shared 300-series statements only ([KB25694], [KB33135]). Nothing specific to H310.
- **Memory:**
  - Type: not stated on the chipset page. Intel says 8th/9th gen desktop processors support "only DDR4 memory" ([KB25694]).
  - "# of DIMMs per channel": "1" ([SPEC]).
  - "ECC Memory Supported ‡": "No" ([SPEC]).
- **Overclocking:** "Supports Memory Overclocking": "No". There is no "Supports Overclocking" field ([SPEC]).
- **PCIe from the chipset:**
  - "PCI Express Revision": "2.0". "Max # of PCI Express Lanes": "6". DMI "2.0" with "4" lanes ([SPEC]).
  - "Supported Processor PCI Express Port Configurations": "1x16" ([SPEC]).
- **Other:** 4 SATA ports. No USB 3.1 Gen 2. "Intel® Optane™ Memory Supported": "No" ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/133348/intel-h310-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/133348/intel-h310-chipset/compatible.html
- [KB25694] https://www.intel.com/content/www/us/en/support/articles/000025694.html
- [KB33135] https://www.intel.com/content/www/us/en/support/articles/000033135.html

## Intel B360 chipset (LGA1151, 300 series)

- **Family / launch:** "Intel® 300 Series Desktop Chipsets", Launch Date "Q2'18", TDP "6 W" ([SPEC]).
- **CPU generations (compatible list):** same headings and counts as H310: 8th and 9th gen Core, Pentium Gold and Celeron G. i5-8500, i7-8700, i5-9500 and i7-9700 are all listed. No Xeon E. No BIOS footnote ([COMP]).
- **BIOS notes:** shared statements only ([KB25694], [KB33135]).
- **Memory:**
  - Type: not stated on the page. DDR4 only per CPU ([KB25694]).
  - "# of DIMMs per channel": "2". "ECC Memory Supported ‡": "No" ([SPEC]).
- **Overclocking:** "Supports Memory Overclocking": "No". There is no "Supports Overclocking" field ([SPEC]).
- **PCIe from the chipset:**
  - "PCI Express Revision": "3.0". "Max # of PCI Express Lanes": "12". DMI "3.0" with "4" lanes ([SPEC]).
  - Processor port configuration: "1x16" ([SPEC]).
- **Other:** 6 SATA ports. Up to 4 USB 3.1 Gen 2 ports ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/133332/intel-b360-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/133332/intel-b360-chipset/compatible.html
- [KB25694] https://www.intel.com/content/www/us/en/support/articles/000025694.html
- [KB33135] https://www.intel.com/content/www/us/en/support/articles/000033135.html

## Intel H370 chipset (LGA1151, 300 series)

- **Family / launch:** "Intel® 300 Series Desktop Chipsets", Launch Date "Q2'18", TDP "6 W", Marketing Status "Discontinued" ([SPEC]).
- **CPU generations (compatible list):** 63 processors (tool count): 8th and 9th gen Core, Pentium Gold and Celeron G. i5-8500, i7-8700, i5-9500 and i7-9700 are all listed. No Xeon E. No BIOS footnote ([COMP]).
- **BIOS notes:** shared statements only ([KB25694], [KB33135]).
- **Memory:**
  - Type: not stated on the page. DDR4 only per CPU ([KB25694]).
  - "# of DIMMs per channel": "2". "ECC Memory Supported ‡": "No" ([SPEC]).
- **Overclocking:** "Supports Memory Overclocking": "No". There is no "Supports Overclocking" field ([SPEC]).
- **PCIe from the chipset:**
  - "PCI Express Revision": "3.0". "Max # of PCI Express Lanes": "20". DMI "3.0" with "4" lanes ([SPEC]).
  - Processor port configuration: "1x16" ([SPEC]).
- **Other:** 6 SATA ports. RAID "PCIe 0,1,5 / SATA 0,1,5,10" ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/133284/intel-h370-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/133284/intel-h370-chipset/compatible.html
- [KB25694] https://www.intel.com/content/www/us/en/support/articles/000025694.html
- [KB33135] https://www.intel.com/content/www/us/en/support/articles/000033135.html

## Intel Q370 chipset (LGA1151, 300 series)

- **Family / launch:** "Intel® 300 Series Desktop Chipsets", Launch Date "Q2'18", TDP "6 W" ([SPEC]).
- **CPU generations (compatible list):** 61 processors (tool count) under 8th and 9th gen Core, Pentium Gold and Celeron G. No Xeon E ([COMP]).
  - i7-8700, i5-9500 and i7-9700 are listed ([COMP]).
  - **The i5-8500 is not listed.** On a second read, the "8th Generation Intel® Core™ i5 Processors" heading listed only the i5-8600, i5-8600T, i5-8400T, i5-8600K and i5-8400 ([COMP]).
  - The i5-8500's own compatible page doesn't list Q370 either ([I58500C]).
  - There is no BIOS footnote ([COMP]).
- **BIOS notes:** shared statements only ([KB25694], [KB33135]).
- **Memory:**
  - Type: not stated on the page. DDR4 only per CPU ([KB25694]).
  - "# of DIMMs per channel": "2". "ECC Memory Supported ‡": "No" ([SPEC]).
- **Overclocking:** "Supports Memory Overclocking": "No". There is no "Supports Overclocking" field ([SPEC]).
- **PCIe from the chipset:**
  - "PCI Express Revision": "3.0". "Max # of PCI Express Lanes": "24". DMI "3.0" with "4" lanes ([SPEC]).
  - Processor port configurations: "1x16 or 2x8 or 1x8+2x4" ([SPEC]).
- **Other:** "Intel vPro® Eligibility ‡": "Intel vPro® Platform". "Intel® Standard Manageability": "Yes". 6 SATA ports ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/133282/intel-q370-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/133282/intel-q370-chipset/compatible.html
- [I58500C] https://www.intel.com/content/www/us/en/products/sku/129939/intel-core-i58500-processor-9m-cache-up-to-4-10-ghz/compatible.html
- [KB25694] https://www.intel.com/content/www/us/en/support/articles/000025694.html
- [KB33135] https://www.intel.com/content/www/us/en/support/articles/000033135.html

## Intel Z370 chipset (LGA1151, 300 series)

- **Family / launch:** "Intel® 300 Series Desktop Chipsets", Launch Date "Q4'17", TDP "6 W", Marketing Status "Discontinued", "Intel® ME Firmware Version": "11". The other 300-series chipsets here give "12" ([SPEC]).
- **CPU generations (compatible list):** 9th gen Core i9 (5), i7 (5), i5 (10), i3 (8); 8th gen Core i7 (8), i5 (6), i3 (5); Pentium Gold (9); Celeron G (6). i5-8500, i7-8700, i5-9500, i7-9700 and i9-9900K are all listed. There is no BIOS footnote ([COMP]).
- **BIOS notes (9th gen on Z370):** no Intel statement I read names Z370. The general 300-series statements apply ([KB25694], [KB33135], [TA]). The compatible list does include 9th gen ([COMP]).
- **Memory:**
  - Type: not stated on the page. DDR4 only per CPU ([KB25694]).
  - "# of DIMMs per channel": "2". "ECC Memory Supported ‡": "No" ([SPEC]).
- **Overclocking:** "Supports Memory Overclocking": "Yes". "Supports Overclocking": "IA, BCLK, Memory" ([SPEC]).
- **PCIe from the chipset:**
  - "PCI Express Revision": "3.0". "Max # of PCI Express Lanes": "24". DMI "3.0" with "4" lanes ([SPEC]).
  - Processor port configurations: "1x16 or 2x8 or 1x8+2x4" ([SPEC]).
- **Other:**
  - USB: "Up to 0 USB 3.1 Gen 2 (10Gb/s) Ports" ([SPEC]).
  - "Integrated Wireless ‡": "No" ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/125903/intel-z370-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/125903/intel-z370-chipset/compatible.html
- [KB25694] https://www.intel.com/content/www/us/en/support/articles/000025694.html
- [KB33135] https://www.intel.com/content/www/us/en/support/articles/000033135.html
- [TA] https://www.intel.com/content/dam/www/public/us/en/documents/technical-specifications/technical-advisory-bios-update.pdf

## Intel Z390 chipset (LGA1151, 300 series)

- **Family / launch:** "Intel® 300 Series Desktop Chipsets", Launch Date "Q4'18", TDP "6 W" ([SPEC]).
- **CPU generations (compatible list):** 8th and 9th gen Core, Pentium Gold and Celeron G. No BIOS footnote ([COMP]).
  - i7-8700, i5-9500 and i7-9700 are listed ([COMP]).
  - **The i5-8500 is not listed.** The 8th gen i5 heading has 4 entries: i5-8600, i5-8600T, i5-8600K and i5-8400 ([COMP]).
  - The i5-8500's own compatible page doesn't list Z390 ([I58500C]).
- **BIOS notes:** shared statements only ([KB25694], [KB33135]).
- **Memory:**
  - Type: not stated on the page. DDR4 only per CPU ([KB25694]).
  - "# of DIMMs per channel": "2". "ECC Memory Supported ‡": "No" ([SPEC]).
- **Overclocking:** "Supports Memory Overclocking": "Yes". "Supports Overclocking": "IA, BCLK, Memory" ([SPEC]).
- **PCIe from the chipset:**
  - "PCI Express Revision": "3.0". "Max # of PCI Express Lanes": "24". DMI "3.0" with "4" lanes ([SPEC]).
  - Processor port configurations: "1x16 or 2x8 or 1x8+2x4" ([SPEC]).
- **Other:** up to 6 USB 3.1 Gen 2 ports. 6 SATA ports ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/133293/intel-z390-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/133293/intel-z390-chipset/compatible.html
- [I58500C] https://www.intel.com/content/www/us/en/products/sku/129939/intel-core-i58500-processor-9m-cache-up-to-4-10-ghz/compatible.html
- [KB25694] https://www.intel.com/content/www/us/en/support/articles/000025694.html
- [KB33135] https://www.intel.com/content/www/us/en/support/articles/000033135.html

## Intel C246 chipset (LGA1151, 300 series)

- **Family / launch:** "Intel® C240 Series Chipsets" (not "300 Series Desktop Chipsets"), "Products formerly Coffee Lake", Vertical Segment "Server", Launch Date "Q3'18", TDP "6 W" ([SPEC]).
- **CPU generations (compatible list):**
  - The only heading is "Intel® Xeon® E Processor", with 34 processors (tool count) ([COMP]).
  - **E-2100 and E-2200 models are both listed.** The page doesn't label the series. The tool inferred them from model numbers such as E-2126G, E-2174G, E-2146G, E-2104G, E-2226GE, E-2278G and E-2288G ([COMP]).
  - "Intel® Xeon® E-2236 Processor (12M Cache, 3.40 GHz)" is listed ([COMP]).
  - **No Core i3/i5/i7/i9, Pentium or Celeron processors are listed** ([COMP]).
  - The E-2236's own compatible page lists "Intel® C246 Chipset" (under "Intel® C240 Series Chipsets") and "Intel® Server Board M10JNP2SB" ([E2236C]).
- **Core i3 on C246:** an Intel Customer Support Technician on the Intel Community forum (17 Nov 2022) wrote: "the Chipset C246 hasn't been validated to work alongside the i3-8100 CPU". The technician noted that the i3-8100 "does support ECC memory" and pointed the poster to the board maker ([FORUM]). This is a forum reply, not a spec page.
- **BIOS notes:** none specific to C246 in what I read. The E-2236 page says: "Support for up to 128GB system memory may require a BIOS update." ([E2236])
- **Memory:**
  - Type: not stated on the chipset page. The E-2236 lists "DDR4-2666" ([E2236]).
  - "# of DIMMs per channel": "2" ([SPEC]).
- **ECC:** "ECC Memory Supported ‡": "Yes" ([SPEC]). The ‡ footnote is Intel's general "This feature may not be available on all computing systems." Among the items it says to check, it lists "motherboard, processor, chipset, … memory, BIOS" ([SPEC]).
- **Overclocking:** "Supports Memory Overclocking": "No". There is no "Supports Overclocking" field ([SPEC]).
- **PCIe from the chipset:**
  - "PCI Express Revision": "3.0". "Max # of PCI Express Lanes": "24". DMI "3.0" with "4" lanes ([SPEC]).
  - Processor port configurations: "1x16 or 2x8 or 1x8+2x4" ([SPEC]).
- **Other:** 8 SATA 6 Gb/s ports, the most of the 300-series chipsets here ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/147326/intel-c246-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/147326/intel-c246-chipset/compatible.html
- [E2236] https://www.intel.com/content/www/us/en/products/sku/191040/intel-xeon-e2236-processor-12m-cache-3-40-ghz/specifications.html
- [E2236C] https://www.intel.com/content/www/us/en/products/sku/191040/intel-xeon-e2236-processor-12m-cache-3-40-ghz/compatible.html
- [FORUM] https://community.intel.com/t5/Mobile-and-Desktop-Processors/Core-i3-8100-and-Chipset-C246/m-p/1430596
