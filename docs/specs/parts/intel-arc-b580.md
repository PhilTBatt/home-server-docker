# Intel Arc B580

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

How this was gathered (read before trusting a figure):
- Direct downloads (curl) to intel.com, nvidia.com and amd.com were refused by this session's network proxy (HTTP 403), so every page was read through a web-fetch tool that summarises the page with a small model. Text in quotes is what that tool returned as verbatim. I re-asked for the raw label and value wherever a figure mattered (power, connector, PSU, slot, length), but I could not check the quotes character by character against the page.
- Makers' own pages come first. Secondary sources are marked **(secondary)** and are used only where the maker says nothing.
- "not stated" means the maker's page doesn't give it. "(my arithmetic)" marks unit conversions I worked out. "(inference)" marks anything I'm reading into a page rather than reading off it.
- No eBay pages were opened.

## Intel Arc B580

**Intel's spec page**
- TBP: "190 W". [Intel B580 spec]
- PCIe: "PCI Express Configurations ‡: PCI Express 4.0 x8". Footnote ‡: "This feature may not be available on all computing systems." [Intel B580 spec]
- Section "Intel Reference Card Attributes": "Power Connectors: 1 x 8-pin". "Minimum Power Supply Unit: 600 W". "Dimensions (Length x Width): 272 x 115 mm". "Slots: 2". [Intel B580 spec]
  - The page never uses the words "Limited Edition". Intel sells its own card as the "Intel Arc B580 Limited Edition", and Intel's quick start guide names that card in its "What's in the box" section, so these reference-card rows presumably describe it (inference). [Intel B580 spec], [Intel Arc quick start]
  - Disagreement on length, **(secondary)**: TechPowerUp's review measured the Limited Edition at "28.0 x 11.5 cm", against Intel's 272 x 115 mm. Same review: "Installation requires two slots", "We measured the card's width to be 45 mm", and "The card uses a single 8-pin connector, plus PCIe slot power, allowing a maximum power draw of 225 W." [TPU B580 review]
  - TPU's 45 mm "width" and Intel's 115 mm "Width" measure different things, so they aren't a disagreement: TPU gives both "11.5 cm" and "45 mm" for the same card, and it's TPU's 11.5 cm that lines up with Intel's 115 mm (inference from TPU giving both figures). Neither page says which axis the 45 mm is: TPU's page doesn't use the word "thickness" and doesn't label the 11.5 cm figure, and Intel gives only "Dimensions (Length x Width): 272 x 115 mm", with no thickness or height. [TPU B580 review], [Intel B580 spec]
- Display: "# of Displays Supported: 4". "Graphics Output: HDMI* 2.1, DP2.1 up to UHBR 13.5, DP2.1 up to UHBR 10". Max resolution HDMI "7680 x 4320@120Hz", DP "7680 x 4320@60Hz". Intel's page doesn't give the number of physical ports on its card. [Intel B580 spec]. **(secondary)** TechPowerUp: "Display connectivity includes three standard DisplayPort 2.1 and one HDMI 2.1a." [TPU B580 review]
- Other: Launch "Q4'24". Xe-cores "20". Graphics clock "2670 MHz". "12 GB GDDR6", "192 bit", "456 GB/s", "19 Gbps". Device ID "0xE20B". [Intel B580 spec]
- Intel's B-Series requirements (quick start guide):
  - Power: "600 W power rating minimum with a PCIe 8-pin cable." This is in the B-Series section and doesn't name a specific card. [Intel Arc quick start]
  - Slot: "Full-size PCI Express 3.0 (or newer) x16 slot". [Intel Arc quick start]
  - The guide has no sentence about performance in a PCIe 3.0 slot. Its only lane note is that a Ryzen 8500G pairing "will have reduced performance due to the CPU only supporting 4 lanes of PCIe Gen 4." [Intel Arc quick start]

**Intel on Resizable BAR (for Arc A-Series and B-Series)**
- B-Series: "Resizable BAR must be enabled for optimal performance in all applications using Intel® Arc™ B-Series Graphics." The guide also says "Resizable BAR or Smart Access Memory must be enabled", and its B-Series slot requirement line is "Resizable (Re-Size) BAR enabled". [Intel Arc quick start]
- BIOS: "Compatibility Support Module (CSM) or Legacy Mode must be disabled, and UEFI boot mode must be Enabled." Set "Above 4G Decoding" and "Re-Size BAR Support" to "Enabled (or Auto if the Enabled option is not present)". (Exact lead-in sentences: B-Series "Ensure the following settings are set to Enabled (or Auto if the Enabled option is not present):"; A-Series "Ensure you have set the following settings to Enabled (or Auto if the Enabled option is not present):".) The OS should use "UEFI boot mode & GPT partition style." [Intel Arc quick start]
- Platforms Intel lists for B-Series (B-Series table; applies to B-Series cards such as the B580, not to the A310. The separate A-Series table is in the Arc A310 section above): Core Ultra with "Intel 800 Series motherboard with Resizable BAR support enabled". 12th to 14th Gen Core with "Intel 700/600 Series motherboard with Resizable BAR support enabled". 10th and 11th Gen with Intel 500 or 400 Series boards, plus "Support for resizable BAR on 10th Gen platforms will vary." Ryzen 7000/8000/9000 with "AMD 600 Series motherboard with Smart Access Memory enabled". Ryzen 5000 and "Most AMD Ryzen™ 3000 series Processors (excludes AMD 3000G-series Processors)" with "AMD 500 Series motherboard with Smart Access Memory enabled". "Refer to your system manufacturer's support page to confirm Resizable BAR support." [Intel Arc quick start]
- A-Series only: Intel's article "Do You Need a Resizable BAR to Use Intel® Arc™ A-Series Graphics?" says it "must be enabled for optimal performance when using Intel® Arc™ A-Series Graphics" and that "Intel® Arc™ Graphics can still work on a system without Resizable BAR enabled." Last reviewed "12/03/2024". It doesn't mention B-Series. [Intel ReBAR A-Series article]
- A-Series only: Intel's DSA message article says "Resizable BAR is required for optimal performance with Intel® Arc™ A-Series Graphics". Last reviewed "12/20/2024". (B-Series appears only in the page's related-products list: "Intel® Arc™ B-Series Graphics", "Intel® Arc™ B570 Graphics", "Intel® Arc™ B580 Graphics".) [Intel DSA ReBAR article]
- **Summary of Intel's wording:** Intel says Resizable BAR "must be enabled for optimal performance". It doesn't say the card won't run without it. The explicit "can still work ... without Resizable BAR" sentence I found is in an A-Series article. I found no equivalent sentence for B-Series.
- Fetch note: two reads of the quick start guide returned different "Last Reviewed" dates: "12/02/2025" (graphics.html URL) and "06/04/2025" (via intel.com/arcquickstart). I can't tell which is current.

Sources:
- [Intel B580 spec] https://www.intel.com/content/www/us/en/products/sku/241598/intel-arc-b580-graphics/specifications.html
- [Intel Arc quick start] https://www.intel.com/content/www/us/en/support/articles/000091128/graphics.html (also https://intel.com/arcquickstart)
- [Intel ReBAR A-Series article] https://intel.com/content/www/us/en/support/articles/000092416/graphics.html
- [Intel DSA ReBAR article] https://www.intel.com/content/www/us/en/support/articles/000090863.html
- [TPU B580 review] (secondary) https://techpowerup.com/review/intel-arc-b580/3.html
