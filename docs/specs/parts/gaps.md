# What the parts research couldn't find

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## AMD

- **ECC on the 5600X, 5800X, 5900X, 5950X, 5600G and 5700G.** AMD's current pages for these models have no ECC field, so ECC is "not stated".
  - AMD's "Dedicated Hosting" data sheet for Ryzen 3000/5000 says Ryzen processors "provide support for an ECC-enabled memory subsystem that can automatically correct data errors" but does not say which models (https://www.amd.com/content/dam/amd/en/documents/products/processors/ryzen/5000/amd-ryzen-5000-datasheet.pdf).
  - ASUS (secondary) lists the "Ryzen 5000 Series" family as ECC "Supported" on its B550/X570 boards, and says only PRO APUs support ECC for 3000/4000 G-series. It is silent on 5000 G-series.
- **Chipset-level ECC.** AMD's AM4 chipset page never mentions ECC.
- **"Supporting Chipsets" for 5600X, 5600G, 5700G, 5800X, 5900X and 5950X.** Not on AMD's model pages. Only the AM4 table's family-level "Ryzen 5000 Series" column covers them.
- **Max memory / channels / per-configuration memory speeds** for the 5600X, 5800X, 5900X and 5950X (only "Up to 3200 MT/s" is stated), and max memory for the 5600G and 5700G.
- **The A320 conflict.** The AM4 table and the 2022 release say A320 gets Ryzen 5000 via "Selective Beta BIOS", but the 5600 and 5700X "Supporting Chipsets" lists omit A320. I found no AMD page reconciling these.
- **AMD's own original text on Ryzen 5000 for B450/X470 (May 2020).** The AMD community blog URL now redirects to a generic page. I only have it secondhand (Tom's Hardware), and found no AMD page on whether the "one-way" / "disable support" caveats still apply.
- **No AMD page gives specific minimum BIOS/AGESA versions per chipset.** AMD points to the board maker's site for that (CPU-99).
- **Generation of each chipset's own PCIe lanes** for B550, A520, B450, B350, X370 and A320. Only X570 ("16x Gen 4") and X470 ("2x Gen 3, 8x Gen 2") appear, in the "Additional Usable PCIe Lanes from Motherboard" field on the 5600 and 5700X pages.
- **Footnote 5 and the 5600G/5700G.** AMD's footnote 5, read literally, covers the 5600G and 5700G ("Ryzen processors with Radeon graphics for socket AM4 ... limited to 1x8 PCIe Gen3 lanes for the graphics card", https://www.amd.com/en/products/processors/chipsets/am4.html). Their spec pages give no lane counts, and AMD doesn't say whether the footnote was written before they launched. Treat this as unresolved rather than assume either way.
- **USB 3.2 Gen2 counts per chipset.** They came through garbled with footnote digits, so I left them out.
- **Several amd.com product pages could not be fetched** (5600, 5600G, 5700X, 5700G under `/en/products/processors/desktops/ryzen/5000-series/`, client error). I used the AMD Drivers and Downloads spec section for those models instead.
- **The amd.com processor specifications database** (https://www.amd.com/en/products/specifications/processors.html) loads its table by script, so the fetch tool could not read it.
- **AM5: B650 and B650E.** Not on AMD's AM5 chipset page (https://www.amd.com/en/products/processors/chipsets/am5.html), so no graphics-slot PCIe generation, lane total or overclocking value from AMD.
- **AM5 chipset-level ECC.** Not mentioned on the AM5 page (https://www.amd.com/en/products/processors/chipsets/am5.html).
- **Boot-kit compatibility table.** An image that the fetch tool could not read (https://www.amd.com/en/resources/support-articles/faqs/RMA-BKTS.html).

## Intel

- **DDR4/DDR5 on chipset pages.** No Intel chipset spec page I read (H610 through Z790, H310 through C246) has a Memory Types field.
  - Intel lists DDR4 and DDR5 per processor ([KB92149], CPU pages). For 8th/9th gen it says "only DDR4" ([KB25694]).
  - The only Intel "one type" statement I found is the 12th Gen processor datasheet: "Mix of technologies in one system is not allowed." I found no Intel sentence about boards as such, and I did not check the 13th/14th gen datasheet.
- **Gen4/Gen3 lane split for the 600-series chipsets (H610, B660, H670, Z690).**
  - Not found. The spec pages give only the total lanes and "3.0, 4.0" (H610: "3.0" only). The Z690 and B660 briefs say "Gen 4.0 and PCIe Gen 3.0" without a split.
  - The 600-series PCH datasheet (cdrdv2 648364) gave no SKU table through the viewer, and the direct PDF was robots-disallowed.
  - The 700-series split is from the datasheet.
- **Box coolers for 8th/9th gen non-K (i5-8500, i5-9500, i7-8700, i7-9700):** not stated on Intel's spec or ordering pages, and I found no Intel article naming them. Intel's only rule is that K/KF/KS/XE/X parts ship without one ([KB5940]).
- **ECC on 12th gen:**
  - i5-12600K, i7-12700 and i7-12700K say "Yes". On the i5-12400, i5-12400F and i7-12700F pages there's no ECC field (the only "ECC" is inside "ECCN" in the legal note), so for those three ECC support is "not stated", not "No".
  - No CPU page I read says which chipset ECC needs. The W680 brief doesn't list processors. Intel's general article says "ECC memory support requires both processor and chipset support" ([KB96922]), and of the chipsets on these CPUs' compatible lists only W680 says ECC "Yes" ([W680]). H610, B660, H670, Z690, B760, H770, Z790, Q670 and H610E say "No" ([H610], [B660], [H670], [Z690], [B760], [H770], [Z790], [Q670], [H610E]). No single Intel sentence says that 12th gen ECC needs a W680 board; that conclusion joins the two (inference, not stated by Intel).
- **C246 with Core i3/Pentium:** Intel's C246 compatible list has Xeon E only. The only Intel statement on a Core part is a 2022 forum reply saying the i3-8100 wasn't validated on C246.
- **9th gen on Z370 specifically:** no Intel statement names Z370. Only the general 300-series "may need a BIOS update" applies, and the Z370 compatible list includes 9th gen.
- **The i5-8500 on Z390 and Q370:** Intel's lists leave it out in both directions, and Intel gives no reason. Whether this means "not validated" or is just a gap in the list is not stated.
- **65 W threshold for the instability:** not found in any Intel page I could open; only in press reports (secondary). The Intel blog posts redirected. Intel article 000099569 opens without "www." ([KB99569]), but "65W", "65 W" and "non-K" do not appear in its text, and its list of affected processors is an image that can't be read as text.
- **Which 13th/14th gen models are physically the older Alder Lake die**, and whether Intel counts them as affected: not checked. From memory, unchecked: some i5-13400/14400 variants use the Alder Lake die. Intel's pages I read don't address this.
  - The only Intel text found that ties the fix to a CPU ID is in 000099569, which asks "Even if my system has never experienced any instability symptoms, should I upgrade the BIOS to one with microcode patch 0x129?" and answers: "Yes, Intel recommends that customers update the BIOS with Microcode 0x129 for systems configured with 13th and 14th" / "Generation Processors with CPUID 0xB0671." It does **not** say that other CPU IDs are unaffected or safe, so it does not confirm the from-memory note above ([KB99569]).
- **Intel's statement on whether a CPU that is already degraded can be fixed:** not found in plain words on an Intel page. Intel calls the 0x129 voltage limit "a preventative mitigation" "for processors not experiencing instability symptoms" and tells users with consistent instability to contact the system maker, Intel Customer Support (boxed) or the place of purchase (tray) ([0x129], [KB99569]). 000099569's Q&A on whether 0x129 will fix a processor that is "already experiencing issues" does not answer yes or no ([KB99569]).

Sources:
- [KB92149] https://www.intel.com/content/www/us/en/support/articles/000092149.html
- [KB25694] https://www.intel.com/content/www/us/en/support/articles/000025694.html
- [KB5940] https://www.intel.com/content/www/us/en/support/articles/000005940.html
- [KB96922] https://www.intel.com/content/www/us/en/support/articles/000096922.html
- [W680] https://www.intel.com/content/www/us/en/products/sku/218834/intel-w680-chipset/specifications.html
- [H610] https://www.intel.com/content/www/us/en/products/sku/218829/intel-h610-chipset/specifications.html
- [B660] https://www.intel.com/content/www/us/en/products/sku/218832/intel-b660-chipset/specifications.html
- [H670] https://www.intel.com/content/www/us/en/products/sku/218831/intel-h670-chipset/specifications.html
- [Z690] https://www.intel.com/content/www/us/en/products/sku/218833/intel-z690-chipset/specifications.html
- [B760] https://www.intel.com/content/www/us/en/products/sku/229719/intel-b760-chipset/specifications.html
- [H770] https://www.intel.com/content/www/us/en/products/sku/229720/intel-h770-chipset/specifications.html
- [Z790] https://www.intel.com/content/www/us/en/products/sku/229721/intel-z790-chipset/specifications.html
- [Q670] https://www.intel.com/content/www/us/en/products/sku/218827/intel-q670-chipset/specifications.html
- [H610E] https://www.intel.com/content/www/us/en/products/sku/225973/intel-h610e-chipset/specifications.html
- [KB99569] https://intel.com/content/www/us/en/support/articles/000099569.html
- [0x129] https://community.intel.com/t5/Processors/Microcode-0x129-Update-for-Intel-Core-13th-and-14th-Gen-Desktop/m-p/1622129

## Graphics cards

- **NVIDIA GTX 1650:** the current nvidia.com GTX 1650 pages have no spec table, the NVIDIA compare page was blocked by robots rules, and `/gtx-1650/specs/` errored. The reference spec above comes from NVIDIA's older Malaysia regional page. NVIDIA doesn't list a PCIe generation or lane count for the GTX 1650.
- **MSI "GTX 1650 D6 4GT LP":** not found on MSI's site. Only GDDR5 LP models (4GT LP, LP OC, LP V1, LP OCV1) turned up.
- **MSI GTX 1650 LP cards:** slot width, box contents and which brackets are included aren't stated. There is no power-connector row (none is likely, but MSI doesn't say "none").
- **Gigabyte GTX 1650 LP cards:** slot width and board power aren't stated.
- **ZOTAC GTX 1650 Low Profile (GDDR5):** no spec table retrieved. Only the GDDR6 version's specs were read, and that page was in French.
- **ASUS GTX1650-O4G-LP-BRK:** whether a low-profile bracket is in the box is unclear ("Accessories: Yes x 1"). Power consumption isn't stated. I didn't open the non-OC GTX1650-4G-LP-BRK techspec page.
- **NVIDIA RTX 3060:** no NVIDIA dimensions or supplementary power connector for the non-Ti 3060 (the table is blank there), and no PCIe lane count from NVIDIA (Gigabyte says x16). NVIDIA gives one power figure (200 W) for the 3060 Ti across its GDDR6 and GDDR6X versions. Slot width is not stated on any of the three partner pages (MSI VENTUS 2X 12G OC, MSI VENTUS 2X 8G OC, Gigabyte EAGLE OC 12G rev 2.0), so no source in this file gives a slot count for any RTX 3060 (non-Ti) card.
- **AMD (all four Radeon cards):** AMD's product pages give no PCIe generation or lane count, no number of display ports or max displays, and no dimensions for the RX 6600 / 6600 XT. AMD uses "Typical Board Power (Desktop)", and its press releases say just "TBP", so I found no "Total Board Power" figure under that name. AMD says nothing about running these cards in PCIe 3.0 boards. Lane counts come from partner pages only: x8 for RX 6600 / 6600 XT (MSI and Sapphire); x16 for RX 6700 XT and RX 6700 (Sapphire only; MSI's RX 6700 XT page gives "PCI Express 4.0" with no lane count). Slot width is not stated on the MSI RX 6600 MECH 2X 8G, RX 6600 XT MECH 2X 8G or RX 6700 XT 12G pages.
- **Intel Arc A310:** Intel's A310 page gives no power connector, PSU, dimensions or "Intel Reference Card Attributes" section, and doesn't say whether Intel makes an A310 card itself. Intel's Arc quick start guide never names the A310, so its A-Series requirements and platform table are applied to the A310 by inference (Intel lists the A310 under "Intel® Arc™ A-Series Graphics"). TechPowerUp's A310 entry (30 W) disagrees with Intel (75 W TBP), so I didn't rely on it beyond the connector line.
- **Sparkle A310 ECO:** Sparkle doesn't state the power connector (secondary only: TPU "None"), and the spec sheet doesn't label which dimension is which.
- **ASRock A310 Low Profile:** ASRock doesn't state TBP or the power connector (secondary: 75 W, no connector), or which bracket is fitted when it ships. Two ASRock URLs failed to fetch.
- **Intel Arc B580:** Intel's spec page doesn't give the number of physical ports on its own card, and never names the "Limited Edition" in the spec table. The port count and measured width are secondary (TechPowerUp; the 45 mm "width" is a different measurement from Intel's 115 mm "Width", see the B580 section), and TPU's 280 mm length disagrees with Intel's 272 mm. I found no Intel sentence saying a B-Series card works without Resizable BAR (that statement is in an A-Series article), and no Intel statement on B580 performance in a PCIe 3.0 slot.
- **Quadro P620 / T400:** power connector not stated by NVIDIA, PNY or Gigabyte (secondary TPU: none needed). NVIDIA's T400 datasheet doesn't use the words "low profile" (PNY does). P620 length differs between NVIDIA (5.7 in) and PNY (5.906 in). I didn't open PNY's 2 GB T400 page.
- **Raw page text:** every page was read through a summarising fetch tool, because direct downloads from intel.com, nvidia.com and amd.com were refused by the session proxy (403). Quotes weren't checked character by character.

## Intel Xeon E-2100 and E-2200

- **An Intel sentence defining "G" for Xeon E.** The graphics/no-graphics split is shown by every spec page and the datasheet tables, but Intel never says it in words.
- **Why Intel's compatible lists leave out E-2200 on C242**, when HPE's MicroServer Gen10 Plus QuickSpecs pair an E-2224 with a C242 chipset. Intel gives no explanation. Whether a given C242 or C246 board runs a given E-2200 chip depends on that board maker's CPU support list, which this file doesn't cover (inference, not stated by Intel).
- **A field called "Processor Graphics":** not on any of these pages. The field is "GPU Name‡".
- **An Intel statement mapping stepping (U-0 / R-0) to series.** The ordering pages give "R0" only for the E-2278G and E-2288G and "U0" for the other 19 models, but no Intel sentence ties a stepping to a series. (The E-2200 sSpec codes are now listed under "Telling them apart", from the ordering pages.)
- **Maximum DIMM size per slot** on the spec pages: not stated. The datasheet's UDIMM tables go to 32 GB **(tool paraphrase)**, using 16Gb devices, while its section 2.1.1 mentions only 4-Gb and 8-Gb devices (see the shared section), and I read only the first 100,000 of 273,632 characters of the datasheet.
- **Whether "Included Items" (box cooler) is really absent** on the 10 pages where the tool reported it missing. I didn't re-check them, and the cooler isn't one of the requested fields.
- **Device ID and graphics max frequency on the E-2124G and E-2126G pages:** not asked for. The E-2124G's 1.15 GHz came from a separate read, and the E-2126G's 1.15 GHz from the spec update.
- **"Use Conditions" and end-of-servicing fields:** checked on only a few pages (E-2124G, E-2146G, E-2176G, E-2246G; end-of-servicing also on E-2134, E-2224 and E-2224G).
- **Not opened:** the E-2100 and E-2200 product briefs and the datasheet Volume 2 (seen as search-result titles only).

## Intel Xeon W-2100 and W-2200

- **An Intel statement that W-2100 and W-2200 share a socket and chipset, or that a W-2200 works in a W-2100 board.** Not on the spec pages, the compatible lists, the W-2200 product brief, the sales brief, the October 2019 news release, the August 2017 Xeon W news byte (https://download.intel.com/newsroom/2021/archive/2017-08-29-news-intel-xeon-scalable-processors-accelerate-creation-innovation-next-generation-workstations.pdf, which mentions no socket type, LGA2066, chipset or C422; "socket" appears only in "single-socket", "dual-socket" and, in footnotes, "two-socket"), or support articles 000055173, 000057630 and 000097589.
- **Any Intel BIOS, ME firmware or microcode requirement for W-2200 on C422.** None found. Intel sends BIOS questions to the board or system maker ([KB97589]).
- **Dell, HP and Lenovo CPU support lists and BIOS notes** for the Precision 5820, Z4 G4 and ThinkStation P520. Not checked; outside this Intel-only task.
- **Whether a Xeon W-2100 or W-2200 works in an X299 board.** Not stated on any Intel page I read (see the shared section, [KB5592]).
- **What Intel's Product Compatibility Tool lists for Xeon W.** Article 000057630 points to it ([KB57630]); I did not open it.
- **A Xeon W-2100 or W-2200 datasheet or specification update.** Searches on intel.com did not return one, so I have no Intel datasheet wording on socket, platform or memory.
- **W-2100 memory speed by DIMMs per channel, and DIMM type (RDIMM, UDIMM, LRDIMM) for either series.** Not on the spec pages. The only DIMMs-per-channel statement is the W-2200 sales brief footnote.
- **The W-2200 product brief's per-SKU table.** The PDF text came out garbled, so its rows could not be matched to SKUs.
- **The www.intel.com HTML version of the W-2200 product brief.** Search returned only a `wcm-ciqa.intel.com` copy (it looks like a staging host). I did not open it and used the PDF instead.
- **Intel Community thread "What is the type of a chipset compatible to the Xeon W 2123 processor?"** The fetch failed (client error), so nothing was read.
- **Why the C422 compatible list includes 14 Xeon D-21xx processors, and why the C422 page says "Products formerly Kaby Lake".** Intel's pages give no explanation, and I have not interpreted either.
