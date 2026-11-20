# AMD Radeon RX 6600 and RX 6600 XT

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

How this was gathered (read before trusting a figure):
- Direct downloads (curl) to intel.com, nvidia.com and amd.com were refused by this session's network proxy (HTTP 403), so every page was read through a web-fetch tool that summarises the page with a small model. Text in quotes is what that tool returned as verbatim. I re-asked for the raw label and value wherever a figure mattered (power, connector, PSU, slot, length), but I could not check the quotes character by character against the page.
- Makers' own pages come first. Secondary sources are marked **(secondary)** and are used only where the maker says nothing.
- "not stated" means the maker's page doesn't give it. "(my arithmetic)" marks unit conversions I worked out. "(inference)" marks anything I'm reading into a page rather than reading off it.
- No eBay pages were opened.

## AMD Radeon RX 6600 (and how the RX 6600 XT differs)

**AMD's RX 6600 product page**
- "Typical Board Power (Desktop): 132 W". AMD's product page has no "Total Board Power" label. [AMD RX 6600]. AMD's launch press release uses a column headed just "TBP" (not expanded) with "132W". [AMD RX 6600 PR]
- "Minimum PSU Recommendation: 450W". [AMD RX 6600]
- "Additional Power Connector: 1x8-Pin". [AMD RX 6600]
- Length and slots: not stated. The RX 6600 page has no Dimensions section. [AMD RX 6600]. The press release mentions no AMD reference card and says cards are "available from AMD board partners including ASRock, ASUS, Gigabyte, MSI, PowerColor, SAPPHIRE, XFX and Yeston." [AMD RX 6600 PR]
- PCIe interface: not stated on AMD's page or in the press release. [AMD RX 6600], [AMD RX 6600 PR]
- Display: "DisplayPort™: 1.4a". "HDMI™: HDMI™ 2.1 VRR and FRL". "USB Type-C: No". Number of ports and max displays: not stated. [AMD RX 6600]
- Other: Compute Units "28". Stream Processors "1792". Boost "Up to 2491 MHz". Game "2044 MHz". "8 GB" "GDDR6" "128-bit" "Up to 14 Gbps" "Up to 224 GB/s". Infinity Cache "32 MB". Launch "10/13/2021". [AMD RX 6600]
- AMD says nothing about the card in PCIe 3.0 boards.

**Partner RX 6600 cards (for PCIe lanes, ports and size)**
- MSI RX 6600 MECH 2X 8G: "PCI Express® 4.0 x8". "DisplayPort x 3 (v1.4)" and "HDMI™ x 1". Power consumption "132 W". "8-pin x 1". Recommended PSU "500 W or greater" (higher than AMD's 450 W minimum). "235 x 125 x 46 mm". Slot width: not stated. Max displays "4". [MSI RX 6600 MECH]
- Sapphire PULSE RX 6600: "PCI-Express 4.0 x8". "1x HDMI" and "3x DisplayPort" (the Lite SKU 11310-04-20G has "1x HDMI" and "1x DisplayPort"). "1 x 8-pin Power Connector." "140W (Board Power)" (higher than AMD's 132 W). "Minimum 500 Watt Power Supply". "193(L)X 120.05(W)X 40.05(H)mm". "2 slot, ATX". Requirement: "PCI Express® based PC is required with one X16 lane graphics slot available on the motherboard." [Sapphire PULSE RX 6600]

**RX 6600 XT (a different card)**
- AMD: "Typical Board Power (Desktop): 160 W". "Minimum PSU Recommendation: 500W". "Additional Power Connector: 1x8-Pin". Compute Units "32". Stream Processors "2048". Boost "Up to 2589 MHz". Game "2359 MHz". "8 GB" "GDDR6" "128-bit" "Up to 16 Gbps" "Up to 256 GB/s". Infinity Cache "32 MB". Launch "8/11/2021". DP "1.4a", HDMI "HDMI™ 2.1 VRR and FRL". No dimensions or PCIe interface listed. [AMD RX 6600 XT]
- AMD press release: TBP "Starting at 160 W". Available "from AMD board partners". [AMD RX 6600 XT PR]
- MSI RX 6600 XT MECH 2X 8G: "PCI Express® 4.0 x8". "160 W". "8-pin x 1". "500 W or greater". "235 x 125 x 46 mm". Slot width: not stated. DP x3 + HDMI x1. [MSI RX 6600 XT MECH]
- Sapphire PULSE RX 6600 XT: "PCI-Express 4.0 x8". "170W (Board Power)" (higher than AMD's 160 W "Typical Board Power (Desktop)" [AMD RX 6600 XT]. AMD's press release gives TBP as "Starting at 160 W" [AMD RX 6600 XT PR]). "1 x 8-pin". "Minimum 500 Watt Power Supply". "240(L)X 119.85(W)X 44.75(H)mm". "2.2 slot, ATX". "1x HDMI" "3x DisplayPort". [Sapphire PULSE RX 6600 XT]
- **How they differ, per AMD's pages:** XT has 32 CUs / 2048 SPs vs 28 / 1792, 160 W vs 132 W typical board power, 500 W vs 450 W minimum PSU, and 16 Gbps / 256 GB/s vs 14 Gbps / 224 GB/s memory. Both have 8 GB GDDR6 on 128-bit, 32 MB Infinity Cache and 1x 8-pin. [AMD RX 6600], [AMD RX 6600 XT]

Sources:
- [AMD RX 6600] https://www.amd.com/en/products/graphics/desktops/radeon/6000-series/amd-radeon-rx-6600.html
- [AMD RX 6600 PR] https://ir.amd.com/news-events/press-releases/detail/1023/amd-radeon-rx-6600-graphics-card-delivers-incredible
- [AMD RX 6600 XT] https://www.amd.com/en/products/graphics/desktops/radeon/6000-series/amd-radeon-rx-6600-xt.html
- [AMD RX 6600 XT PR] https://ir.amd.com/news-events/press-releases/detail/1015/amd-radeon-rx-6600-xt-graphics-card-sets-new-standard-for
- [MSI RX 6600 MECH] https://www.msi.com/Graphics-Card/Radeon-RX-6600-MECH-2X-8G/Specification
- [MSI RX 6600 XT MECH] https://www.msi.com/Graphics-Card/Radeon-RX-6600-XT-MECH-2X-8G/Specification
- [Sapphire PULSE RX 6600] https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-6600-8g-gddr6
- [Sapphire PULSE RX 6600 XT] https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-6600-xt-8g-gddr6
