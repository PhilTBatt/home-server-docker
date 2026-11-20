# Intel Arc A310

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

How this was gathered (read before trusting a figure):
- Direct downloads (curl) to intel.com, nvidia.com and amd.com were refused by this session's network proxy (HTTP 403), so every page was read through a web-fetch tool that summarises the page with a small model. Text in quotes is what that tool returned as verbatim. I re-asked for the raw label and value wherever a figure mattered (power, connector, PSU, slot, length), but I could not check the quotes character by character against the page.
- Makers' own pages come first. Secondary sources are marked **(secondary)** and are used only where the maker says nothing.
- "not stated" means the maker's page doesn't give it. "(my arithmetic)" marks unit conversions I worked out. "(inference)" marks anything I'm reading into a page rather than reading off it.
- No eBay pages were opened.

## Intel Arc A310

**Intel's own spec (Intel's A310 page has no "Intel Reference Card Attributes" section and doesn't say whether Intel makes an A310 card itself)**
- Launch: "Q3'22". Device ID "0x56A6". [Intel A310 spec]
- TBP: "75 W". The same page has rows labelled "- LP", without saying what LP stands for (no tooltip, footnote or glossary entry): "Graphics Clock - LP: 1000 MHz" and "TBP - LP: 40W - 75W". [Intel A310 spec]
- PCIe: "Up to PCI Express 4.0 x8 (x16 slot required)". [Intel A310 spec]
- Memory: "4 GB" "GDDR6", "64 bit", "124 GB/s". [Intel A310 spec]
- Display: "# of Displays Supported: 4". "Graphics Output: eDP* 1.4, DP 2.0 up to UHBR 10**, HDMI* 2.1, HDMI* 2.0b". Max resolution HDMI "4096 x 2160@60Hz", DP "7680 x 4320@60Hz". Intel's page lists output standards and a display count, not physical ports: it doesn't say how many or which connectors a card has. [Intel A310 spec]. Which ports a card has depends on the partner card (inference, not stated by the maker). The partner cards below have "2x Mini DisplayPort" + "1x HDMI 2.0b" [Sparkle spec sheet PDF] and "1 x HDMI™ 2.0b" + "1 x DisplayPort™ 2.0 with DSC" [ASRock A310 LP].
- Power connector, recommended PSU, card dimensions, form factor: not stated on Intel's A310 page. [Intel A310 spec]
- Intel's general Arc desktop requirements (A-Series section of Intel's Arc quick start guide):
  - How this applies to the A310: the guide never names the A310 (no "A310" anywhere on the page), and its "This article applies to 7 products" list names the A770 (16GB and 8GB), A750, A580, A380, B570 and B580, not the A310. Intel's A310 spec page lists the A310's "Product Collection" as "Intel® Arc™ A-Series Graphics", and this block comes from the guide's section headed "Intel® Arc™ A-Series Graphics – Desktop Quick Start Guide", so it applies to the A310 (inference, not stated by the maker). [Intel Arc quick start], [Intel A310 spec]
  - "Full-size PCI Express 3.0 (or newer) x16 slot". [Intel Arc quick start]
  - "Resizable BAR or Smart Access Memory must be enabled for optimal performance in all applications". [Intel Arc quick start]
  - "Compatibility Support Module (CSM) or Legacy Mode must be disabled, and UEFI boot mode must be Enabled." [Intel Arc quick start]
  - On power for A-Series in general: "Power supply requirements may vary; check the manufacturer for specific details." [Intel Arc quick start]
    - The A-Series "Power Supply Requirements" part then has a sub-label "Intel® Arc™ A770 Limited Edition and A750 Limited Edition Graphics:" with the line "Minimum 600W power supply with two PCIe power connectors – 1x8-pin & 1x6-pin". That 600 W / 8-pin + 6-pin line is for the A770 and A750 Limited Edition cards only. Intel names no other card for it and gives no A310-specific PSU figure, so don't apply it to an A310. [Intel Arc quick start]
  - **A-Series supported platforms (A-Series table; for A-Series cards, and so for the A310 by the inference above. This is not the B-Series table, which is in the Arc B580 section and applies to B-Series cards such as the B580.)** Heading "Supported Hardware Configurations", columns "CPU" and "Motherboard". Quoted as the fetch tool returned them; the trailing "1" is the footnote marker as the tool gave it. [Intel Arc quick start]
    - "14th Gen Intel® Core™ Processors", "13th Gen Intel® Core™ Processors" and "12th Gen Intel® Core™ Processors" → "Intel 700/600 Series motherboard with Resizable BAR support enabled"
    - "11th Gen Intel® Core™ Processors" and "10th Gen Intel® Core™ Processors" → "Intel 500 Series motherboard with Resizable BAR support enabled1" and "Intel 400 Series motherboard with Resizable BAR support enabled1" (the tool returned the 400 Series cell in two pieces, joined here)
    - "AMD Ryzen™ 8000 Series Processors" and "AMD Ryzen™ 7000 Series Processors" → "AMD 600 Series motherboard with Smart Access Memory enabled"
    - "AMD Ryzen™ 5000 Series Processors" and "Most AMD Ryzen™ 3000 series Processors (excludes AMD 3000G-series Processors)" → "AMD 500 Series motherboard with Smart Access Memory enabled"
    - Footnote 1: "Refer to your system manufacturer's support page to confirm Resizable BAR support."
    - The A-Series table has no Intel Core Ultra, Intel 800 Series or AMD Ryzen 9000 rows (the B-Series table has them).
    - Platforms not in the table, same section: "Additional platforms/motherboards not listed below and with Resizable BAR / Smart Access Memory enabled" "may also support Intel® Arc™ A-Series graphics." (the tool returned this sentence in two pieces). A-Series FAQ, "What should I do if my system configuration is not listed?": "For configurations not listed in this guide, there may be performance or stability issues." and "We recommend updating to one of the configurations listed for optimal performance with Intel® Arc™ Graphics."
  - For more on Resizable BAR, see the Arc B580 section below.
