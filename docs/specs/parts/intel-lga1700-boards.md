# Intel LGA1700 chipsets (600 and 700 series)

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

Researched 2026-11-20.

How I read the pages (read this before trusting a fact):
- Direct downloads of intel.com were blocked by the sandbox proxy (`curl` got "CONNECT tunnel failed, response 403"), so every Intel page went through a fetch tool. That tool turns a page into text, answers questions about it and limits each verbatim quote to about 125 characters. Each time I asked it for exact labels and values. Text in "quotes" below is what the tool returned as verbatim. Where the tool said it had paraphrased, I mark it **(tool paraphrase)**.
- intel.com product pages (the old "ARK") have separate tabs: `/specifications.html`, `/compatible.html` (the "Compatible Products" list) and `/ordering.html`. I read each one separately. Counts of processors in a compatible list are the fetch tool's counts.
- **No Intel chipset spec page I read has a "Memory Types" field.** The fetch tool found no "DDR4", "DDR5" or "Memory Types" text anywhere on the Z790 page or the H610 page when I asked it to look specifically, and it reported the field absent on all the others. So "Intel's spec lists DDR4 and DDR5 for the chipset" is **not** what these pages show. Intel lists DDR4 and DDR5 on the **processor** pages and in support articles. Details in each section.
- "not stated" means it was not in what I read. Anything marked "(from memory, unchecked)" is not from a source. I never opened eBay.

## Shared Intel statements for all LGA1700 chipsets (600 and 700 series)

These apply to every 600/700-series section below. Each section repeats the short version.

**BIOS for 13th/14th gen**
- Intel support article 000092294, "Required BIOS Updates for Intel® 600 and Intel® 700 Series Chipset with Intel® Core™ Desktop Processors (13th and 14th gen)", Last Reviewed 02/05/2026 ([KB92294]). The tool returned the first two paragraphs as consecutive verbatim pieces:
  - "The Intel® 600 Series and Intel® 700 Series Desktop Chipset are scalable chipsets designed for motherboards" / "that support the 12th Gen, 13th Gen and the recent Intel® Core™ desktop processor (14th gen)."
  - "Intel® 600 Series and Intel® 700 Series chipset-based motherboards require a BIOS update to boot the Intel® Core™" / "desktop processors (13th and 14th gen)."
  - "Intel® recommends that you update the BIOS on systems for compatibility before updating your Intel® Core™" / "desktop processors."
  - The next paragraph says: "Intel® 600 Series and Intel® 700 Series may require a BIOS update when upgrading between" / " Intel® Core™ Desktop Processors 12th, 13th, or 14th gen." ([KB92294])
  - The article links to board makers' BIOS pages (ASRock, ASUS, Biostar, Colorful, EVGA, Gigabyte, MSI, NZXT, Shangke/Maxsun/SOYO). It gives no BIOS version numbers. "This list does not include all motherboard manufacturers."
  - **ASUS note.** In brackets straight after the ASUS link, the article says: "ME firmware may need to be updated before BIOS, so refer to this" / "How to Resolve Issues with Systems of ASUS* 600 Chipset Series and 13th Gen Intel® Processor After Updating the BIOS" / " for more details)." The middle piece is the title of a linked article, which I did not open. The linked title names ASUS 600-series boards. Whether the note also applies to ASUS 700-series boards is not stated ([KB92294]).
- Intel's older page "Required BIOS Updates for Intel® 600 Series Chipset and 13th Gen Intel® Core™ Desktop Processors" ([CPBIOS]):
  - "Intel® Z690 chipset-based motherboards may not boot with the recently launched 13th Gen Intel® Core™ desktop processors."
  - "Intel® Z690 chipset-based motherboards may require a BIOS update to boot the 13th Gen Intel® Core™ desktop processors."
  - "Intel recommends that you update the BIOS on your Intel 600 Series Chipset-based systems for compatibility" / "before using the 13th Gen Intel® Core™ desktop processors."
  - In its 600-series section it names only Z690 for the "may not boot" problem, but it recommends updating the BIOS on all "Intel 600 Series Chipset-based systems" "for compatibility before using the 13th Gen" processors. It does not mention 14th gen. The page's other sections cover the Intel 400 Series Chipset (with 11th Gen Core and with Xeon W-1300) and an i9-11900K/KF BIOS advisory ([CPBIOS]).
