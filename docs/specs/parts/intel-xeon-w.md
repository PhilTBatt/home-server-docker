# Intel Xeon W-2100 and W-2200

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

- Researched 2026-11-20. intel.com could not be reached from the shell, so every Intel page here was read with the WebFetch tool only (no curl). Search was a web search restricted to intel.com. No eBay page was opened.
- The fetch tool turns a page into text and answers questions about it. It keeps verbatim quotes short (about 125 characters), so longer sentences are given as consecutive quoted pieces joined with " / ". For each spec page I asked for exact labels and values. The tool said it gave spec values verbatim. Where it said it paraphrased, this file marks it **(tool paraphrase)**.
- Intel product pages have separate tabs. For each of the 18 CPUs I read `/specifications.html` and `/compatible.html` (the "Compatible Products" list). Search results gave the compatible-list URL for 13 models. For W-2102, W-2123, W-2195, W-2275 and W-2295 I swapped `specifications.html` for `compatible.html` in the spec URL that search had returned. All five opened.
- "Max speed" in the tables is the highest speed in Intel's "Memory Types" field. Intel has no separate max-speed field.
- "not stated" means the page I read does not give it. Anything marked "(from memory, unchecked)" is not from a source.

## Shared statements for the Xeon W-2100 and W-2200 series

The facts below show that, on Intel's pages, all 18 models list the same socket (FCLGA2066) and the same chipset (C422). That is not an Intel statement that a W-2200 works in a machine that shipped with a W-2100; I found no Intel page that says so (see "Upgrading between them"). Whether a W-2200 works in a given W-2100 workstation depends on that workstation maker's own CPU support list and BIOS, which this file doesn't cover (inference, not stated by Intel; the nearest Intel statement is article 000097589's advice to contact the motherboard or system maker for BIOS updates ([KB97589]), quoted below).

These apply to all 18 models. The per-model spec and compatible-list URLs are in the two "Sources:" lists further down.

- **Socket:** every one of the 18 spec pages says "Sockets Supported": "FCLGA2066".
- **Sockets per system:** every page says "Scalability": "1S Only".
- **Memory channels:** every page says "Max # of Memory Channels": "4".
- **ECC:** every page says "ECC Memory Supported ‡": "Yes". The ‡ footnote: "This feature may not be available on all computing systems." / "Please check with the system vendor to determine if your system delivers this feature," / "or reference the system specifications (motherboard, processor, chipset, power supply, HDD, graphics controller, memory," / "BIOS, drivers, virtual machine monitor-VMM, platform software, and/or operating system) for feature compatibility." / "Functionality, performance, and other benefits of this feature may vary depending on system configuration." (quoted from the W-2195 page; the other pages returned the same opening sentence).
  - Intel article 000096922, "How to Find ECC Memory Support for Intel® Processor" (Last Reviewed 01/17/2025): "Note that ECC memory support requires both processor and chipset support." ([KB96922])
  - The C422 chipset page says "ECC Memory Supported ‡": "Yes" ([C422]).
