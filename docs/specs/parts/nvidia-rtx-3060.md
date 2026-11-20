# NVIDIA GeForce RTX 3060

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

How this was gathered (read before trusting a figure):
- Direct downloads (curl) to intel.com, nvidia.com and amd.com were refused by this session's network proxy (HTTP 403), so every page was read through a web-fetch tool that summarises the page with a small model. Text in quotes is what that tool returned as verbatim. I re-asked for the raw label and value wherever a figure mattered (power, connector, PSU, slot, length), but I could not check the quotes character by character against the page.
- Makers' own pages come first. Secondary sources are marked **(secondary)** and are used only where the maker says nothing.
- "not stated" means the maker's page doesn't give it. "(my arithmetic)" marks unit conversions I worked out. "(inference)" marks anything I'm reading into a page rather than reading off it.
- No eBay pages were opened.

## Nvidia GeForce RTX 3060 12GB (with RTX 3060 8GB and RTX 3060 Ti)

**NVIDIA's spec table.** One table covers "RTX 3060 Ti" and "RTX 3060". The page's general note says the specs are for the "Founders Edition or reference graphics card design". [NVIDIA 3060 page]
- RTX 3060 memory: "12 GB GDDR6 / 8 GB GDDR6" with "192-bit / 128-bit", so NVIDIA lists the 8 GB version as a 3060 with a narrower 128-bit bus. [NVIDIA 3060 page]
- RTX 3060 CUDA cores "3584". Boost "1.78" GHz. Base "1.32" GHz. [NVIDIA 3060 page]
- RTX 3060 Graphics Card Power (W): "170". Only one value is given, covering both memory versions. [NVIDIA 3060 page]
- RTX 3060 Required System Power (W): "550". Footnote: "Requirement is made based on PC configured with an Intel Core i9-10900K processor." and "A lower power rating may work depending on system configuration." [NVIDIA 3060 page]
- RTX 3060 Supplementary Power Connectors: **blank**. The value appears only under the 3060 Ti column. [NVIDIA 3060 page]
- RTX 3060 card dimensions (length, width, slot): **blank**. Values appear only under the 3060 Ti. NVIDIA's page describes no RTX 3060 (non-Ti) Founders Edition. [NVIDIA 3060 page]
- PCIe: "PCI Express Gen 4: Yes" for both cards. No lane count is given. "Resizable BAR: Yes" for both. [NVIDIA 3060 page]
- Display: "Standard Display Connectors: HDMI(2), 3x DisplayPort(3)". The (2) and (3) look like footnote markers (footnote 2 is the HDMI 2.1 note, footnote 3 is "DisplayPort 1.4a"), so this reads as HDMI plus 3x DisplayPort. Multi Monitor "4". Max digital resolution "7680x4320". [NVIDIA 3060 page]

**RTX 3060 Ti (a different card)**: CUDA "4864". "8 GB GDDR6 / 8 GB GDDR6X", "256-bit". Graphics Card Power "200" W. Required System Power "600" W. Supplementary power "1x PCIe 8-pin (adapter to 1x 12-pin included)". Length "9.5" (242 mm)", Width "4.4" (112 mm)", Slot "2-Slot". [NVIDIA 3060 page]

**Partner cards (to fill the gaps in NVIDIA's RTX 3060 column)**
- MSI RTX 3060 VENTUS 2X 12G OC: Interface "PCI Express® Gen 4". "12GB GDDR6", "192-bit". Power consumption "170W". Power connectors "8-pin x 1". Recommended PSU "550W". "235 x 124 x 42 mm". Slot width: not stated. Outputs "DisplayPort x 3 (v1.4) / HDMI™ x 1". Max displays "4". [MSI 3060 12G]
- MSI RTX 3060 VENTUS 2X 8G OC: "8GB GDDR6", "128-bit". "170 W". "8-pin x 1". "550 W". "235 x 124 x 42 mm". Slot width: not stated. Outputs "DisplayPort x 3 (v1.4a) / HDMI™ x 1". [MSI 3060 8G]
- Gigabyte RTX 3060 EAGLE OC 12G (rev 2.0): Card bus "PCI-E 4.0 x 16" (the only page here giving a 3060 lane count). "L=242 W=124 H=41 mm". Slot width: not stated. "550W". "8 pin*1". Output "DisplayPort 1.4a *2 HDMI 2.1 *2". [Gigabyte 3060 EAGLE]

Sources:
- [NVIDIA 3060 page] https://www.nvidia.com/en-gb/geforce/graphics-cards/30-series/rtx-3060-3060ti/
- [MSI 3060 12G] https://www.msi.com/Graphics-Card/GeForce-RTX-3060-VENTUS-2X-12G-OC/Specification
- [MSI 3060 8G] https://www.msi.com/Graphics-Card/GeForce-RTX-3060-VENTUS-2X-8G-OC/Specification
- [Gigabyte 3060 EAGLE] https://www.gigabyte.com/Graphics-Card/GV-N3060EAGLE-OC-12GD-rev-20/sp
