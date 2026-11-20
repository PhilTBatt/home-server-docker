# NVIDIA GeForce GTX 1650

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

How this was gathered (read before trusting a figure):
- Direct downloads (curl) to intel.com, nvidia.com and amd.com were refused by this session's network proxy (HTTP 403), so every page was read through a web-fetch tool that summarises the page with a small model. Text in quotes is what that tool returned as verbatim. I re-asked for the raw label and value wherever a figure mattered (power, connector, PSU, slot, length), but I could not check the quotes character by character against the page.
- Makers' own pages come first. Secondary sources are marked **(secondary)** and are used only where the maker says nothing.
- "not stated" means the maker's page doesn't give it. "(my arithmetic)" marks unit conversions I worked out. "(inference)" marks anything I'm reading into a page rather than reading off it.
- No eBay pages were opened.

## Nvidia GeForce GTX 1650 (reference and low-profile partner cards)

**NVIDIA's reference spec.** The current nvidia.com GTX 1650 pages (en-gb and en-us) have no spec table. NVIDIA's compare page was blocked (robots), and `/gtx-1650/specs/` errored. The table below is from NVIDIA's older regional page (Malaysia, page title "GeForce GTX 16 Series Graphics Cards | NVIDIA"), which has columns "GeForce GTX 1650 - GDDR6" and "GeForce GTX 1650 - GDDR5". [NVIDIA GTX 1650 legacy page]

| Item | GTX 1650 GDDR6 | GTX 1650 GDDR5 |
|---|---|---|
| CUDA cores | 896 | 896 |
| Boost / base clock (MHz) | 1590 / 1410 | 1665 / 1485 |
| Memory | 4GB GDDR6, 12 Gbps, 128-bit, 192 GB/s | 4GB GDDR5, 8 Gbps, 128-bit, 128 GB/s |
| Standard display connectors | "HDMI 2.0b, DL-DVI-D, DP 1.4a(5)" | "HDMI 2.0b, DL-DVI-D" |
| Height | 4.38" | 4.37" |
| Length | 5.7" | 5.1" |
| Width | 2-Slot | 2-Slot |
| Graphics Card Power (W) | "75(5)" | "75" |
| Recommended System Power (W)(3) | "300(5)" | "300" |
| Supplementary Power Connectors | "Yes(5)" | "None" |

- Footnote 3 (system power): "Recommendation is made based on PC configured with an Intel Core i7 3.2 GHz processor." "Pre-built system may require less power depending on system configuration." [NVIDIA GTX 1650 legacy page]
- Footnote 5: "Varies by model. Check with manufacturer for exact specs". So for the GDDR6 version NVIDIA says a supplementary connector may be present depending on the model. [NVIDIA GTX 1650 legacy page]. Both low-profile GDDR6 cards below list Power Connectors as "N/A" (Gigabyte GV-N1656OC-4GL, ZOTAC ZT-T16520H-10L). [Gigabyte GV-N1656OC-4GL], [Zotac LP GDDR6]
- NVIDIA's reference heights (4.38 in GDDR6, 4.37 in GDDR5, ≈ 111 mm, my arithmetic) match or nearly match ZOTAC's figure "4.38in", given against its "2.76in LP" in "6.30in x 4.38in (2.76in LP) x 1.34in" [Zotac LP GDDR6], so they describe full-height cards, not low-profile ones (inference, not stated by the maker: neither NVIDIA's table nor ZOTAC's page uses the words "full height").
- PCIe: NVIDIA's table has no "Bus Support" or PCI Express row. Every partner page below says PCIe 3.0, and the ones that give a lane count say x16.

**MSI GeForce GTX 1650 4GT LP (GDDR5)**
- Interface: "PCI Express x16 3.0". Memory "4GB GDDR5". Boost "1665 MHz". [MSI 4GT LP]
- Card dimension: "168 x 105 x 37 mm (w/ normal bracket)" / "168 x 69 x 37 mm (w/ low profile bracket)". [MSI 4GT LP]
- Power consumption: "75 W". Recommended PSU: "300 W". [MSI 4GT LP]
- Power connector: the spec table has **no** power-connector row. (inference: MSI's tables for cards that need one do have a "Power connectors" row, for example "8-pin x 1" on its RX 6600 page, so the missing row suggests none, but MSI doesn't say "none".) [MSI 4GT LP]
- Slot width: not stated. Box contents and which brackets are included: not stated (brackets appear only in the dimension row). [MSI 4GT LP]
- Outputs: "HDMI™ x 1(Supports 4K@60Hz as specified in HDMI™ 2.0b)" and "DL-DVI-D x 1". Maximum displays "2". [MSI 4GT LP]
- The **4GT LP OC** has the same table except boost "1695 MHz". Slot width: not stated. [MSI 4GT LP OC]

**MSI GeForce GTX 1650 4GT LP V1 (GDDR5)**
- Interface "PCI Express x16 3.0". Power consumption "75 W". Recommended PSU "300 W". No power-connector row. Slot width: not stated. [MSI 4GT LP V1]
- Card dimension: "170 x 69 x 42 mm (w/ low profile bracket)" / "170 x 105 x 42 mm (w/ normal bracket)". [MSI 4GT LP V1]
- Outputs: "DisplayPort x 1(v1.4)", "HDMI™ x 1(...HDMI™ 2.0b)", "DL-DVI-D x 1". Maximum displays "3". [MSI 4GT LP V1]. MSI's V1 datasheet PDF agrees and also gives no box contents or slot width. [MSI 4GT LP V1 PDF]
- **MSI "GTX 1650 D6 4GT LP"**: I didn't find this model on MSI's site. Searches returned only the 4GT LP, 4GT LP OC, 4GT LP V1 and 4GT LP OCV1. I didn't open the OCV1 page.