- **PCI Express:** every page says "PCI Express Revision": "3.0" and "Max # of PCI Express Lanes": "48".
- **Integrated graphics:** none. No spec page has a "Processor Graphics" field. On five pages (W-2102, W-2175, W-2195, W-2225, W-2235) I asked specifically, and the tool reported no section heading containing "Graphics" or "GPU". The page's headings are Essentials, CPU Specifications, Supplemental Information, Memory Specifications, Expansion Options, Package Specifications, Advanced Technologies, Security & Reliability. On the other 13 pages the tool reported the "Processor Graphics" field as absent.
- **Package:** every page says "Package Size": "45mm x 52.5mm".
- **Product collection:** every page says "Product Collection": "Intel® Xeon® W Processor".
- **Compatible chipsets (CPU side):** all 18 compatible-list pages have one product heading, "Intel® C400 Series Chipsets", with one entry: "Intel® C422 Chipset". None lists any other chipset, board, system or memory. None has a BIOS, validation or compatibility note. The only related text is the site-wide footer: "Intel technologies may require enabled hardware, software or service activation." (The statement that there is no BIOS note is the tool's own observation.)
- **X299 boards: not stated.** No Intel page I read says whether a Xeon W-2100 or W-2200 works in an X299 board. The 18 compatible lists name only "Intel® C422 Chipset" (above). Intel article 000005592, "Compatibility for FCLGA2011, FCLGA2011-v3, and FCLGA2066 Sockets (Intel® Core™ X-series Processors)" (Last Reviewed 02/05/2025), has a section "LGA2066 socket compatibility" that lists Core X-series processors (e.g. i9-10980XE) and says "These processors are compatible with the FCLGA2066 socket." It does not mention X299, C422 or Xeon W ([KB5592]).
- **Compatible processors (chipset side):** the C422 compatible list ([C422C]) has two headings:
  - "Intel® Xeon® W Processor": 18 processors (tool count). These are exactly the 18 models in this file, W-2102 to W-2195 and W-2223 to W-2295, all under the same heading. The tool confirmed each one by name.
  - "Intel® Xeon® D Processor": 14 processors (tool count), all D-21xx parts (e.g. "Intel® Xeon® D-2191 Processor (24.75M Cache, 1.60 GHz)").
  - The page has no BIOS, validation or generation note.
- **C422 chipset spec page** ([C422]), verbatim values: "Product Collection": "Intel® C400 Series Chipsets"; "Code Name": "Products formerly Kaby Lake"; "Vertical Segment": "Server"; "Marketing Status": "Discontinued"; "Launch Date": "Q3'17"; "Use Conditions": "Workstation"; "TDP": "6 W"; "# of DIMMs per channel": "2"; "ECC Memory Supported ‡": "Yes"; "# of Displays Supported ‡": "0"; "Direct Media Interface (DMI) Revision": "3.0"; "PCI Express Revision": "3.0"; "Max # of PCI Express Lanes": "24"; "Intel® ME Firmware Version": "11". The page has **no** "Memory Types", "Max Memory Size" or socket field and names no processors.
- **Socket article.** Intel article 000055173, "Supported Sockets for Intel® Xeon® Processors" (Last Reviewed 06/09/2026), has this table row: "Intel® Xeon® W Processor: Intel® Xeon® W-2000 Processors" | "LGA2066" | "EOIS" ([KB55173]). The article never names W-2100, W-2200, FCLGA2066 or C422. The article does not explain "EOIS". In the article's "Status" column, "EOIS" is a link to Intel article 000022396, which would not open (client error). Reading it as the lifecycle paper's term is an inference (not stated by Intel on the article). Intel's technical paper "Intel CPU Processor Family Product Lifecycle" (December 2022) defines "End of Interactive Support (EOIS) Date": "Interactive support provided to the broad market concludes as of this date." The paper does not mention Xeon W ([LC2022]).
- **Finding a board.** Intel article 000057630, "How to Find Compatible Motherboards for the Intel® Xeon® Processor Family?" (Last Reviewed 10/14/2024), tells readers to "Refer to the Sockets Supported Section." / "This section indicated the type of sockets needed on compatible motherboards, for example, FCLGA2066." / "Select compatible products." / "Locate the compatible chipset." It also says: "Another way to identify compatible products (for Workstation), refer to the Intel® Product Compatibility Tool." The fetch tool gave that link as https://compatibleproducts.intel.com/ProductDetails?activeModule=Desktop%20Processors&familyName=Intel%C2%AE%20Xeon%C2%AE%20W%20Processor# . I did not open the tool, so what it lists for Xeon W is not checked. It says nothing about BIOS ([KB57630]).
- **BIOS.** Intel article 000097589, "Does the Intel® Xeon® W Processor Require a BIOS or Firmware Update?" (Last Reviewed 09/09/2025): "The Intel® Xeon® W Processor will adhere to any specific instructions, security advisories, or bugfix issues provided by the" / "board manufacturer." and "Intel recommends contacting your server system or motherboard manufacturer (original equipment manufacturer or OEM)" / "for the latest BIOS or firmware updates." It does not name W-2100, W-2200, a socket or a chipset, and gives no BIOS versions ([KB97589]).

Sources:
- [C422C] https://www.intel.com/content/www/us/en/products/sku/126691/intel-c422-chipset/compatible.html
- [C422] https://www.intel.com/content/www/us/en/products/sku/126691/intel-c422-chipset/specifications.html
- [KB55173] https://www.intel.com/content/www/us/en/support/articles/000055173/processors/intel-xeon-processors.html
- [KB57630] https://www.intel.com/content/www/us/en/support/articles/000057630/processors.html
- [KB97589] https://www.intel.com/content/www/us/en/support/articles/000097589/processors.html
- [KB96922] https://www.intel.com/content/www/us/en/support/articles/000096922.html
- [KB5592] https://www.intel.com/content/www/us/en/support/articles/000005592/processors/intel-core-processors.html
- [LC2022] Intel technical paper "Intel CPU Processor Family Product Lifecycle" (December 2022): https://cdrdv2-public.intel.com/840328/Intel-CPU-Processor-Lifecycle-Technical-Paper.pdf

## Xeon W-2100 series

All ten pages: "Code Name": "Products formerly Skylake", "Vertical Segment": "Server", "Intel® Turbo Boost Max Technology 3.0 ‡": "No". Socket, channels, ECC, PCIe, graphics and compatible chipset are as in the shared section. Each compatible page lists only "Intel® C422 Chipset".

| Model | Cores/threads | Base / turbo GHz | TDP | Graphics | Memory (type, max speed, max size) | ECC | PCIe | Launch | Source |
|---|---|---|---|---|---|---|---|---|---|
| W-2102 | 4 / 4 | 2.90 / none ("Intel® Turbo Boost Technology ‡": "No") | 120 W | None listed | DDR4 1600/1866/2133/2400; max 2400; 512 GB | Yes | 3.0, 48 lanes | Q3'17 | https://www.intel.com/content/www/us/en/products/sku/125038/intel-xeon-w2102-processor-8-25m-cache-2-90-ghz/specifications.html |
| W-2104 | 4 / 4 | 3.20 / none ("Intel® Turbo Boost Technology ‡": "No") | 120 W | None listed | DDR4 1600/1866/2133/2400; max 2400; 512 GB | Yes | 3.0, 48 lanes | Q3'17 | https://www.intel.com/content/www/us/en/products/sku/125039/intel-xeon-w2104-processor-8-25m-cache-3-20-ghz/specifications.html |
| W-2123 | 4 / 8 | 3.60 / 3.90 | 120 W | None listed | DDR4 1600/1866/2133/2400/2666; max 2666; 512 GB | Yes | 3.0, 48 lanes | Q3'17 | https://www.intel.com/content/www/us/en/products/sku/125036/intel-xeon-w2123-processor-8-25m-cache-3-60-ghz/specifications.html |
| W-2125 | 4 / 8 | 4.00 / 4.50 | 120 W | None listed | DDR4 1600/1866/2133/2400/2666; max 2666; 512 GB | Yes | 3.0, 48 lanes | Q3'17 | https://www.intel.com/content/www/us/en/products/sku/126708/intel-xeon-w2125-processor-8-25m-cache-4-00-ghz/specifications.html |
| W-2133 | 6 / 12 | 3.60 / 3.90 | 140 W | None listed | DDR4 1600/1866/2133/2400/2666; max 2666; 512 GB | Yes | 3.0, 48 lanes | Q3'17 | https://www.intel.com/content/www/us/en/products/sku/125040/intel-xeon-w2133-processor-8-25m-cache-3-60-ghz/specifications.html |
| W-2135 | 6 / 12 | 3.70 / 4.50 | 140 W | None listed | DDR4 1600/1866/2133/2400/2666; max 2666; 512 GB | Yes | 3.0, 48 lanes | Q3'17 | https://www.intel.com/content/www/us/en/products/sku/126709/intel-xeon-w2135-processor-8-25m-cache-3-70-ghz/specifications.html |
| W-2145 | 8 / 16 | 3.70 / 4.50 | 140 W | None listed | DDR4 1600/1866/2133/2400/2666; max 2666; 512 GB | Yes | 3.0, 48 lanes | Q3'17 | https://www.intel.com/content/www/us/en/products/sku/126707/intel-xeon-w2145-processor-11m-cache-3-70-ghz/specifications.html |
| W-2155 | 10 / 20 | 3.30 / 4.50 | 140 W | None listed | DDR4 1600/1866/2133/2400/2666; max 2666; 512 GB | Yes | 3.0, 48 lanes | Q3'17 | https://www.intel.com/content/www/us/en/products/sku/125042/intel-xeon-w2155-processor-13-75m-cache-3-30-ghz/specifications.html |
| W-2175 | 14 / 28 | 2.50 / 4.30 | 140 W | None listed | DDR4 1600/1866/2133/2400/2666; max 2666; 512 GB | Yes | 3.0, 48 lanes | Q3'17 | https://www.intel.com/content/www/us/en/products/sku/130046/intel-xeon-w2175-processor-19-25m-cache-2-50-ghz/specifications.html |
| W-2195 | 18 / 36 | 2.30 / 4.30 | 140 W | None listed | DDR4 1600/1866/2133/2400/2666; max 2666; 512 GB | Yes | 3.0, 48 lanes | Q3'17 | https://www.intel.com/content/www/us/en/products/sku/126793/intel-xeon-w2195-processor-24-75m-cache-2-30-ghz/specifications.html |

Sources:
- W-2102 spec: https://www.intel.com/content/www/us/en/products/sku/125038/intel-xeon-w2102-processor-8-25m-cache-2-90-ghz/specifications.html
- W-2102 compatible: https://www.intel.com/content/www/us/en/products/sku/125038/intel-xeon-w2102-processor-8-25m-cache-2-90-ghz/compatible.html
- W-2104 spec: https://www.intel.com/content/www/us/en/products/sku/125039/intel-xeon-w2104-processor-8-25m-cache-3-20-ghz/specifications.html
- W-2104 compatible: https://www.intel.com/content/www/us/en/products/sku/125039/intel-xeon-w2104-processor-8-25m-cache-3-20-ghz/compatible.html
- W-2123 spec: https://www.intel.com/content/www/us/en/products/sku/125036/intel-xeon-w2123-processor-8-25m-cache-3-60-ghz/specifications.html
- W-2123 compatible: https://www.intel.com/content/www/us/en/products/sku/125036/intel-xeon-w2123-processor-8-25m-cache-3-60-ghz/compatible.html
- W-2125 spec: https://www.intel.com/content/www/us/en/products/sku/126708/intel-xeon-w2125-processor-8-25m-cache-4-00-ghz/specifications.html
- W-2125 compatible: https://www.intel.com/content/www/us/en/products/sku/126708/intel-xeon-w2125-processor-8-25m-cache-4-00-ghz/compatible.html
- W-2133 spec: https://www.intel.com/content/www/us/en/products/sku/125040/intel-xeon-w2133-processor-8-25m-cache-3-60-ghz/specifications.html
- W-2133 compatible: https://www.intel.com/content/www/us/en/products/sku/125040/intel-xeon-w2133-processor-8-25m-cache-3-60-ghz/compatible.html
- W-2135 spec: https://www.intel.com/content/www/us/en/products/sku/126709/intel-xeon-w2135-processor-8-25m-cache-3-70-ghz/specifications.html
- W-2135 compatible: https://www.intel.com/content/www/us/en/products/sku/126709/intel-xeon-w2135-processor-8-25m-cache-3-70-ghz/compatible.html
- W-2145 spec: https://www.intel.com/content/www/us/en/products/sku/126707/intel-xeon-w2145-processor-11m-cache-3-70-ghz/specifications.html
- W-2145 compatible: https://www.intel.com/content/www/us/en/products/sku/126707/intel-xeon-w2145-processor-11m-cache-3-70-ghz/compatible.html
- W-2155 spec: https://www.intel.com/content/www/us/en/products/sku/125042/intel-xeon-w2155-processor-13-75m-cache-3-30-ghz/specifications.html
- W-2155 compatible: https://www.intel.com/content/www/us/en/products/sku/125042/intel-xeon-w2155-processor-13-75m-cache-3-30-ghz/compatible.html
- W-2175 spec: https://www.intel.com/content/www/us/en/products/sku/130046/intel-xeon-w2175-processor-19-25m-cache-2-50-ghz/specifications.html
- W-2175 compatible: https://www.intel.com/content/www/us/en/products/sku/130046/intel-xeon-w2175-processor-19-25m-cache-2-50-ghz/compatible.html
- W-2195 spec: https://www.intel.com/content/www/us/en/products/sku/126793/intel-xeon-w2195-processor-24-75m-cache-2-30-ghz/specifications.html
- W-2195 compatible: https://www.intel.com/content/www/us/en/products/sku/126793/intel-xeon-w2195-processor-24-75m-cache-2-30-ghz/compatible.html

Notes:
- **No turbo on W-2102 and W-2104.** Both pages have no "Max Turbo Frequency" field and say "Intel® Turbo Boost Technology ‡": "No". The W-2102 page also says "Intel® Hyper-Threading Technology ‡": "No". The W-2104 page also says "Intel® Hyper-Threading Technology ‡": "No", and its "Total Threads" is "4".
- **Turbo Boost Max 3.0:** every W-2100 page says "Intel® Turbo Boost Max Technology 3.0 ‡": "No". None gives a Turbo Boost Max 3.0 frequency. The other eight pages say "Intel® Turbo Boost Technology ‡": "2.0".
- **Memory speed:** W-2102 and W-2104 list speeds up to 2400; the other eight go up to 2666. Max memory is "512 GB" on all ten. No Intel page I read gives W-2100 memory speed by DIMMs per channel, or says RDIMM/UDIMM/LRDIMM.
- **W-2175 cache mismatch:** the page's product title is "Intel® Xeon® W-2175 Processor (19.25M Cache, 2.50 GHz)", but its "Cache" row says "19 MB". I re-checked this with a second fetch. The other caches: W-2102 to W-2135 "8.25 MB", W-2145 "11 MB", W-2155 "13.75 MB", W-2195 "24.75 MB".
- **W-2102 and W-2104 bus speed:** both pages say "Bus Speed": "0 GT/s". The other 16 pages say "8 GT/s".
- **Vertical Segment:** the W-2100 pages say "Server". The W-2200 pages say "Workstation".
- **Footnote paraphrase:** the ECC ‡ footnote text was returned verbatim, in pieces, on most pages. On some pages the tool returned only the first sentence.

## Xeon W-2200 series

All eight pages: "Code Name": "Products formerly Cascade Lake", "Vertical Segment": "Workstation", "Intel® Turbo Boost Technology ‡": "2.0". Socket, channels, ECC, PCIe, graphics and compatible chipset are as in the shared section. Each compatible page lists only "Intel® C422 Chipset". "TBM 3.0" below is the page's "Intel® Turbo Boost Max Technology 3.0 Frequency ‡" field. Where the page has no frequency, the "Intel® Turbo Boost Max Technology 3.0 ‡" row says "No". In the memory column, "max" is the spec page's highest listed speed. Intel's sales brief, for the series as a whole, says "Support for 1 DPC @ 2933 MHz and 2 DPC @ 2666 MHz" (DPC: DIMMs per channel; my expansion) ([SB2200]); no spec page gives speed by DIMMs per channel (see notes).

| Model | Cores/threads | Base / turbo GHz | TDP | Graphics | Memory (type, max speed, max size) | ECC | PCIe | Launch | Source |
|---|---|---|---|---|---|---|---|---|---|
| W-2223 | 4 / 8 | 3.60 / 3.90 (TBM 3.0: "No") | 120 W | None listed | DDR4 2666; max 2666 (the sales brief's DPC footnote names no SKU and is attached to its DDR4-2933 line; speed at 2 DIMMs per channel not stated for this model [SB2200]); 1 TB | Yes | 3.0, 48 lanes | Q4'19 | https://www.intel.com/content/www/us/en/products/sku/198018/intel-xeon-w2223-processor-8-25m-cache-3-60-ghz/specifications.html |
| W-2225 | 4 / 8 | 4.10 / 4.60 (TBM 3.0: "No") | 105 W | None listed | DDR4 2933; max 2933 (sales brief, series-wide: 1 DPC @ 2933 / 2 DPC @ 2666 [SB2200]); 1 TB | Yes | 3.0, 48 lanes | Q4'19 | https://www.intel.com/content/www/us/en/products/sku/198610/intel-xeon-w2225-processor-8-25m-cache-4-10-ghz/specifications.html |
| W-2235 | 6 / 12 | 3.80 / 4.60 (TBM 3.0: "No") | 130 W | None listed | DDR4 2933; max 2933 (sales brief, series-wide: 1 DPC @ 2933 / 2 DPC @ 2666 [SB2200]); 1 TB | Yes | 3.0, 48 lanes | Q4'19 | https://www.intel.com/content/www/us/en/products/sku/198608/intel-xeon-w2235-processor-8-25m-cache-3-80-ghz/specifications.html |
| W-2245 | 8 / 16 | 3.90 / 4.50 (TBM 3.0: 4.70) | 155 W | None listed | DDR4 2933; max 2933 (sales brief, series-wide: 1 DPC @ 2933 / 2 DPC @ 2666 [SB2200]); 1 TB | Yes | 3.0, 48 lanes | Q4'19 | https://www.intel.com/content/www/us/en/products/sku/198609/intel-xeon-w2245-processor-16-5m-cache-3-90-ghz/specifications.html |
| W-2255 | 10 / 20 | 3.70 / 4.50 (TBM 3.0: 4.70) | 165 W | None listed | DDR4 2933; max 2933 (sales brief, series-wide: 1 DPC @ 2933 / 2 DPC @ 2666 [SB2200]); 1 TB | Yes | 3.0, 48 lanes | Q4'19 | https://www.intel.com/content/www/us/en/products/sku/198016/intel-xeon-w2255-processor-19-25m-cache-3-70-ghz/specifications.html |
| W-2265 | 12 / 24 | 3.50 / 4.60 (TBM 3.0: 4.80) | 165 W | None listed | DDR4 2933; max 2933 (sales brief, series-wide: 1 DPC @ 2933 / 2 DPC @ 2666 [SB2200]); 1 TB | Yes | 3.0, 48 lanes | Q4'19 | https://www.intel.com/content/www/us/en/products/sku/198015/intel-xeon-w2265-processor-19-25m-cache-3-50-ghz/specifications.html |
| W-2275 | 14 / 28 | 3.30 / 4.60 (TBM 3.0: 4.80) | 165 W | None listed | DDR4 2933; max 2933 (sales brief, series-wide: 1 DPC @ 2933 / 2 DPC @ 2666 [SB2200]); 1 TB | Yes | 3.0, 48 lanes | Q4'19 | https://www.intel.com/content/www/us/en/products/sku/198010/intel-xeon-w2275-processor-19-25m-cache-3-30-ghz/specifications.html |
| W-2295 | 18 / 36 | 3.00 / 4.60 (TBM 3.0: 4.80) | 165 W | None listed | DDR4 2933; max 2933 (sales brief, series-wide: 1 DPC @ 2933 / 2 DPC @ 2666 [SB2200]); 1 TB | Yes | 3.0, 48 lanes | Q4'19 | https://www.intel.com/content/www/us/en/products/sku/198011/intel-xeon-w2295-processor-24-75m-cache-3-00-ghz/specifications.html |

Sources:
- W-2223 spec: https://www.intel.com/content/www/us/en/products/sku/198018/intel-xeon-w2223-processor-8-25m-cache-3-60-ghz/specifications.html
- W-2223 compatible: https://www.intel.com/content/www/us/en/products/sku/198018/intel-xeon-w2223-processor-8-25m-cache-3-60-ghz/compatible.html
- W-2225 spec: https://www.intel.com/content/www/us/en/products/sku/198610/intel-xeon-w2225-processor-8-25m-cache-4-10-ghz/specifications.html
- W-2225 compatible: https://www.intel.com/content/www/us/en/products/sku/198610/intel-xeon-w2225-processor-8-25m-cache-4-10-ghz/compatible.html
- W-2235 spec: https://www.intel.com/content/www/us/en/products/sku/198608/intel-xeon-w2235-processor-8-25m-cache-3-80-ghz/specifications.html
- W-2235 compatible: https://www.intel.com/content/www/us/en/products/sku/198608/intel-xeon-w2235-processor-8-25m-cache-3-80-ghz/compatible.html
- W-2245 spec: https://www.intel.com/content/www/us/en/products/sku/198609/intel-xeon-w2245-processor-16-5m-cache-3-90-ghz/specifications.html
- W-2245 compatible: https://www.intel.com/content/www/us/en/products/sku/198609/intel-xeon-w2245-processor-16-5m-cache-3-90-ghz/compatible.html
- W-2255 spec: https://www.intel.com/content/www/us/en/products/sku/198016/intel-xeon-w2255-processor-19-25m-cache-3-70-ghz/specifications.html
- W-2255 compatible: https://www.intel.com/content/www/us/en/products/sku/198016/intel-xeon-w2255-processor-19-25m-cache-3-70-ghz/compatible.html
- W-2265 spec: https://www.intel.com/content/www/us/en/products/sku/198015/intel-xeon-w2265-processor-19-25m-cache-3-50-ghz/specifications.html
- W-2265 compatible: https://www.intel.com/content/www/us/en/products/sku/198015/intel-xeon-w2265-processor-19-25m-cache-3-50-ghz/compatible.html
- W-2275 spec: https://www.intel.com/content/www/us/en/products/sku/198010/intel-xeon-w2275-processor-19-25m-cache-3-30-ghz/specifications.html
- W-2275 compatible: https://www.intel.com/content/www/us/en/products/sku/198010/intel-xeon-w2275-processor-19-25m-cache-3-30-ghz/compatible.html
- W-2295 spec: https://www.intel.com/content/www/us/en/products/sku/198011/intel-xeon-w2295-processor-24-75m-cache-3-00-ghz/specifications.html
- W-2295 compatible: https://www.intel.com/content/www/us/en/products/sku/198011/intel-xeon-w2295-processor-24-75m-cache-3-00-ghz/compatible.html
- [PB2200] Product brief, "PRODUCT BRIEF Intel® Xeon® W-2200 processors" (no date or document number given): https://www.intel.com/content/dam/www/public/us/en/documents/product-briefs/xeon-w-2200-processors-brief.pdf
- [SB2200] Sales brief (marked "Intel Confidential" but hosted publicly on intel.com; test dates 9/23/19 and 11/11/19): https://www.intel.com/content/dam/www/public/us/en/documents/sales-briefs/w-2200-sales-brief.pdf
- [NR2019] Intel news release, October 7, 2019: https://download.intel.com/newsroom/2021/archive/2019-10-07-news-releases-intel-enables-ai-acceleration-brings-new-pricing-intel-xeon-w-x-series-processors.pdf

Notes:
- **W-2223 memory is slower.** Its page says "Memory Types": "DDR4 2666". The other seven say "DDR4 2933". The product brief says "Up to 1TB DDR4-2933 memory" ([PB2200]); the sales brief says "NEW up to 1 TB DDR4-2933 support" ([SB2200]). The product brief's table has one "Four Channels DDR4-2666" row. The extracted table was garbled, so the tool could not reliably match that row to a SKU ([PB2200]).
- **Speed by DIMMs per channel (W-2200 only):** the sales brief's footnote 9, on "NEW up to 1 TB DDR4-2933 support", says: "Support for 1 DPC @ 2933 MHz and 2 DPC @ 2666 MHz". It also says: "Up to 4 channels of up to 1 TB DDR4 @ 2933Mhz with ECC" ([SB2200]). This is a series-wide statement. It does not mention the W-2223's 2666 limit. No spec page gives speed by DIMMs per channel.
- **Turbo Boost Max 3.0:** W-2223, W-2225 and W-2235 say "Intel® Turbo Boost Max Technology 3.0 ‡": "No" (re-checked with a second fetch for W-2225 and W-2235). W-2245 to W-2295 give the frequencies in the table. The product brief says "Up to 4.8GHz with Intel® Turbo Boost Max Technology 3.0". The tool extracted only five values from the brief's per-SKU TBM 3.0 column, "4.7, 4.7, 4.8, 4.8, 4.8", and could not match them to SKUs ([PB2200]).
- **PCIe lane counts differ between sources.** The spec pages say "48". The product brief says "Up to 48 processor PCIe* lanes" and also "TOTAL PLATFORM PCIE* 3.0 LANES Up to 72". The sales brief says "Up to 48 processor PCIe lanes on all SKUs" and "Up to 72 lanes" under "Platform PCIe 3.0 Lanes" ([PB2200], [SB2200]). Intel does not explain the 72 on these pages. (My arithmetic, not stated by Intel: 48 CPU lanes plus the C422 page's "Max # of PCI Express Lanes": "24" ([C422]) makes 72.)
- **Sockets per system:** the product brief says "1 TB DDR4 with ECC memory in a single-socket solution" ([PB2200]).
- **Launch:** the October 7, 2019 news release says "Intel announces the newest generation of Intel® Xeon® W-2200 and X-series platforms, targeting availability in November." It does not mention socket, chipset, C422, BIOS or compatibility ([NR2019]). The spec pages say "Q4'19".
- **Tool paraphrase:** on the W-2225 and W-2275 pages the tool paraphrased the end of the ECC ‡ footnote. The spec values themselves were returned verbatim.

## Upgrading between them

- **Does an Intel page say that W-2100 and W-2200 CPUs share a socket and chipset, or that a W-2200 can go in a W-2100 machine? Not stated.** I found no Intel sentence saying either. Searches for that statement on intel.com found only the pages listed below.
- What Intel's pages do show, model by model (these are separate facts, not an Intel statement about upgrading):
  - All 10 W-2100 and all 8 W-2200 spec pages say "Sockets Supported": "FCLGA2066" (per-model sources above).
  - All 18 compatible lists name only "Intel® C422 Chipset" (per-model sources above).
  - The C422 compatible list puts all 18 models under one heading, "Intel® Xeon® W Processor" ([C422C]). It has no BIOS or generation note.
  - Intel article 000055173 has one row, "Intel® Xeon® W Processor: Intel® Xeon® W-2000 Processors" | "LGA2066" | "EOIS". It does not name W-2100 or W-2200 ([KB55173]).
  - Intel's W-2200 sales brief lists its own test systems. "Intel® Xeon® W-2195 Processor, PL1=140W TDP, 18C36T, Turbo up to 4.3GHz" was tested with "Motherboard: ASUS C422 SAGE" and "BIOS Version 1202". "Intel® Xeon® W-2295 Processor, PL1=165W TDP, 18C36T, Turbo up to 4.8GHz" was tested with "Motherboard: ASUS C422 SAGE" in the 11/11/19 test (no BIOS version listed) and with "Motherboard: Intel Glacier Falls Reference Platform" in the 9/23/19 test ([SB2200]). This is a benchmark configuration, not a compatibility statement, and it is not a Dell, HP or Lenovo board. Of these two Xeon W test systems, the brief gives a BIOS version for the W-2195 only, so it does not show both CPUs running on the same board with the same BIOS, and it says nothing about a W-2200 going into a board that shipped with a W-2100.
  - **W-2295 turbo: two different measures.** The sales brief's "Turbo up to 4.8GHz" line does not say which turbo measure it is ([SB2200]). The W-2295 spec page gives two: "Max Turbo Frequency": "4.60 GHz" and "Intel® Turbo Boost Max Technology 3.0 Frequency ‡": "4.80 GHz" (W-2295 spec URL in the W-2200 sources). The sales brief's 4.8 GHz matches the Turbo Boost Max 3.0 figure, not the "Max Turbo Frequency" (inference, not stated by Intel). The product brief's series-level wording is "Up to 4.8GHz with Intel® Turbo Boost Max Technology 3.0" ([PB2200]).
- **BIOS:** no Intel page I read gives a BIOS requirement for running a W-2200 on a C422 board. The only Intel BIOS statement is the general one for Xeon W: "Intel recommends contacting your server system or motherboard manufacturer (original equipment manufacturer or OEM)" / "for the latest BIOS or firmware updates." ([KB97589]).
- **Dell Precision 5820, HP Z4 G4, Lenovo ThinkStation P520:** whether a given machine or BIOS version accepts a W-2200 is not stated on any Intel page. That is on the system maker's support pages, which I did not check.
- **Not Intel (for context only).** An Intel Community forum thread is titled "Is the Xeon W-2295 processor compatible with Dell Precision 5820 workstation?" The original question is visible only as the page's meta description: "Trying to upgrade from a W-2102 to a W-2295 is unsuccessful." / "Other W-2100 series processors do work." / "Latest 2.0.2 BIOS is being used." The one visible reply, from user "AlHill", is dated February 29, 2020, 6:46pm and has no Intel-staff label on the page: "You have to ask Dell what processors are supported by their bios. Then, you can select from those." / "An upgrade processor must be socket, chipset, and bios compatible." (https://community.intel.com/t5/Mobile-and-Desktop-Processors/Is-the-Xeon-W-2295-processor-compatible-with-Dell-Precision-5820/m-p/701125). The question came on or before that date, so "Latest 2.0.2 BIOS" means latest then, not now (inference, not stated by Intel). This is one user's failed attempt and a user reply, not an Intel statement; it neither shows that a W-2295 can't work in a 5820 on a later BIOS nor that it can (inference, not stated by Intel).

Sources:
- Per-model spec and compatible pages: see the two series sections above.
- [C422C] https://www.intel.com/content/www/us/en/products/sku/126691/intel-c422-chipset/compatible.html
- [C422] https://www.intel.com/content/www/us/en/products/sku/126691/intel-c422-chipset/specifications.html
- [KB55173] https://www.intel.com/content/www/us/en/support/articles/000055173/processors/intel-xeon-processors.html
- [KB97589] https://www.intel.com/content/www/us/en/support/articles/000097589/processors.html
- [SB2200] https://www.intel.com/content/dam/www/public/us/en/documents/sales-briefs/w-2200-sales-brief.pdf
- [PB2200] https://www.intel.com/content/dam/www/public/us/en/documents/product-briefs/xeon-w-2200-processors-brief.pdf
- Forum thread (not Intel): https://community.intel.com/t5/Mobile-and-Desktop-Processors/Is-the-Xeon-W-2295-processor-compatible-with-Dell-Precision-5820/m-p/701125
