# Intel Xeon E-2100 and E-2200

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled. The Xeon E-2236 is in [intel-cpus.md](intel-cpus.md).

## How the pages were read

- intel.com is blocked from the shell here, so every Intel page was read with the WebFetch tool, never curl. That tool turns a page into text and answers questions about it. It limits each verbatim quote to about 125 characters, so long sentences came back split into pieces. I asked for exact labels and values every time. Text in "quotes" is what the tool returned as verbatim. Where the tool said it paraphrased, I mark it **(tool paraphrase)**.
- Each model has a `/specifications.html` page and a `/compatible.html` page ("Compatible Products"). I read both for all 21 models. I got the URLs from the links on Intel's C246 compatible page, so the SKU numbers in the URLs come from Intel's site. I did not build them by guesswork.
- Each model also has an `/ordering.html` page ("Ordering & Compliance"), which gives the "Spec Code" (sSpec) and "Stepping". I read it for all 21 models. The E-2124G and E-2224 spec pages link to their ordering pages under "Ordering & Compliance". For the other 19 I built the URL by replacing `specifications.html` with `ordering.html` in the spec-page URL. Every one loaded and named the right processor.
- **There is no field called "Processor Graphics" on these pages.** The graphics name is in a field labelled "GPU Name‡", in a "GPU Specifications" section. The "Graphics" column below uses that field.
- The tool was not consistent about the "‡" marker after labels such as "ECC Memory Supported ‡", "GPU Name‡" and "PCI Express Configurations ‡". It kept the marker on some pages and dropped it on others. Where a "‡" appears below, the tool reported it. Where none appears, it may still be on the page.
- Intel PDFs: the fetch tool reads 100,000 characters per call. For the datasheet (273,632 characters) I read only the first 100,000. For the combined spec update (136,794 characters) I read all of it in two calls. For the E-2100 spec update (111,066 characters) I read the first 100,000, which contains the sSpec table.
- "not stated" means it was not in what I read. Nothing here is from memory unless it is marked "(from memory, unchecked)". I did not open any eBay page.

## Shared statements for the Xeon E-2100 and E-2200 series

These match on all 21 spec pages unless a note under a table says otherwise.

- **Family:** "Product Collection": "Intel® Xeon® E Processor". "Code Name": "Products formerly Coffee Lake". "Vertical Segment": "Server" (every spec page).
- **Socket:** "Sockets Supported": "FCLGA1151" (every spec page). The datasheet says: "The processor is available in A 37.5 mm x 37.5 mm LGA package (LGA1151)" ([DS1], section 1.4).
- **Memory (spec pages):** "Memory Types": "DDR4-2666". "Max Memory Size (dependent on memory type)": "128 GB". "Max # of Memory Channels": "2" (every spec page).
- **128 GB note (the wording differs by series, on every page of that series):**
  - E-2100 pages: "Support for up to 128GB system memory capacity will be available in 2019 and requires both a BIOS update and hardware platform support." / "Please contact your hardware provider regarding availability for your system." On the E-2186G page the tool quoted only the first part and paraphrased the rest **(tool paraphrase)**.
  - E-2200 pages: "Support for up to 128GB system memory may require a BIOS update." / "Please contact your hardware provider regarding availability for your system."
