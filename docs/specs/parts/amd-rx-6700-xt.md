# AMD Radeon RX 6700 XT and RX 6700

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

How this was gathered (read before trusting a figure):
- Direct downloads (curl) to intel.com, nvidia.com and amd.com were refused by this session's network proxy (HTTP 403), so every page was read through a web-fetch tool that summarises the page with a small model. Text in quotes is what that tool returned as verbatim. I re-asked for the raw label and value wherever a figure mattered (power, connector, PSU, slot, length), but I could not check the quotes character by character against the page.
- Makers' own pages come first. Secondary sources are marked **(secondary)** and are used only where the maker says nothing.
- "not stated" means the maker's page doesn't give it. "(my arithmetic)" marks unit conversions I worked out. "(inference)" marks anything I'm reading into a page rather than reading off it.
- No eBay pages were opened.

## AMD Radeon RX 6700 XT (and how the RX 6700 10GB differs)

**AMD's RX 6700 XT product page**
- "Typical Board Power (Desktop): 230 W". No "Total Board Power" label on the page. [AMD RX 6700 XT]
- "Minimum PSU Recommendation: 650W". [AMD RX 6700 XT]
- "Additional Power Connector: 1x8-Pin + 1x6-Pin". [AMD RX 6700 XT]
- Dimensions section: "Length: 267 mm", "Slots: 2". [AMD RX 6700 XT]
- PCIe interface: not stated. [AMD RX 6700 XT]
- Display: DP "1.4a". HDMI "4K120Hz/8K60Hz VRR as specified in HDMI 2.1". Number of ports: not stated. [AMD RX 6700 XT]
- Other: Compute Units "40". Stream Processors "2560". Base "2321 MHz". Boost "Up to 2581 MHz". Game "2424 MHz". "12 GB" "GDDR6" "192-bit" "Up to 16 Gbps" "Up to 384 GB/s". Infinity Cache "96 MB". Launch "3/1/2021". [AMD RX 6700 XT]
- AMD's RX 6700 XT quick start guide: "PC with at least one PCI-Express x16 graphics slot available on the motherboard." (no PCIe version given). "Minimum 650W system power supply". Outputs "DisplayPort® 1.4a" and "HDMI® 2.1". "Only up to three (3) passive adapter cables may be used." No dimensions. Nothing about Smart Access Memory or PCIe 3.0. [AMD RX 6700 XT QSG]

**Partner RX 6700 XT cards**
- MSI Radeon RX 6700 XT 12G: Interface "PCI Express 4.0" (no lane count). Outputs "DisplayPort x 3 (v1.4)" and "HDMI™ x 1". "230 W". "8pin x 1 / 6-pin x 1". Recommended PSU "650 W". "266.7 x 110.15 x 39.75 mm". Slot width: not stated. Max displays "4". The page doesn't say this is AMD's reference design. [MSI RX 6700 XT 12G]
- Sapphire PULSE RX 6700 XT: "PCI-Express 4.0 x16". "1x HDMI" "3x DisplayPort". "1 x 8-pin + 1 x 6-pin Power Connector." "230W (Board Power)". "Minimum 650 Watt Power Supply". The page lists three SKUs (11306-02-20G, 11306-05-20G, 11306-09-20G) and three spec blocks, without saying which block is which SKU. Two blocks give "260(L)X 119.85(W)X 49(H)mm" / "2.2 slot, ATX"; one gives "280(L)X 122.75(W)X 50.47(H)mm" / "2.7 slot, ATX". The blocks appear in the same order as the SKU list, but the page doesn't link them, so matching a size to a part number by order would be inference, not stated by the maker. A used "PULSE RX 6700 XT" may be either size, and this page alone can't say which. [Sapphire PULSE RX 6700 XT]

**RX 6700 (10GB, a different card)**
- AMD: "Typical Board Power (Desktop): 175 W". "Minimum PSU Recommendation: 600W". "Additional Power Connector: 1x8-Pin". Dimensions section "Length: 267 mm", "Slots: 2". Compute Units "36". Base "1941 MHz". Boost "Up to 2450 MHz". Game "2174 MHz". "10 GB" "GDDR6" "160-bit". Memory speed "Up to 16 Gbps / Up to 14 Gbps". "Up to 320 GB/s". Infinity Cache "80 MB". Launch "6/9/2021". DP "1.4a", HDMI "4K120Hz/8K60Hz VRR as specified in HDMI 2.1". PCIe interface not stated. AMD's page doesn't say whether the 267 mm / 2-slot figures describe a particular board. [AMD RX 6700]
- Sapphire PULSE RX 6700 10GB: "PCI-Express 4.0 x16". Stream processors "2304". "1x HDMI" "3x DisplayPort", "Maximum 4 Displays". "1 x 8-pin Power Connector." "220W (Board Power)". "Minimum 650 Watt Power Supply". "260(L)X 119.85(W)X 49(H)mm". "2.2 slot, ATX". [Sapphire PULSE RX 6700]
- Sapphire RX 6700 10GB (11321-03): "PCI-Express 4.0 x16". "220W (Board Power)". "Minimum 650 Watt Power Supply". "242(L)X 119.85(W)X 41(H)mm". "2 slot, ATX". 1x HDMI + 3x DP. [Sapphire RX 6700 11321-03]
- **Disagreement:** AMD gives the RX 6700 a 600 W minimum PSU and 175 W typical board power. Sapphire's RX 6700 cards say 650 W minimum and 220 W board power.
- **How they differ, per AMD's pages:** RX 6700 has 36 CUs vs 40, 10 GB on 160-bit vs 12 GB on 192-bit, 80 MB vs 96 MB Infinity Cache, 175 W vs 230 W typical board power, 600 W vs 650 W minimum PSU, and 1x 8-pin vs 1x 8-pin + 1x 6-pin. AMD lists the same 267 mm / 2-slot dimensions for both. [AMD RX 6700], [AMD RX 6700 XT]
- AMD says nothing about the 6700 XT or 6700 in PCIe 3.0 boards.

Sources:
- [AMD RX 6700 XT] https://www.amd.com/en/products/graphics/desktops/radeon/6000-series/amd-radeon-rx-6700-xt.html
- [AMD RX 6700 XT QSG] https://www.amd.com/content/dam/amd/en/documents/radeon-tech-docs/user-guides/quick-start-guide-amd-radeon-rx6700xt.pdf
- [AMD RX 6700] https://www.amd.com/en/products/graphics/desktops/radeon/6000-series/amd-radeon-rx-6700.html
- [MSI RX 6700 XT 12G] https://www.msi.com/Graphics-Card/Radeon-RX-6700-XT-12G/Specification
- [Sapphire PULSE RX 6700 XT] https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-6700-xt-12g-gddr6
- [Sapphire PULSE RX 6700] https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-6700-10g-gddr6
- [Sapphire RX 6700 11321-03] https://www.sapphiretech.com/en/consumer/11321-03-radeon-rx-6700-10g-gddr6