- Power connector, **(secondary)**: TechPowerUp's A310 entry says "does not require any additional power connector". The same TPU page says "its power draw is rated at 30 W maximum", which disagrees with Intel's 75 W TBP, so treat TPU's A310 entry with caution. [TPU A310]

**Sparkle Intel Arc A310 ECO (SA310C-4G)**
- PCIe: "PCI Express Configurations: PCI Express 4.0 x8". [Sparkle spec sheet PDF]
- Dimensions: "Dimension: 156 x 69 x 15mm". The PDF doesn't label which number is length, height or thickness. [Sparkle spec sheet PDF]. **(secondary)**: TechPowerUp's board entry labels them Length "156 mm", Width "69 mm", Height "15 mm", and gives Slot Width "Single-slot". [TPU Sparkle A310 ECO]
- Slot width: "Width: 1 Slots". [Sparkle spec sheet PDF]. Sparkle's press release: "a low-profile, single-slot, single-fan configuration". [Sparkle press release]
- Board power: "TBP: 50 Watt". [Sparkle spec sheet PDF]. Press release: Sparkle "successfully reduced the TBP of the Intel® Arc™ A310 GPU from 75W to 50W". [Sparkle press release]
- Power connector: not stated by Sparkle (neither the spec sheet nor the press release). **(secondary)**: TechPowerUp's board entry lists "Power Connectors: None". [TPU Sparkle A310 ECO]
- Recommended PSU: "350 Watt or greater power supply." [Sparkle spec sheet PDF]. **(secondary)**: TPU says "Suggested PSU: 250 W", which disagrees with Sparkle. [TPU Sparkle A310 ECO]
- Bracket: "Short bracket is included". [Sparkle spec sheet PDF]. Press release: "an additional short bracket free-of-charge". [Sparkle press release]
- Display outputs: "2x Mini DisplayPort (Max): 7680 x 4320@60Hz" and "1x HDMI 2.0b (Max): 4096 x 2160@60Hz". [Sparkle spec sheet PDF]
- System requirement: "PCI Express 3.0, 4.0 or 5.0 compliant motherboard with one graphics slot." [Sparkle spec sheet PDF]
- Clock: "Graphics Clock: 1000 MHz" (this matches Intel's "Graphics Clock - LP"). [Sparkle spec sheet PDF]
- **(secondary)** ServeTheHome: "From a PCIe standpoint, this is a PCIe Gen4 x8 card, albeit in an x16 connector." [STH quick look]

**ASRock Intel Arc A310 Low Profile 4GB**
- PCIe: "PCI® Express 4.0 x8". [ASRock A310 LP]
- Dimensions and slots: "169 x 69 x 39 mm, 2-slot". [ASRock A310 LP]
- Low profile: the page's meta description says "Low profile design with dual fan 0dB silent cooling." and the body says "The 169 x 69 x 39 mm graphics card can fit into any slim or small form factor." [ASRock A310 LP]
- Power connector: not stated by ASRock (the page has no "power connector", "6-pin", "8-pin" or "TBP" text). **(secondary)**: TechPowerUp news, citing ASRock via VideoCardz: "it does not need any power connectors as its Total Board Power (TBP) is set at 75 W." [TPU ASRock news]
- Board power: not stated by ASRock. Secondary: 75 W TBP (TPU news above). Tom's Hardware **(secondary)**: "consumes 75W maximum". [Tom's ASRock]
- Recommended PSU: "450W". [ASRock A310 LP]
- Brackets: the Accessories list is "1 x Quick Installation Guide" and "1 x Full Height Bracket". The page doesn't say which bracket is fitted when it ships. (inference: a full-height bracket in the box suggests a low-profile bracket is fitted, but ASRock doesn't say so.) [ASRock A310 LP]
- Display outputs: "1 x HDMI™ 2.0b" and "1 x DisplayPort™ 2.0 with DSC". "Multi-view: 2". [ASRock A310 LP]
- Clock: "Base Clock: 2000 MHz". [ASRock A310 LP]
- Fetch note: `.../index.asp` and `.../index.us.asp` failed to fetch. The folder URL without `index.asp` worked.

Sources:
- [Intel A310 spec] https://www.intel.com/content/www/us/en/products/sku/227958/intel-arc-a310-graphics/specifications.html
- [Intel Arc quick start] https://www.intel.com/content/www/us/en/support/articles/000091128/graphics.html (also reached via https://intel.com/arcquickstart)
- [Sparkle spec sheet PDF] https://www.sparkle.com.tw/files/20240202113531413.pdf
- [Sparkle press release] https://www.sparkle.com.tw/en/media-center/view/130954BF6CC1
- [ASRock A310 LP] https://www.asrock.com/Graphics-Card/Intel/Intel Arc A310 Low Profile 4GB/
- [TPU A310] (secondary) https://techpowerup.com/gpu-specs/arc-a310.c3930
- [TPU Sparkle A310 ECO] (secondary) https://techpowerup.com/gpu-specs/sparkle-arc-a310-eco.b11758
- [TPU ASRock news] (secondary) https://techpowerup.com/313629/asrock-launches-low-profile-arc-a310-graphics-card
- [Tom's ASRock] (secondary) https://www.tomshardware.com/news/asrocks-latest-arc-a310-gpu-is-low-profile-for-sff-systems
- [STH quick look] (secondary) https://www.servethehome.com/sparkle-intel-arc-a310-eco-4gb-low-profile-pcie-gpu-quick-look/