- Intel support article 000096847, "Compatibility of Intel® Core™ Desktop Processors (14th gen)", Last Reviewed 02/06/2025 ([KB96847]):
  - "Intel® 600 Series and Intel® 700 Series require a BIOS update when upgrading from Intel® Core™ Desktop Processors 12th or" / "13th to a 14th gen." This is one continuous sentence.
  - 14th gen "use the LGA1700 socket and require motherboards based on" the 700 and 600 series (the second half is **tool paraphrase**).
- Intel support article 000092149, "Compatibility of Intel® Core™ Desktop Processors (12th, 13th and 14th gen)", Last Reviewed 02/06/2025 ([KB92149]):
  - "12th Generation Intel® Desktop Processors, 13th Generation Intel® Desktop Processors and" / "Intel® Core™ Desktop processors (14th gen) use the LGA1700 socket and require motherboards" / "based on Intel® 600 Series Desktop Chipset or Intel® 700 Series Desktop Chipsets."
  - "Intel® 600 and Intel® 700 Series motherboards may require the latest BIOS/FW/CSME from manufacturer" / "when upgrading between Intel® Core™ Desktop Processors 12th, 13th or 14th gen."
  - These processors "aren't compatible with motherboards based on Intel® 500 Series Desktop Chipsets," the 400, 300, 200 and 100 series, "or the latest Intel® 800 Series Desktop Chipsets."
- **The sources word this differently, even within one article.** KB92294 says 600/700 boards "require a BIOS update to boot" 13th and 14th gen, and in the next paragraph that they "may require a BIOS update when upgrading between" 12th, 13th or 14th gen ([KB92294]). KB92149 says "may require the latest BIOS/FW/CSME" for the same upgrades ([KB92149]). KB96847 says they "require a BIOS update when upgrading from" 12th or 13th to 14th gen ([KB96847]). The older Z690 page says "may not boot" and "may require" ([CPBIOS]). KB92294 gives no BIOS version numbers. All of these are Intel's words. (Inference, not stated by Intel: for a used 600- or 700-series board with a 13th or 14th gen CPU, assume the board's BIOS must be updated before that CPU will boot, unless the board maker's CPU support list shows that the installed BIOS version already supports it. This follows KB92294's wording, which names both series and both generations; KB96847 names only the 12th/13th-to-14th upgrade.)

**Memory type (DDR4 vs DDR5)**
- The chipset spec pages have no memory-type field ([H610], [B660], [H670], [Z690], [B760], [H770], [Z790]; details in the note at the top of the file).
- KB92149 gives memory support **per processor**: "Both Intel® Core™ Desktop Processors (13th and 14th gen) support DDR5 (Up to 4800/5600 MTs)" / "& DDR4 (Up to 3200 MT/s) speeds." and "While the 12th Generation Intel® Desktop Processors support DDR5 (Up to 4800 MT/s) & DDR4 (Up to 3200 MT/s) speeds." The tool noted that the article does not say which memory type a given board or chipset supports **(tool paraphrase)**.
- **One memory type per system.** Intel's 12th Gen Core Processors Datasheet, Volume 1 of 2 (Doc. 655258, Rev. 011, May 2025), section 5.1.4 "Memory Controller (MC)" ([DS12]): "Both MC support only one technology in a system DDR4, DDR5, LPDDR4X, or LPDDR5/x." and "Mix of technologies in one system is not allowed." This is a processor statement about a system, not a chipset statement. I found no Intel sentence saying in so many words that "each board supports only one".
- Same datasheet, Table 28 notes ([DS12]): "DDR4/DDR5 ECC is supported only when all memory populated in the system supports ECC." and "DDR4/DDR5 SoDIMM 2DPC - Not supported on S -Processor Line."
- Intel support article 000088926 (600-series boards with 12th gen, Last Reviewed 01/20/2022, [KB88926]): "When mixed DIMMs are populated, the memory speed may be lower than target or the system may not boot." and "This applies to DDR5 and DDR4 memory modules / DIMMs."