**Gigabyte GeForce GTX 1650 D6 OC Low Profile 4G (GV-N1656OC-4GL)**
- Memory "4 GB" "GDDR6", "128 bit". Core clock "1620 MHz (Reference Card: 1590 MHz)". [Gigabyte GV-N1656OC-4GL]
- Card bus: "PCI-E 3.0 x 16". [Gigabyte GV-N1656OC-4GL]
- Card size: "L=166.9 W=69 H=39 mm". PCB form: "Low Profile". [Gigabyte GV-N1656OC-4GL]
- Power connectors: "N/A". Recommended PSU: "300W". Board power: not stated. [Gigabyte GV-N1656OC-4GL]
- Slot width: not stated. (inference: 39 mm thick probably means two slots, but Gigabyte doesn't say.)
- Output: "DisplayPort 1.4 *1", "HDMI 2.0b *2", "Dual-link DVI-D *1". Multi-view "4". [Gigabyte GV-N1656OC-4GL]
- Accessories: "1. Quick guide", "2. Low Profile Bracket *1". [Gigabyte GV-N1656OC-4GL]

**Gigabyte GeForce GTX 1650 OC Low Profile 4G (GV-N1650OC-4GL, GDDR5)**
- "PCI-E 3.0 x 16". "L=166.9 W=69 H=39 mm". "Low Profile". Power connectors "N/A". PSU "300W". Slot width: not stated. [Gigabyte GV-N1650OC-4GL]
- Output: "DisplayPort 1.4 *1", "HDMI 2.0b *1", "Dual-link DVI-D *1". Multi-view "3". Accessories include "Low Profile Bracket *1". [Gigabyte GV-N1650OC-4GL]

**ZOTAC GAMING GeForce GTX 1650 Low Profile GDDR6 (ZT-T16520H-10L)**. Read from ZOTAC's French-language page: the fetch tool translated the labels and kept the values as written. [Zotac LP GDDR6]
- PCI Express: "3.0" (no lane count given). [Zotac LP GDDR6]
- Dimensions: "160mm x 111.15mm (70mm LP) x 34mm / 6.30in x 4.38in (2.76in LP) x 1.34in". [Zotac LP GDDR6]
- Slot: "Dual Slot". [Zotac LP GDDR6]
- Power consumption "75W". Recommended PSU "300W". Power connectors "N/A". [Zotac LP GDDR6]
- Outputs: "DisplayPort 1.4 (up to 7680x4320@60Hz)", "HDMI 2.0b (up to 3840x2160@60Hz)", "Dual Link DVI-D (up to 2560x1600 @ 60Hz)". "Triple Display". [Zotac LP GDDR6]
- Included: "User Manual, Low Profile Bracket". [Zotac LP GDDR6]
- The ZOTAC GTX 1650 Low Profile **GDDR5** pages I opened (/product/... and /ca/...-0) returned only marketing text ("Low Profile ready", "packed with GDDR5 fast memory", "up to 3 displays") with no spec table. The /uk/ page errored.

**ASUS GTX1650-O4G-LP-BRK (GDDR5)**
- Bus standard: "PCI Express 3.0" (no lane count). [ASUS techspec]
- Dimensions: "7.2 x 2.7 x 1.6 inch" / "18.2 6.9 x 4.1 cm" (written like that on the page, with an "x" missing). [ASUS techspec]
- Slot: "2 Slot". Power connectors: "No". Recommended PSU: "300W". Power consumption: not stated. [ASUS techspec]
- Outputs: "Yes x 1 (Native DVI-D), Yes x 1 (Native HDMI 2.0b), Yes x 1 (Native DisplayPort 1.4)". Maximum display support "3". [ASUS techspec]
- Brackets: the Accessories row says only "Yes x 1", with no detail. The page doesn't say what "BRK" in the model name means. Bracket inclusion is unclear. [ASUS techspec]. The overview page says "At just 6.9cm wide, the ASUS GeForce® GTX 1650 Low Profile leaves plenty of space for cables". [ASUS overview]

Sources:
- [NVIDIA GTX 1650 legacy page] https://www.nvidia.com/content/nvidiaGDC/my/en_MY/geforce/graphics-cards/gtx-1650.html
- (no spec table) https://www.nvidia.com/en-gb/geforce/graphics-cards/gtx-1650/ and https://www.nvidia.com/en-us/geforce/graphics-cards/gtx-1650/
- [MSI 4GT LP] https://www.msi.com/Graphics-Card/GeForce-GTX-1650-4GT-LP/Specification
- [MSI 4GT LP OC] https://www.msi.com/Graphics-Card/GeForce-GTX-1650-4GT-LP-OC/Specification
- [MSI 4GT LP V1] https://www.msi.com/Graphics-Card/GeForce-GTX-1650-4GT-LP-V1/Specification
- [MSI 4GT LP V1 PDF] https://storage-asset.msi.com/datasheet/vga/global/GeForce-GTX-1650-4GT-LP-V1.pdf
- [Gigabyte GV-N1656OC-4GL] https://www.gigabyte.com/Graphics-Card/GV-N1656OC-4GL/sp
- [Gigabyte GV-N1650OC-4GL] https://www.gigabyte.com/Graphics-Card/GV-N1650OC-4GL/sp
- [Zotac LP GDDR6] https://www.zotac.com/fr/product/graphics_card/zotac-gaming-geforce-gtx-1650-low-profile-gddr6
- [ASUS techspec] https://www.asus.com/motherboards-components/graphics-cards/asus/gtx1650-o4g-lp-brk/techspec/
- [ASUS overview] https://www.asus.com/Graphics-Cards/GTX1650-O4G-LP-BRK