- **Memory (datasheet [DS1], E-2100 and E-2200 together):**
  - "Two channels of DDR4 memory with a maximum of two DIMMs per channel" (section 2.1).
  - Speed: 2666 MT/s at both 1 DIMM per channel and 2 DIMMs per channel, Table 2-1 **(tool paraphrase of a table)**. Table 2-1 note 2: 2DPC 2666 MT/s UDIMM is supported "when channel is populated with the same UDIMM part number".
  - "ECC is supported by Servers and Workstations" (section 2.1). Section 2.1's feature list names UDIMMs only: "UDIMM support (based on SKU)" and "ECC/Non-ECC UDIMM DDR4 support". The memory chapter also has SODIMM tables, "Supported DDR4 Non-ECC SODIMM Module Configurations" (Table 2-4) and "Supported DDR4 ECC SODIMM Module Configurations" (Table 2-5), and Table 2-6, "DRAM System Memory Timing Support", has a "DPC (SODIMM Only)" column. The text read doesn't say which SKUs the SODIMM tables apply to; the tool saw the titles of Tables 2-4 and 2-5 only in the list of tables, not their bodies. RDIMM/LRDIMM: not stated in the part read ("RDIMM", "LRDIMM", "registered" and "buffered" don't appear in the first 100,000 characters).
  - Module sizes in the UDIMM tables ("Supported DDR4 Non-ECC UDIMM Module Configurations", Table 2-2, and "Supported DDR4 ECC UDIMM Module Configurations", Table 2-3) go up to 32 GB, and that row uses 16Gb DRAM devices (2048M x 8) **(tool paraphrase of a table)**. But section 2.1.1 says only: "Standard 4-Gb and 8-Gb technologies and addressing are supported for x8 and x16 devices." So the datasheet's section 2.1.1 mentions only 4-Gb and 8-Gb devices, while Tables 2-2 and 2-3 list a 32 GB UDIMM using 16Gb devices. The spec pages give no per-DIMM limit.
- **ECC:** "ECC Memory Supported ‡": "Yes" (every spec page). The ‡ footnote reads: "This feature may not be available on all computing systems." On some pages the tool also returned the rest of the footnote: "Please check with the system vendor to determine if your system delivers this feature," / "or reference the system specifications (motherboard, processor, chipset, power supply, HDD, graphics controller," / "memory, BIOS, drivers, virtual machine monitor-VMM, platform software, and/or operating system) for feature compatibility." / "Functionality, performance, and other benefits of this feature may vary depending on system configuration." (E-2124G, E-2224 and E-2246G pages; the tool split the long sentence at different points on different reads).
- **PCIe (spec pages):** "PCI Express Revision": "3.0". "Max # of PCI Express Lanes": "16". "PCI Express Configurations": "1x16,2x8,1x8+2x4". The E-2124G and E-2176G pages word it "Up to 1x16, 2x8, 1x8+2x4".
- **PCIe (datasheet):** "The processor PCI Express ports support Gen 3." The link to the chipset is "4 lanes 3.0 DMI support" ([DS1], sections 2.2.2 and 2.3).
- **Compatible chipsets (Intel's lists):**
  - **E-2100 model pages:** all 10 list two chipsets under the heading "Intel® C240 Series Chipsets": "Intel® C242 Chipset" and "Intel® C246 Chipset".
  - **E-2200 model pages:** all 11 list only "Intel® C246 Chipset", under the same heading. **None lists the C242.**
  - The C246 page's own compatible list has one heading, "Intel® Xeon® E Processor", with 34 processors (my count of the tool's list). **All 21 models here are on it** ([C246C]). The list also has mobile and embedded parts (E-2176M, E-2186M, E-2276M, E-2286M, E-2254ME/ML, E-2276ME/ML, E-2226GE, E-2278GE, E-2278GEL) and the E-2104G and E-2236.
  - The C242 page's own compatible list has 11 processors, **all E-2100**: E-2174G, E-2146G, E-2104G, E-2134, E-2144G, E-2126G, E-2124G, E-2186G, E-2124, E-2136 and E-2176G. **No E-2200 is listed** ([C242C]).
  - **Sources differ: E-2200 with C242.** HPE's MicroServer Gen10 Plus QuickSpecs give the chipset as "Intel® C242 Chipset" and offer the "Xeon E-2224" under the heading "Intel Xeon E-2200 Series / 9th Gen Pentium G" ([HPEQS]; the document is marked "RETIRED: This document has been officially retired"). Intel's C242 compatible list has no E-2200 ([C242C]), and no E-2200 model's compatible page lists the C242 (re-checked on the E-2224 compatible page, whose only chipset is "Intel® C246 Chipset"). That is all these sources show. My wider reading: this one HPE machine does not show that other C242 boards run E-2200 chips. Intel does list every E-2200 model with the C246 ([C246C]), but that is a chipset list, not a board list. Whether a given C242 or C246 board runs a given E-2200 chip depends on that board maker's CPU support list and the BIOS on the board, which this file doesn't cover (inference, not stated by Intel).
  - The datasheet names only the chipset family: "two-chip platform with Intel® C240 Series Chipset Family Platform Controller Hub (PCH)". The tool reported that it does not mention C246 or C242 ([DS1], section 1).
- **The two chipsets (spec pages):**
  - **C246:** "Intel® C240 Series Chipsets", "Server", launched "Q3'18". "ECC Memory Supported ‡": "Yes". "# of DIMMs per channel": "2". PCIe "3.0" with "24" lanes. "Max # of SATA 6.0 Gb/s Ports": "8". No "Memory Types" field ([C246S]).
  - **C242:** "Intel® C240 Series Chipsets", "Server", launched "Q4'18". "ECC Memory Supported ‡": "Yes". "# of DIMMs per channel": "2". PCIe "3.0" with "10" lanes. "Max # of SATA 6.0 Gb/s Ports": "6". No "Memory Types" field ([C242S]).
- **Graphics architecture:** "The processor graphics is based on Gen 9 LP (generation 9 Low Power) graphics core architecture" ([DS1], section 2.4).

Sources:
- [C246C] https://www.intel.com/content/www/us/en/products/sku/147326/intel-c246-chipset/compatible.html
- [C246S] https://www.intel.com/content/www/us/en/products/sku/147326/intel-c246-chipset/specifications.html
- [C242C] https://www.intel.com/content/www/us/en/products/sku/147324/intel-c242-chipset/compatible.html
- [C242S] https://www.intel.com/content/www/us/en/products/sku/147324/intel-c242-chipset/specifications.html
- [DS1] "Intel® Xeon® E-2100 and E-2200 Processor Product Family Datasheet, Volume 1 of 2", 338012-003, Revision 003, August 2024 (first 100,000 of 273,632 characters read): https://cdrdv2-public.intel.com/338012/338012_Intel_Xeon_E-2100_E-2200_DS_Vol1_Rev003.pdf
- [HPEQS] HPE QuickSpecs "HPE ProLiant MicroServer Gen10 Plus", footer "a00073554enw - 16502 - Worldwide - V13 - 18-August-2025": https://support.hpe.com/hpesc/public/api/document/a00073554enw
- Every model spec page in the two tables below.
- E-2224 compatible page (C242 re-check): https://www.intel.com/content/www/us/en/products/sku/191036/intel-xeon-e2224-processor-8m-cache-3-40-ghz/compatible.html

## Xeon E-2100 series

| Model | Cores/threads | Base / turbo GHz | TDP | Graphics | Memory (type-speed, max size, channels) | ECC | PCIe | Launch | Source |
|---|---|---|---|---|---|---|---|---|---|
| E-2124 | 4 / 4 | 3.30 / 4.30 | 71 W | None (page has no GPU section) | DDR4-2666, 128 GB (needs BIOS update and platform support, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipsets: C242, C246) | 3.0, 16 lanes | Q3'18 | https://www.intel.com/content/www/us/en/products/sku/134856/intel-xeon-e2124-processor-8m-cache-up-to-4-30-ghz/specifications.html |
| E-2124G | 4 / 4 | 3.40 / 4.50 | 71 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (needs BIOS update and platform support, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipsets: C242, C246) | 3.0, 16 lanes | Q3'18 | https://www.intel.com/content/www/us/en/products/sku/134854/intel-xeon-e2124g-processor-8m-cache-up-to-4-50-ghz/specifications.html |
| E-2126G | 6 / 6 | 3.30 / 4.50 | 80 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (needs BIOS update and platform support, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipsets: C242, C246) | 3.0, 16 lanes | Q3'18 | https://www.intel.com/content/www/us/en/products/sku/134863/intel-xeon-e2126g-processor-12m-cache-up-to-4-50-ghz/specifications.html |
| E-2134 | 4 / 8 | 3.50 / 4.50 | 71 W | None (page has no GPU section) | DDR4-2666, 128 GB (needs BIOS update and platform support, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipsets: C242, C246) | 3.0, 16 lanes | Q3'18 | https://www.intel.com/content/www/us/en/products/sku/134858/intel-xeon-e2134-processor-8m-cache-up-to-4-50-ghz/specifications.html |
| E-2136 | 6 / 12 | 3.30 / 4.50 | 80 W | None (page has no GPU section) | DDR4-2666, 128 GB (needs BIOS update and platform support, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipsets: C242, C246) | 3.0, 16 lanes | Q3'18 | https://www.intel.com/content/www/us/en/products/sku/134857/intel-xeon-e2136-processor-12m-cache-up-to-4-50-ghz/specifications.html |
| E-2144G | 4 / 8 | 3.60 / 4.50 | 71 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (needs BIOS update and platform support, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipsets: C242, C246) | 3.0, 16 lanes | Q3'18 | https://www.intel.com/content/www/us/en/products/sku/134862/intel-xeon-e2144g-processor-8m-cache-up-to-4-50-ghz/specifications.html |
| E-2146G | 6 / 12 | 3.50 / 4.50 | 80 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (needs BIOS update and platform support, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipsets: C242, C246) | 3.0, 16 lanes | Q3'18 | https://www.intel.com/content/www/us/en/products/sku/134866/intel-xeon-e2146g-processor-12m-cache-up-to-4-50-ghz/specifications.html |
| E-2174G | 4 / 8 | 3.80 / 4.70 | 71 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (needs BIOS update and platform support, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipsets: C242, C246) | 3.0, 16 lanes | Q3'18 | https://www.intel.com/content/www/us/en/products/sku/134864/intel-xeon-e2174g-processor-8m-cache-up-to-4-70-ghz/specifications.html |
| E-2176G | 6 / 12 | 3.70 / 4.70 | 80 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (needs BIOS update and platform support, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipsets: C242, C246) | 3.0, 16 lanes | **Q4'17** (see notes) | https://www.intel.com/content/www/us/en/products/sku/134860/intel-xeon-e2176g-processor-12m-cache-up-to-4-70-ghz/specifications.html |
| E-2186G | 6 / 12 | 3.80 / 4.70 | 95 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (needs BIOS update and platform support, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipsets: C242, C246) | 3.0, 16 lanes | Q3'18 | https://www.intel.com/content/www/us/en/products/sku/134855/intel-xeon-e2186g-processor-12m-cache-up-to-4-70-ghz/specifications.html |

Conditions on the Memory and ECC cells above (every E-2100 spec page; full wording in the shared section): **128 GB:** "Support for up to 128GB system memory capacity will be available in 2019 and requires both a BIOS update and hardware platform support." / "Please contact your hardware provider regarding availability for your system." **ECC ‡:** "This feature may not be available on all computing systems." / "Please check with the system vendor to determine if your system delivers this feature," … Intel's compatible lists for these models name only the C242 and C246 chipsets (both "ECC Memory Supported ‡": "Yes", [C242S], [C246S]).

Notes (all from the pages in the Sources list):
- **128 GB needs a BIOS update and platform support** on every E-2100 page (wording in the shared section). Treat 128 GB as conditional on the machine, not guaranteed.
- **Compatible Products pages:**
  - Every E-2100 page lists "Intel® C242 Chipset" and "Intel® C246 Chipset" under "Intel® C240 Series Chipsets".
  - Every page except the E-2144G also lists "Intel® Server Board M10JNP2SB" (listed as "Discontinued").
  - The E-2144G page lists the two chipsets only. I checked it twice and the tool found no board either time.
- **Pages that differ from the rest of the series:**
  - **E-2176G:**
    - "Launch Date": "Q4'17", where every other E-2100 page has "Q3'18". The tool returned this on two separate reads.
    - "Marketing Status": "Launched" (the others are "Discontinued").
    - It has a "Use Conditions" field, "PC/Client/Tablet", and its PCIe configurations are worded "Up to …".
    - Intel's E-2100 spec update puts it in the same sSpec table as the rest ([SU2100]). I am reporting what the page says, not correcting it.
  - **E-2124G:** "Marketing Status": "Launched", and "Use Conditions": "Embedded Broad Market Commercial Temp". The E-2146G page has no "Use Conditions" field. The other pages weren't checked for it.
  - **Non-G pages (E-2124, E-2134, E-2136):** no "GPU Specifications" section at all. The E-2200 non-G pages are different (see below).
  - **TDP:** the E-2186G is the only 95 W part in this series.
- **Graphics details on the G pages:** "Graphics Base Frequency": "350 MHz". "Graphics Output": "eDP/DP/HDMI/DVI". "# of Displays Supported ‡": "3".
  - Device ID: "0x3E96" on the E-2144G, E-2146G, E-2174G, E-2176G and E-2186G. I didn't ask for it on the E-2124G or E-2126G pages.
  - "Graphics Max Dynamic Frequency": "1.15 GHz" on the E-2124G, E-2144G and E-2146G, and "1.20 GHz" on the E-2174G, E-2176G and E-2186G. The spec update gives 1.15 GHz for the E-2126G ([SU2100]).
- **Box cooler ("Included Items"):** "This product is available in tray and box. For boxed product, a thermal solution is included".
  - The tool found this on the E-2124, E-2124G, E-2134, E-2136, E-2146G, E-2174G and E-2176G pages.
  - It reported the field absent on the E-2126G, E-2144G and E-2186G pages. I did not re-check those three.
- **Cross-check against Intel's E-2100 spec update** ([SU2100], Table 2):
  - Base clock, 1-core turbo and TDP match the spec pages for all 10 models.
  - The rows show "0" graphics and "NA" graphics frequency for the E-2124, E-2134 and E-2136, and "2" in the graphics column for the G models. The column names come from the tool's reading of the PDF table.
  - All rows are stepping "U0".

Sources:
- E-2124: https://www.intel.com/content/www/us/en/products/sku/134856/intel-xeon-e2124-processor-8m-cache-up-to-4-30-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/134856/intel-xeon-e2124-processor-8m-cache-up-to-4-30-ghz/compatible.html
- E-2124G: https://www.intel.com/content/www/us/en/products/sku/134854/intel-xeon-e2124g-processor-8m-cache-up-to-4-50-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/134854/intel-xeon-e2124g-processor-8m-cache-up-to-4-50-ghz/compatible.html
- E-2126G: https://www.intel.com/content/www/us/en/products/sku/134863/intel-xeon-e2126g-processor-12m-cache-up-to-4-50-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/134863/intel-xeon-e2126g-processor-12m-cache-up-to-4-50-ghz/compatible.html
- E-2134: https://www.intel.com/content/www/us/en/products/sku/134858/intel-xeon-e2134-processor-8m-cache-up-to-4-50-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/134858/intel-xeon-e2134-processor-8m-cache-up-to-4-50-ghz/compatible.html
- E-2136: https://www.intel.com/content/www/us/en/products/sku/134857/intel-xeon-e2136-processor-12m-cache-up-to-4-50-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/134857/intel-xeon-e2136-processor-12m-cache-up-to-4-50-ghz/compatible.html
- E-2144G: https://www.intel.com/content/www/us/en/products/sku/134862/intel-xeon-e2144g-processor-8m-cache-up-to-4-50-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/134862/intel-xeon-e2144g-processor-8m-cache-up-to-4-50-ghz/compatible.html
- E-2146G: https://www.intel.com/content/www/us/en/products/sku/134866/intel-xeon-e2146g-processor-12m-cache-up-to-4-50-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/134866/intel-xeon-e2146g-processor-12m-cache-up-to-4-50-ghz/compatible.html
- E-2174G: https://www.intel.com/content/www/us/en/products/sku/134864/intel-xeon-e2174g-processor-8m-cache-up-to-4-70-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/134864/intel-xeon-e2174g-processor-8m-cache-up-to-4-70-ghz/compatible.html
- E-2176G: https://www.intel.com/content/www/us/en/products/sku/134860/intel-xeon-e2176g-processor-12m-cache-up-to-4-70-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/134860/intel-xeon-e2176g-processor-12m-cache-up-to-4-70-ghz/compatible.html
- E-2186G: https://www.intel.com/content/www/us/en/products/sku/134855/intel-xeon-e2186g-processor-12m-cache-up-to-4-70-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/134855/intel-xeon-e2186g-processor-12m-cache-up-to-4-70-ghz/compatible.html
- [SU2100] "Intel® Xeon® E-2100 Processor Family Specification Update", 338014-002US, Revision 002, October 2018: https://www.intel.com/content/dam/www/public/us/en/documents/specification-updates/xeon-e-2100-specification-update.pdf
- [C242S], [C246S]: see the shared section's Sources.

## Xeon E-2200 series

| Model | Cores/threads | Base / turbo GHz | TDP | Graphics | Memory (type-speed, max size, channels) | ECC | PCIe | Launch | Source |
|---|---|---|---|---|---|---|---|---|---|
| E-2224 | 4 / 4 | 3.40 / 4.60 | 71 W | None (GPU section all "N/A"/"No") | DDR4-2666, 128 GB (may need BIOS update, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipset: C246) | 3.0, 16 lanes | Q2'19 | https://www.intel.com/content/www/us/en/products/sku/191036/intel-xeon-e2224-processor-8m-cache-3-40-ghz/specifications.html |
| E-2224G | 4 / 4 | 3.50 / 4.70 | 71 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (may need BIOS update, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipset: C246) | 3.0, 16 lanes | Q2'19 | https://www.intel.com/content/www/us/en/products/sku/191037/intel-xeon-e2224g-processor-8m-cache-3-50-ghz/specifications.html |
| E-2226G | 6 / 6 | 3.40 / 4.70 | 80 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (may need BIOS update, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipset: C246) | 3.0, 16 lanes | Q2'19 | https://www.intel.com/content/www/us/en/products/sku/191038/intel-xeon-e2226g-processor-12m-cache-3-40-ghz/specifications.html |
| E-2234 | 4 / 8 | 3.60 / 4.80 | 71 W | None (GPU section all "N/A"/"No") | DDR4-2666, 128 GB (may need BIOS update, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipset: C246) | 3.0, 16 lanes | Q2'19 | https://www.intel.com/content/www/us/en/products/sku/191039/intel-xeon-e2234-processor-8m-cache-3-60-ghz/specifications.html |
| E-2244G | 4 / 8 | 3.80 / 4.80 | 71 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (may need BIOS update, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipset: C246) | 3.0, 16 lanes | Q2'19 | https://www.intel.com/content/www/us/en/products/sku/191041/intel-xeon-e2244g-processor-8m-cache-3-80-ghz/specifications.html |
| E-2246G | 6 / 12 | 3.60 / 4.80 | 80 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (may need BIOS update, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipset: C246) | 3.0, 16 lanes | Q2'19 | https://www.intel.com/content/www/us/en/products/sku/191043/intel-xeon-e2246g-processor-12m-cache-3-60-ghz/specifications.html |
| E-2274G | 4 / 8 | 4.00 / 4.90 | 83 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (may need BIOS update, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipset: C246) | 3.0, 16 lanes | Q2'19 | https://www.intel.com/content/www/us/en/products/sku/191042/intel-xeon-e2274g-processor-8m-cache-4-00-ghz/specifications.html |
| E-2276G | 6 / 12 | 3.80 / 4.90 | 80 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (may need BIOS update, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipset: C246) | 3.0, 16 lanes | Q2'19 | https://www.intel.com/content/www/us/en/products/sku/191035/intel-xeon-e2276g-processor-12m-cache-3-80-ghz/specifications.html |
| E-2278G | 8 / 16 | 3.40 / 5.00 | 80 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (may need BIOS update, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipset: C246) | 3.0, 16 lanes | Q2'19 | https://www.intel.com/content/www/us/en/products/sku/193745/intel-xeon-e2278g-processor-16m-cache-3-40-ghz/specifications.html |
| E-2286G | 6 / 12 | 4.00 / 4.90 | 95 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (may need BIOS update, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipset: C246) | 3.0, 16 lanes | Q2'19 | https://www.intel.com/content/www/us/en/products/sku/191033/intel-xeon-e2286g-processor-12m-cache-4-00-ghz/specifications.html |
| E-2288G | 8 / 16 | 3.70 / 5.00 | 95 W | Intel® UHD Graphics P630 | DDR4-2666, 128 GB (may need BIOS update, see line under table), 2 channels | Yes‡ (system-dependent, see line under table; Intel's compatible chipset: C246) | 3.0, 16 lanes | Q2'19 | https://www.intel.com/content/www/us/en/products/sku/193743/intel-xeon-e2288g-processor-16m-cache-3-70-ghz/specifications.html |

Conditions on the Memory and ECC cells above (every E-2200 spec page; full wording in the shared section): **128 GB:** "Support for up to 128GB system memory may require a BIOS update." / "Please contact your hardware provider regarding availability for your system." **ECC ‡:** "This feature may not be available on all computing systems." / "Please check with the system vendor to determine if your system delivers this feature," … Intel's compatible lists for these models name only the C246 chipset ("ECC Memory Supported ‡": "Yes", [C246S]).

Notes (all from the pages in the Sources list):
- **128 GB "may require a BIOS update"** on every E-2200 page (wording in the shared section).
- **Compatible Products pages:**
  - Every E-2200 page lists **only** "Intel® C246 Chipset" under "Intel® C240 Series Chipsets", plus "Intel® Server Board M10JNP2SB".
  - Eight also list "Intel® Server System M20MYP1UR" (heading "Intel® Server System M20MYP Family"): E-2224G, E-2226G, E-2234, E-2244G, E-2246G, E-2276G, E-2286G and E-2288G. The E-2224, E-2274G and E-2278G pages don't list it. Intel's listing gives this system "Socket P", board form factor "SSI EEB (12 x 13 in)" and chassis form factor "1U Rack" (E-2224G compatible page). That socket doesn't match the "FCLGA1151" on these CPUs' spec pages, so treat the entry as Intel's listing only (inference, not stated by Intel).
  - The C242 is not listed for any E-2200 model. HPE's MicroServer Gen10 Plus QuickSpecs pair the E-2224 with a C242 chipset (see the shared section for what that does and doesn't show).
- **Pages that differ from the rest of the series:**
  - **Non-G pages (E-2224, E-2234):** they *have* a "GPU Specifications" section, but there is no "GPU Name" field. Every value is "N/A" or "No", for example "Graphics Output": "N/A", "4K Support": "No", "Intel® Quick Sync Video": "No", "Device ID": "N/A". The E-2100 non-G pages have no such section at all.
  - **Device ID:** "0x3E9A" on the E-2278G and E-2288G (the two 8-core parts). Every other E-2200 G page has "0x3E96".
  - **TDP:** the E-2274G is the only 83 W part, and the E-2286G and E-2288G are the 95 W parts.
- **Graphics details on the G pages:** "Graphics Base Frequency": "350 MHz", "Graphics Max Dynamic Frequency": "1.20 GHz", "# of Displays Supported ‡": "3". Unlike the E-2100 G pages, the tool found **no "Graphics Output" field** on any E-2200 G page.
- **Box cooler ("Included Items"):** the same tray-and-box text as the E-2100 appears on the E-2224, E-2224G, E-2226G and E-2234 pages. The tool reported the field absent on the E-2244G, E-2246G, E-2274G, E-2276G, E-2278G, E-2286G and E-2288G pages. I did not re-check those.
- **End of servicing (checked on the E-2224, E-2224G and E-2246G pages only; the E-2100 pages checked show the same, see "Telling them apart"):** "Servicing Status": "ESU Notification Issued". "End of Servicing Updates Date": "Monday, June 30, 2025". "Marketing Status" is "Discontinued" on all 11 E-2200 pages.
- **Cross-check against the combined spec update** ([SU2200], Table 3, "Intel® Xeon® E-2200 Turbo Boost 2.0 Frequency"):
  - TDP and base frequency match the spec pages for all 11 models.
  - The largest turbo offset in each row, added to the base clock, equals the spec page's max turbo for all 11. That addition is my own arithmetic. The tool said it couldn't map each offset to an active-core count.
- **Tool notes:** on the E-2276G page the tool shortened the Description with "[...]" and quoted the second sentence separately. It reports nothing paraphrased.

Sources:
- E-2224: https://www.intel.com/content/www/us/en/products/sku/191036/intel-xeon-e2224-processor-8m-cache-3-40-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/191036/intel-xeon-e2224-processor-8m-cache-3-40-ghz/compatible.html
- E-2224G: https://www.intel.com/content/www/us/en/products/sku/191037/intel-xeon-e2224g-processor-8m-cache-3-50-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/191037/intel-xeon-e2224g-processor-8m-cache-3-50-ghz/compatible.html
- E-2226G: https://www.intel.com/content/www/us/en/products/sku/191038/intel-xeon-e2226g-processor-12m-cache-3-40-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/191038/intel-xeon-e2226g-processor-12m-cache-3-40-ghz/compatible.html
- E-2234: https://www.intel.com/content/www/us/en/products/sku/191039/intel-xeon-e2234-processor-8m-cache-3-60-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/191039/intel-xeon-e2234-processor-8m-cache-3-60-ghz/compatible.html
- E-2244G: https://www.intel.com/content/www/us/en/products/sku/191041/intel-xeon-e2244g-processor-8m-cache-3-80-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/191041/intel-xeon-e2244g-processor-8m-cache-3-80-ghz/compatible.html
- E-2246G: https://www.intel.com/content/www/us/en/products/sku/191043/intel-xeon-e2246g-processor-12m-cache-3-60-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/191043/intel-xeon-e2246g-processor-12m-cache-3-60-ghz/compatible.html
- E-2274G: https://www.intel.com/content/www/us/en/products/sku/191042/intel-xeon-e2274g-processor-8m-cache-4-00-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/191042/intel-xeon-e2274g-processor-8m-cache-4-00-ghz/compatible.html
- E-2276G: https://www.intel.com/content/www/us/en/products/sku/191035/intel-xeon-e2276g-processor-12m-cache-3-80-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/191035/intel-xeon-e2276g-processor-12m-cache-3-80-ghz/compatible.html
- E-2278G: https://www.intel.com/content/www/us/en/products/sku/193745/intel-xeon-e2278g-processor-16m-cache-3-40-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/193745/intel-xeon-e2278g-processor-16m-cache-3-40-ghz/compatible.html
- E-2286G: https://www.intel.com/content/www/us/en/products/sku/191033/intel-xeon-e2286g-processor-12m-cache-4-00-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/191033/intel-xeon-e2286g-processor-12m-cache-4-00-ghz/compatible.html
- E-2288G: https://www.intel.com/content/www/us/en/products/sku/193743/intel-xeon-e2288g-processor-16m-cache-3-70-ghz/specifications.html and https://www.intel.com/content/www/us/en/products/sku/193743/intel-xeon-e2288g-processor-16m-cache-3-70-ghz/compatible.html
- [SU2200] "Intel® Xeon® E-2100 and E-2200 Processor Family Specification Update", 338014-019US, Revision 019US, September 2023: https://cdrdv2-public.intel.com/338014/338014_Intel%C2%AE%20Xeon%C2%AE%20E-2100%20and%20E-2200%20Processor%20Family%20Specification%20Update_rev019US.pdf
- [C246S]: see the shared section's Sources.

## Telling them apart

- **What "G" means:**
  - **Intel never states a meaning for "G" on Xeon E in anything I read.** But the pattern holds without exception on all 21 pages: every model with a G has "GPU Name‡": "Intel® UHD Graphics P630", and every model without one has no GPU name. The non-G models are E-2124, E-2134, E-2136, E-2224 and E-2234 (and the E-2236, per [intel-cpus.md](intel-cpus.md)).
  - The datasheet backs this up. Its SKU tables give graphics "GT2" for the G parts and "0"/"GT0" for the E-2124, E-2134, E-2136, E-2224, E-2234 and E-2236. The tool explained "GT0 rows indicate no graphics" **(tool paraphrase)**. The tool also reported that the datasheet "does not define what the 'G' suffix means" ([DS1], Tables 1-1, 1-2 and 1-3).
  - **Don't use Intel's general suffix article for Xeon.** "What Do the Letters Mean in Intel® Processor Names?" (Last Reviewed "12/09/2025") gives "G" as "Includes discrete graphics on package" and "G1-G7" as "Graphics level (processors with new integrated graphics technology only)". It doesn't apply its suffix list to Xeon; its only Xeon mention is a Related Information link, "Intel® Xeon® Scalable Processor Numbers and Suffixes" ([KB58567]). Intel's "About Intel® Processor Numbers" page covers Xeon Scalable suffixes (F "Fabric", T "High Tcase/extended reliability", M "1.5 TB per socket", and no suffix "768 GB per socket") and the Xeon E3/E5/E7 suffixes L "Low Power", M "Mobile" and W "Workstation". It doesn't cover Xeon E-2100/E-2200 and has no G suffix ([PNDC]).
  - **Practical point:** a non-G chip in a machine with no graphics card will have no display output from the CPU. That conclusion is mine, drawn from the "none" rows above and from [SU2100] Table 2, which gives "Processor Graphics Cores" "0" (header as the tool extracted it) for the E-2124, E-2134 and E-2136; it is not an Intel sentence (inference, not stated by Intel).
- **E-2100 vs E-2200:**
  - Apart from the model number (E-21xx or E-22xx), the sSpec on the chip identifies the series: Intel's ordering pages list SR3W_ codes for all 10 E-2100 models and SRF__ codes for all 11 E-2200 models (one sSpec per model; codes and URLs in the sSpec lists below). Each code maps to one model on Intel's pages; reading the prefix alone (SR3W vs SRF) as a series marker is my own pattern from these 21 codes (inference, not stated by Intel).
  - The shared spec fields (family, socket, DDR4-2666, 128 GB, 2 channels, ECC, PCIe 3.0 x16) are the same. The pages differ in the 128 GB note wording, the launch quarter (Q3'18 vs Q2'19, apart from the E-2176G's "Q4'17"), the GPU fields (E-2100 G pages have "Graphics Output", E-2200 G pages don't; E-2200 non-G pages have a GPU section whose values are all "N/A" or "No", E-2100 non-G pages have none), and the compatible lists (C242 listed for E-2100 only). Re-checked on the E-2124G, E-2134, E-2224 and E-2224G spec pages and the E-2124 and E-2224 compatible pages.
  - The servicing fields don't separate them: the E-2124G and E-2134 (E-2100) pages show the same "Servicing Status": "ESU Notification Issued" and "End of Servicing Updates Date": "Monday, June 30, 2025" as the E-2224, E-2224G and E-2246G (E-2200) pages. Not checked on the other pages.
  - The combined spec update has errata columns for steppings "U-0" and "R-0". The E-2100 spec update gives "U0" for every E-2100 sSpec. The tool found no sentence in the combined update saying which stepping is E-2200, so I am not assigning R-0 to E-2200. Intel's ordering pages give "Stepping" "U0" for all 10 E-2100 models and for 9 of the 11 E-2200 models, and "R0" only for the E-2278G and E-2288G (the two 8-core parts). So R0 does not mark the E-2200 series in general.
- **Identifying a physical chip (Intel support articles):**
  - "Identifying Intel® Xeon® Processor Markings for Warranty Requests" (Last Reviewed "09/03/2026") has a section for "Intel® Xeon® E Processor" ([KB5965]):
    - Line 2 is "Processor Number".
    - Line 3 is "sSpec # / CPU Speed".
    - Line 4 is "Finished Process Order (FPO)".
    - Line 5 is "Assembly Test Process Order (ATPO) Serial Number". "Scanner for 2D Matrix is needed to read the Assembly Test Process Order (ATPO) Serial Number on Line 5."
    - Caveat: the example image in that section is labelled "LGA 1150", not LGA1151, so it may show an older Xeon E3.
  - The E-2100 spec update's own marking diagram shows "GRP1LINE3: PROC#" and "GRP1LINE4: SSPEC SPEED", with "Pin Count: 1151 Package Size: 37.5 mm x 37.5 mm" ([SU2100]). This doesn't match the support article's line numbers (lines 2 and 3). The two sources disagree on line numbering, so look for the content (model number, then sSpec and speed), not a line number.
  - "Find sSpec Number for Intel® Xeon® Processor to Use in Product Specifications" (Last Reviewed 12/20/2019): the sSpec is found "by looking at the markings on the processor (see Figure 2), or on the boxed processor label". It also says: "To find technical specifications, you'll need to know your processor's sSpec number." ([KB7523])
  - "How to Identify My Intel® Processor" (Last Reviewed 09/09/2026): in Windows, msinfo32 shows the processor under "System Summary" ("Your processor name and model number will be displayed"). "The Intel® Processor Identification Utility automatically identifies your processor". The tool paraphrased the support scope as 7th Gen Core and newer; the article doesn't say whether Xeon E is covered ([KB6059]).
  - **E-2100 sSpec codes** (stepping "U0" for all) ([SU2100], Table 2; these are the codes on Intel's ordering pages, and whether any other codes exist for these models is not stated there): E-2124 "SR3WQ", E-2124G "SR3WL", E-2126G "SR3WU", E-2134 "SR3WP", E-2136 "SR3WW", E-2144G "SR3WM", E-2146G "SR3WT", E-2174G "SR3WN", E-2176G "SR3WS", E-2186G "SR3WR". These are production sSpecs as listed in October 2018. Intel's ordering pages list the same single "Spec Code" for each of the 10 models (shared by the tray and boxed entries where both are listed), each with "Stepping" "U0":
    - E-2124 "SR3WQ": https://www.intel.com/content/www/us/en/products/sku/134856/intel-xeon-e2124-processor-8m-cache-up-to-4-30-ghz/ordering.html
    - E-2124G "SR3WL": https://www.intel.com/content/www/us/en/products/sku/134854/intel-xeon-e2124g-processor-8m-cache-up-to-4-50-ghz/ordering.html
    - E-2126G "SR3WU": https://www.intel.com/content/www/us/en/products/sku/134863/intel-xeon-e2126g-processor-12m-cache-up-to-4-50-ghz/ordering.html
    - E-2134 "SR3WP": https://www.intel.com/content/www/us/en/products/sku/134858/intel-xeon-e2134-processor-8m-cache-up-to-4-50-ghz/ordering.html
    - E-2136 "SR3WW": https://www.intel.com/content/www/us/en/products/sku/134857/intel-xeon-e2136-processor-12m-cache-up-to-4-50-ghz/ordering.html
    - E-2144G "SR3WM": https://www.intel.com/content/www/us/en/products/sku/134862/intel-xeon-e2144g-processor-8m-cache-up-to-4-50-ghz/ordering.html
    - E-2146G "SR3WT": https://www.intel.com/content/www/us/en/products/sku/134866/intel-xeon-e2146g-processor-12m-cache-up-to-4-50-ghz/ordering.html
    - E-2174G "SR3WN": https://www.intel.com/content/www/us/en/products/sku/134864/intel-xeon-e2174g-processor-8m-cache-up-to-4-70-ghz/ordering.html
    - E-2176G "SR3WS": https://www.intel.com/content/www/us/en/products/sku/134860/intel-xeon-e2176g-processor-12m-cache-up-to-4-70-ghz/ordering.html
    - E-2186G "SR3WR": https://www.intel.com/content/www/us/en/products/sku/134855/intel-xeon-e2186g-processor-12m-cache-up-to-4-70-ghz/ordering.html
  - **E-2200 sSpec codes** (Intel's ordering pages, "Spec Code" and "Stepping"; one spec code per model, shared by the tray and boxed entries where both are listed; whether any other codes exist for these models is not stated there). The combined spec update (rev 019) has no sSpec table: the tool read the whole document and found only an "SSPEC SPEED" placeholder in the marking section, which points to ARK.
    - E-2224 "SRFAV", "U0": https://www.intel.com/content/www/us/en/products/sku/191036/intel-xeon-e2224-processor-8m-cache-3-40-ghz/ordering.html
    - E-2224G "SRFAW", "U0": https://www.intel.com/content/www/us/en/products/sku/191037/intel-xeon-e2224g-processor-8m-cache-3-50-ghz/ordering.html
    - E-2226G "SRF7F", "U0": https://www.intel.com/content/www/us/en/products/sku/191038/intel-xeon-e2226g-processor-12m-cache-3-40-ghz/ordering.html
    - E-2234 "SRFAX", "U0": https://www.intel.com/content/www/us/en/products/sku/191039/intel-xeon-e2234-processor-8m-cache-3-60-ghz/ordering.html
    - E-2244G "SRFAY", "U0": https://www.intel.com/content/www/us/en/products/sku/191041/intel-xeon-e2244g-processor-8m-cache-3-80-ghz/ordering.html
    - E-2246G "SRF7N", "U0": https://www.intel.com/content/www/us/en/products/sku/191043/intel-xeon-e2246g-processor-12m-cache-3-60-ghz/ordering.html
    - E-2274G "SRFDE", "U0": https://www.intel.com/content/www/us/en/products/sku/191042/intel-xeon-e2274g-processor-8m-cache-4-00-ghz/ordering.html
    - E-2276G "SRF7M", "U0": https://www.intel.com/content/www/us/en/products/sku/191035/intel-xeon-e2276g-processor-12m-cache-3-80-ghz/ordering.html
    - E-2278G "SRFB2", "R0": https://www.intel.com/content/www/us/en/products/sku/193745/intel-xeon-e2278g-processor-16m-cache-3-40-ghz/ordering.html
    - E-2286G "SRF7C", "U0": https://www.intel.com/content/www/us/en/products/sku/191033/intel-xeon-e2286g-processor-12m-cache-4-00-ghz/ordering.html
    - E-2288G "SRFB3", "R0": https://www.intel.com/content/www/us/en/products/sku/193743/intel-xeon-e2288g-processor-16m-cache-3-70-ghz/ordering.html
  - **Graphics Device ID** (on spec pages, which software can read): "0x3E96" on the E-2100 G pages I asked about and on most E-2200 G pages; "0x3E9A" on the E-2278G and E-2288G. Device ID alone does not separate E-2100 from E-2200.

Sources:
- [KB58567] https://www.intel.com/content/www/us/en/support/articles/000058567/processors/intel-core-processors.html
- [PNDC] https://www.intel.com/content/www/us/en/products/docs/processors/processor-numbers-data-center.html (linked from https://www.intel.com/content/www/us/en/processors/processor-numbers.html, which "doesn't mention 'Xeon' at all")
- [KB5965] https://www.intel.com/content/www/us/en/support/articles/000005965/processors/intel-xeon-processors.html
- [KB7523] https://www.intel.com/content/www/us/en/support/articles/000007523/processors/intel-xeon-processors.html
- [KB6059] https://www.intel.com/content/www/us/en/support/articles/000006059/processors.html
- [DS1], [SU2100] and [SU2200] as listed above.
- Model spec and compatible pages: URLs in the two series Sources lists above. Ordering pages: URLs in the sSpec lists above.