**ECC.** Every 600/700 consumer chipset page below says "ECC Memory Supported ‡: No". The W680 chipset page says "Yes" ([W680]). The W680 brief only says "Error Correcting Code (ECC) memory support minimizes errors…" and does not list which CPUs ([W680B]).
- Intel article 000096922, "How to Find ECC Memory Support for Intel® Processor" (Last Reviewed 01/17/2025): "Note that ECC memory support requires both processor and chipset support." ([KB96922])
- Two more 600-series chipsets that appear on 12th gen compatible lists, but have no section here, also say "ECC Memory Supported ‡": "No": Q670 ([Q670]) and H610E ("Vertical Segment": "Embedded") ([H610E]).
- So of the chipsets on the 12th gen compatible lists in this file (H610, B660, H670, Z690, B760, H770, Z790, W680, Q670, H610E), only W680 says ECC "Yes" ([W680]). The others say "No" ([H610], [B660], [H670], [Z690], [B760], [H770], [Z790], [Q670], [H610E]). (Inference, not stated by Intel: for the 12th gen CPUs in this file whose spec pages say ECC "Yes" (i5-12600K, i7-12700, i7-12700K), ECC needs a W680 board. The chipset alone is not enough: Intel's article on Core i5 desktop processors says "If your processor is supporting ECC, you need to check with your motherboard vendor if they are also supporting it." ([KB6047]). For the i5-12400, i5-12400F and i7-12700F, ECC is not stated. The 13th/14th gen compatible lists were not checked.)

Sources:
- [KB92294] https://www.intel.com/content/www/us/en/support/articles/000092294.html
- [CPBIOS] https://compatibleproducts.intel.com/FeaturedLinks/BIOSUpdate.html
- [KB96847] https://www.intel.com/content/www/us/en/support/articles/000096847.html
- [KB92149] https://www.intel.com/content/www/us/en/support/articles/000092149.html
- [KB88926] https://www.intel.com/content/www/us/en/support/articles/000088926.html
- [DS12] https://cdrdv2-public.intel.com/655258/655258-011.pdf
- [W680] https://www.intel.com/content/www/us/en/products/sku/218834/intel-w680-chipset/specifications.html
- [W680B] https://intel.com/content/www/us/en/products/docs/chipsets/w680-chipset-brief.html
- [KB96922] https://www.intel.com/content/www/us/en/support/articles/000096922.html
- [KB6047] https://www.intel.com/content/www/us/en/support/articles/000006047/processors.html ("Information about Intel® Core™ i5 Desktop Processors", Last Reviewed 02/06/2025, section "Error Correction Code (ECC) memory support")
- [Q670] https://www.intel.com/content/www/us/en/products/sku/218827/intel-q670-chipset/specifications.html
- [H610E] https://www.intel.com/content/www/us/en/products/sku/225973/intel-h610e-chipset/specifications.html
- [H610] https://www.intel.com/content/www/us/en/products/sku/218829/intel-h610-chipset/specifications.html
- [B660] https://www.intel.com/content/www/us/en/products/sku/218832/intel-b660-chipset/specifications.html
- [H670] https://www.intel.com/content/www/us/en/products/sku/218831/intel-h670-chipset/specifications.html
- [Z690] https://www.intel.com/content/www/us/en/products/sku/218833/intel-z690-chipset/specifications.html
- [B760] https://www.intel.com/content/www/us/en/products/sku/229719/intel-b760-chipset/specifications.html
- [H770] https://www.intel.com/content/www/us/en/products/sku/229720/intel-h770-chipset/specifications.html
- [Z790] https://www.intel.com/content/www/us/en/products/sku/229721/intel-z790-chipset/specifications.html

## Intel H610 chipset (LGA1700)

- **Family / launch:** "Intel® 600 Series Desktop Chipsets", "Products formerly Alder Lake", Launch Date "Q1'22", Chipset Base Power "6 W" ([SPEC]).
- **Core generations (Intel's compatible list):** the list has headings for 14th gen Core i9/i7/i5/i3, "13th Generation Intel® Core™" i9/i7/i5/i3 and "12th Generation Intel® Core™" i9/i7/i5/i3. It also lists "Intel® Processor for Desktop", Pentium Gold and Celeron G. **12th, 13th and 14th gen are all listed.** H610 also has a heading "Intel® Core™ processors (Series 2)" with 19 entries (tool count), which the other chipsets don't have. There is no BIOS footnote on the list ([COMP]).
- **BIOS for 13th/14th gen:** Intel says 600-series boards "require a BIOS update to boot" 13th and 14th gen, and in the next paragraph of the same article that they "may require a BIOS update when upgrading between" 12th, 13th or 14th gen ([KB92294]). A second article says "may require" ([KB92149]). For ASUS boards, KB92294 notes: "ME firmware may need to be updated before BIOS" ([KB92294]).
- **Memory:**
  - Memory type: not stated on the chipset page. DDR4 and DDR5 are listed per CPU ([KB92149]), and Intel says one memory technology per system ([DS12]).
  - "# of DIMMs per channel": "1" ([SPEC]). **This is the only LGA1700 chipset here with 1, not 2.**
  - "ECC Memory Supported ‡": "No" ([SPEC]).
- **Overclocking:**
  - "Supports Memory Overclocking": "No" ([SPEC]).
  - There is no "Supports Overclocking" field on the page ([SPEC]).
- **PCIe from the chipset:**
  - "PCI Express Revision": "3.0". "Max # of PCI Express Lanes": "8". "PCI Express Configurations ‡": "x1, x2, x4" ([SPEC]).
  - DMI "4.0", "Max # of DMI Lanes": "4" ([SPEC]).
  - "Supported Processor PCI Express Port Configurations": "PCIe 5.0: 1x16". **Unlike B660, H670 and Z690, it lists no "PCIe 4.0: 1x4" entry** ([SPEC]).
- **Other:** 4 SATA 6 Gb/s ports. 10 USB ports (up to 2 USB 3.2 Gen 2x1 and no 20 Gb/s). "# of Displays Supported": "3" ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/218829/intel-h610-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/218829/intel-h610-chipset/compatible.html
- [KB92294] https://www.intel.com/content/www/us/en/support/articles/000092294.html
- [KB92149] https://www.intel.com/content/www/us/en/support/articles/000092149.html
- [DS12] https://cdrdv2-public.intel.com/655258/655258-011.pdf

## Intel B660 chipset (LGA1700)

- **Family / launch:** "Intel® 600 Series Desktop Chipsets", Launch Date "Q1'22", Chipset Base Power "6 W" ([SPEC]).
- **Core generations (compatible list):** 14th gen i9/i7/i5/i3, 13th gen i9/i7/i5/i3 and 12th gen i9/i7/i5/i3 headings, plus Intel Processor for Desktop, Pentium Gold and Celeron G. That is 92 processors under 15 headings (tool count). **12th, 13th and 14th gen are all listed.** There is no BIOS footnote ([COMP]).
- **BIOS for 13th/14th gen:** Intel says 600-series boards "require a BIOS update to boot" 13th and 14th gen, and in the next paragraph of the same article that they "may require a BIOS update when upgrading between" 12th, 13th or 14th gen ([KB92294]). A second article says "may require" ([KB92149]). For ASUS boards, KB92294 notes: "ME firmware may need to be updated before BIOS" ([KB92294]).
- **Memory:**
  - Type: not stated on the chipset page. DDR4 and DDR5 are listed per CPU ([KB92149]), and Intel says one memory technology per system ([DS12]).
  - "# of DIMMs per channel": "2". "ECC Memory Supported ‡": "No" ([SPEC]).
- **Overclocking:** "Supports Memory Overclocking": "Yes". "Supports Overclocking": "Memory" (no IA or BCLK) ([SPEC]).
- **PCIe from the chipset:**
  - "PCI Express Revision": "3.0, 4.0". "Max # of PCI Express Lanes": "14". Configurations "x1, x2, x4". DMI "4.0" with "4" lanes ([SPEC]).
  - The B660 brief says "The B660 Chipset supports up to 14 PCIe Gen 4.0 and PCIe 3.0 lanes". It gives no Gen4/Gen3 split ([BRIEF]).
  - "Supported Processor PCI Express Port Configurations": "PCIe 5.0: 1x16, PCIe 4.0: 1x4" ([SPEC]).
- **Other:** 4 SATA 6 Gb/s ports. 12 USB ports, up to 2 of them USB 3.2 Gen 2x2 ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/218832/intel-b660-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/218832/intel-b660-chipset/compatible.html
- [BRIEF] https://www.intel.com/content/www/us/en/products/docs/chipsets/desktop-chipsets/b660-chipset-brief.html
- [KB92294] https://www.intel.com/content/www/us/en/support/articles/000092294.html
- [KB92149] https://www.intel.com/content/www/us/en/support/articles/000092149.html
- [DS12] https://cdrdv2-public.intel.com/655258/655258-011.pdf

## Intel H670 chipset (LGA1700)

- **Family / launch:** "Intel® 600 Series Desktop Chipsets", Launch Date "Q1'22", Chipset Base Power "6 W" ([SPEC]).
- **Core generations (compatible list):** 14th, 13th and 12th gen Core i9/i7/i5/i3 headings, plus Intel Processor for Desktop, Pentium Gold and Celeron G. **12th, 13th and 14th gen are all listed.** There is no BIOS footnote ([COMP]).
- **BIOS for 13th/14th gen:** Intel says 600-series boards "require a BIOS update to boot" 13th and 14th gen, and in the next paragraph of the same article that they "may require a BIOS update when upgrading between" 12th, 13th or 14th gen ([KB92294]). A second article says "may require" ([KB92149]). For ASUS boards, KB92294 notes: "ME firmware may need to be updated before BIOS" ([KB92294]).
- **Memory:**
  - Type: not stated on the chipset page. DDR4 and DDR5 are listed per CPU ([KB92149]), and Intel says one memory technology per system ([DS12]).
  - "# of DIMMs per channel": "2". "ECC Memory Supported ‡": "No" ([SPEC]).
- **Overclocking:** "Supports Memory Overclocking": "Yes". "Supports Overclocking": "Memory" ([SPEC]). The page footnote says: "Unlocked features are present with select chipsets and processor combinations." ([SPEC])
- **PCIe from the chipset:**
  - "PCI Express Revision": "3.0, 4.0". "Max # of PCI Express Lanes": "24". DMI "4.0" with "8" lanes ([SPEC]).
  - Gen4/Gen3 split: not stated on any Intel page I could read.
  - "Supported Processor PCI Express Port Configurations": "PCIe 5.0: 1x16 or 2x8, PCIe 4.0: 1x4" ([SPEC]).
- **Other:** 8 SATA 6 Gb/s ports. 14 USB ports ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/218831/intel-h670-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/218831/intel-h670-chipset/compatible.html
- [KB92294] https://www.intel.com/content/www/us/en/support/articles/000092294.html
- [KB92149] https://www.intel.com/content/www/us/en/support/articles/000092149.html
- [DS12] https://cdrdv2-public.intel.com/655258/655258-011.pdf

## Intel Z690 chipset (LGA1700)

- **Family / launch:** "Intel® 600 Series Desktop Chipsets", Launch Date "Q4'21", Chipset Base Power "6 W" ([SPEC]).
- **Core generations (compatible list):** 92 processors under 15 headings (tool count): 14th gen i9 (5), i7 (6), i5 (7), i3 (3); 13th gen i9 (6), i7 (6), i5 (9), i3 (3); 12th gen i9 (8), i7 (8), i5 (13), i3 (8); plus Intel Processor for Desktop, Pentium Gold G7400 family and Celeron G6900 family. **12th, 13th and 14th gen are all listed.** There is no BIOS footnote ([COMP]).
- **BIOS for 13th/14th gen:**
  - Intel singles out Z690: "Intel® Z690 chipset-based motherboards may not boot with the recently launched 13th Gen Intel® Core™ desktop processors." ([CPBIOS])
  - The same page's advice covers all 600-series boards, not only Z690: "Intel recommends that you update the BIOS on your Intel 600 Series Chipset-based systems for compatibility" / "before using the 13th Gen Intel® Core™ desktop processors." It does not mention 14th gen ([CPBIOS]).
  - For the 600/700 series in general: KB92294 says they "require a BIOS update to boot" 13th and 14th gen, and in the next paragraph that they "may require a BIOS update when upgrading between" 12th, 13th or 14th gen ([KB92294]). KB92149 says "may require" ([KB92149]). KB96847 says they "require a BIOS update when upgrading from" 12th or 13th to 14th gen ([KB96847]).
  - For ASUS boards, KB92294 notes: "ME firmware may need to be updated before BIOS" ([KB92294]).
  - KB96847: older 11th to 6th gen processors "aren't compatible with the Intel® Z790 and Z690 Desktop Chipset based motherboards."
- **Memory:**
  - Type: not stated on the chipset page. DDR4 and DDR5 are listed per CPU ([KB92149]), and Intel says one memory technology per system ([DS12]).
  - "# of DIMMs per channel": "2". "ECC Memory Supported ‡": "No" ([SPEC]).
- **Overclocking:** "Supports Memory Overclocking": "Yes". "Supports Overclocking": "IA, BCLK, Memory" ([SPEC]). The Z690 brief says: "The Intel® Z690 Chipset and Unlocked 12th Gen Intel® Core™ desktop processors allow for enhanced overclocking capabilities" ([BRIEF]). The 12th Gen product brief says that "When paired with the Intel® Z690 chipset, processor P-cores, E-cores, graphics, and memory can be set to run at frequencies above the processor specification" ([PB12]).
- **PCIe from the chipset:**
  - "PCI Express Revision": "3.0, 4.0". "Max # of PCI Express Lanes": "28". DMI "4.0" with "8" lanes ([SPEC]).
  - The brief says "support for up to 28 PCIe Gen 4.0 and PCIe Gen 3.0 lanes" but gives no split ([BRIEF]).
  - "Supported Processor PCI Express Port Configurations": "PCIe 5.0: 1x16 or 2x8, PCIe 4.0: 1x4" ([SPEC]).
- **Other:** 8 SATA 6 Gb/s ports. 14 USB ports, up to 4 of them USB 3.2 Gen 2x2 ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/218833/intel-z690-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/218833/intel-z690-chipset/compatible.html
- [BRIEF] https://www.intel.com/content/www/us/en/products/docs/chipsets/desktop-chipsets/z690-chipset-brief.html
- [PB12] https://cdrdv2-public.intel.com/710604/12th-gen-processor-product-brief.pdf
- [CPBIOS] https://compatibleproducts.intel.com/FeaturedLinks/BIOSUpdate.html
- [KB96847] https://www.intel.com/content/www/us/en/support/articles/000096847.html
- [KB92294] https://www.intel.com/content/www/us/en/support/articles/000092294.html
- [KB92149] https://www.intel.com/content/www/us/en/support/articles/000092149.html
- [DS12] https://cdrdv2-public.intel.com/655258/655258-011.pdf

## Intel B760 chipset (LGA1700)

- **Family / launch:** "Intel® 700 Series Desktop Chipsets", "Products formerly Raptor Lake", Launch Date "Q1'23", Chipset Base Power "6 W" ([SPEC]).
- **Core generations (compatible list):** 14th, 13th and 12th gen Core i9/i7/i5/i3 headings, plus Intel Processor for Desktop, Pentium Gold and Celeron G. **12th, 13th and 14th gen are all listed.** There is no BIOS footnote ([COMP]).
- **BIOS:** KB92294 covers the 700 series too, saying they "require a BIOS update to boot" 13th and 14th gen, and in the next paragraph that they "may require a BIOS update when upgrading between" 12th, 13th or 14th gen ([KB92294]). KB92149 says "may require" for the same upgrades ([KB92149]). KB96847 says the 700 series requires a BIOS update when going from 12th or 13th to 14th gen ([KB96847]).
- **Memory:**
  - Type: not stated on the chipset page or in the datasheet SKU table. DDR4 and DDR5 are listed per CPU ([KB92149]), and Intel says one memory technology per system ([DS12]).
  - "# of DIMMs per channel": "2". "ECC Memory Supported ‡": "No" ([SPEC]).
  - Datasheet: "System Memory Channels/DPC" "2 / 2" ([PCH7]).
- **Overclocking:**
  - "Supports Memory Overclocking": "Yes". "Supports Overclocking": "Memory" ([SPEC]).
  - Datasheet SKU table: "IA and BCLK Overclocking" "NO", "Memory Overclocking" "YES" ([PCH7]).
  - Brief, on H770 and B760: "Both chipsets support memory overclocking1 but offer distinct I/O and PCIe processor configurations." ([BRIEF])
- **PCIe from the chipset:**
  - Spec page: "PCI Express Revision": "3.0, 4.0". "Max # of PCI Express Lanes": "14". DMI "4.0" with "4" lanes ([SPEC]).
  - **Split:** "Maximum PCIe Gen4 Lanes" 10 and "Maximum PCIe Gen3 Lanes" 4. DMI x4 ([PCH7]).
  - The brief agrees: "The B760 brings up to 10 PCIe 4.0 lanes and 4 PCIe 3.0 lanes…" ([BRIEF]).
  - Processor PCIe: "PCIe 5.0: 1x16, PCIe 4.0: 1x4" ([SPEC]). The datasheet gives "1x16" for 5.0 and "1x4" for 4.0 ([PCH7]).
- **Other:** 4 SATA 6 Gb/s ports. 12 USB ports ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/229719/intel-b760-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/229719/intel-b760-chipset/compatible.html
- [PCH7] Intel 700 Series Chipset Family PCH Datasheet Vol. 1, Doc. 743835, "Desktop PCH SKUs" table, read twice:
  - https://edc.intel.com/content/www/us/en/design/products-and-solutions/processors-and-chipsets/700-series-chipset-family-platform-controller-hub-datasheet-volume-1-of/pch-skus/ (page title says revision 005)
  - https://edc.intel.com/structured-content/output/DownloadPdfDocument?id=6404 (the tool reported Rev. 004, April 12, 2024)
  - Both gave the same values.
- [BRIEF] https://www.intel.com/content/www/us/en/products/docs/chipsets/desktop-chipsets/z790-chipset-brief.html (this page covers Z790, H770 and B760)
- [KB92294] https://www.intel.com/content/www/us/en/support/articles/000092294.html
- [KB96847] https://www.intel.com/content/www/us/en/support/articles/000096847.html
- [KB92149] https://www.intel.com/content/www/us/en/support/articles/000092149.html
- [DS12] https://cdrdv2-public.intel.com/655258/655258-011.pdf

## Intel H770 chipset (LGA1700)

- **Family / launch:** "Intel® 700 Series Desktop Chipsets", Launch Date "Q1'23", Chipset Base Power "6 W" ([SPEC]).
- **Core generations (compatible list):** 14th, 13th and 12th gen Core i9/i7/i5/i3 headings, plus Intel Processor for Desktop, Pentium Gold and Celeron G. **All three generations are listed.** There is no BIOS footnote ([COMP]).
- **BIOS:** KB92294 says 700-series boards "require a BIOS update to boot" 13th and 14th gen, and in the next paragraph that they "may require a BIOS update when upgrading between" 12th, 13th or 14th gen ([KB92294]). KB92149 says "may require" for the same upgrades ([KB92149]). KB96847 says the 700 series requires a BIOS update when going from 12th or 13th to 14th gen ([KB96847]).
- **Memory:**
  - Type: not stated on the chipset page. DDR4 and DDR5 are listed per CPU ([KB92149]), and Intel says one memory technology per system ([DS12]).
  - "# of DIMMs per channel": "2". "ECC Memory Supported ‡": "No" ([SPEC]).
  - Datasheet: "System Memory Channels/DPC" "2 / 2" ([PCH7]).
- **Overclocking:**
  - "Supports Memory Overclocking": "Yes". "Supports Overclocking": "Memory" ([SPEC]).
  - Datasheet: "IA and BCLK Overclocking" "NO", "Memory Overclocking" "YES" ([PCH7]).
- **PCIe from the chipset:**
  - Spec page: "PCI Express Revision": "3.0, 4.0". "Max # of PCI Express Lanes": "24". DMI "4.0" with "8" lanes ([SPEC]).
  - **Split:** Gen4 16, Gen3 8, DMI x8 ([PCH7]).
  - The brief agrees: "up to 16 PCIe 4.0 lanes, 8 PCIe 3.0 lanes, bifurcation of the CPU PCIe lanes" ([BRIEF]).
  - Processor PCIe: "1x16+1x4 or 2x8+1x4" ([SPEC]). The datasheet gives "1x16 or 2x8" for 5.0 and "1x4" for 4.0 ([PCH7]).
- **Other:** 8 SATA 6 Gb/s ports. 14 USB ports ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/229720/intel-h770-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/229720/intel-h770-chipset/compatible.html
- [PCH7] Intel 700 Series Chipset Family PCH Datasheet Vol. 1, Doc. 743835, "Desktop PCH SKUs" table:
  - https://edc.intel.com/content/www/us/en/design/products-and-solutions/processors-and-chipsets/700-series-chipset-family-platform-controller-hub-datasheet-volume-1-of/pch-skus/ (page title says revision 005)
  - https://edc.intel.com/structured-content/output/DownloadPdfDocument?id=6404 (the tool reported Rev. 004, April 12, 2024)
- [BRIEF] https://www.intel.com/content/www/us/en/products/docs/chipsets/desktop-chipsets/z790-chipset-brief.html (this page covers Z790, H770 and B760)
- [KB92294] https://www.intel.com/content/www/us/en/support/articles/000092294.html
- [KB96847] https://www.intel.com/content/www/us/en/support/articles/000096847.html
- [KB92149] https://www.intel.com/content/www/us/en/support/articles/000092149.html
- [DS12] https://cdrdv2-public.intel.com/655258/655258-011.pdf

## Intel Z790 chipset (LGA1700)

- **Family / launch:** "Intel® 700 Series Desktop Chipsets", Launch Date "Q4'22", Chipset Base Power "6 W" ([SPEC]).
- **Core generations (compatible list):** 14th, 13th and 12th gen Core i9/i7/i5/i3 headings, plus Intel Processor for Desktop, Pentium Gold and Celeron G. **All three generations are listed.** There is no BIOS footnote ([COMP]).
- **BIOS:**
  - KB92294 says 700-series boards "require a BIOS update to boot" 13th and 14th gen, and in the next paragraph that they "may require a BIOS update when upgrading between" 12th, 13th or 14th gen ([KB92294]). KB92149 says "may require" for the same upgrades ([KB92149]). KB96847 says the 700 series requires a BIOS update when going from 12th or 13th to 14th gen ([KB96847]).
  - KB96847: 11th to 6th gen "aren't compatible with the Intel® Z790 and Z690 Desktop Chipset based motherboards."
- **Memory:**
  - Type: not stated. I asked the tool to search the spec page for "DDR4", "DDR5" and "Memory Types", and it found none ([SPEC]).
  - "# of DIMMs per channel": "2". "ECC Memory Supported ‡": "No" ([SPEC]).
  - Datasheet: "System Memory Channels/DPC" "2 / 2" ([PCH7]).
- **Overclocking:**
  - "Supports Memory Overclocking": "Yes". "Supports Overclocking": "IA, BCLK, Memory" ([SPEC]).
  - Datasheet: "IA and BCLK Overclocking" "YES", "Memory Overclocking" "YES" ([PCH7]).
  - Brief: "Optimized for overclocking1 and precision tuning when paired with an unlocked processor" ([BRIEF]).
- **PCIe from the chipset:**
  - Spec page: "PCI Express Revision": "3.0, 4.0". "Max # of PCI Express Lanes": "28". DMI "4.0" with "8" lanes ([SPEC]).
  - **Split:** Gen4 20, Gen3 8, DMI x8 ([PCH7]).
  - The brief agrees: "including 20 PCIe 4.0 lanes, 8 PCIe 3.0 lanes" ([BRIEF]).
  - Processor PCIe: "PCIe 5.0: 1x16 or 2x8, PCIe 4.0: 1x4" ([SPEC], [PCH7]).
- **Other:** 8 SATA 6 Gb/s ports. 14 USB ports, up to 5 of them USB 3.2 Gen 2x2 ([SPEC]).

Sources:
- [SPEC] https://www.intel.com/content/www/us/en/products/sku/229721/intel-z790-chipset/specifications.html
- [COMP] https://www.intel.com/content/www/us/en/products/sku/229721/intel-z790-chipset/compatible.html
- [PCH7] Intel 700 Series Chipset Family PCH Datasheet Vol. 1, Doc. 743835, "Desktop PCH SKUs" table:
  - https://edc.intel.com/content/www/us/en/design/products-and-solutions/processors-and-chipsets/700-series-chipset-family-platform-controller-hub-datasheet-volume-1-of/pch-skus/ (page title says revision 005)
  - https://edc.intel.com/structured-content/output/DownloadPdfDocument?id=6404 (the tool reported Rev. 004, April 12, 2024)
- [BRIEF] https://www.intel.com/content/www/us/en/products/docs/chipsets/desktop-chipsets/z790-chipset-brief.html (this page covers Z790, H770 and B760)
- [KB92294] https://www.intel.com/content/www/us/en/support/articles/000092294.html
- [KB96847] https://www.intel.com/content/www/us/en/support/articles/000096847.html
- [KB92149] https://www.intel.com/content/www/us/en/support/articles/000092149.html
- [DS12] https://cdrdv2-public.intel.com/655258/655258-011.pdf
