# NVIDIA Quadro P620

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

How this was gathered (read before trusting a figure):
- Direct downloads (curl) to intel.com, nvidia.com and amd.com were refused by this session's network proxy (HTTP 403), so every page was read through a web-fetch tool that summarises the page with a small model. Text in quotes is what that tool returned as verbatim. I re-asked for the raw label and value wherever a figure mattered (power, connector, PSU, slot, length), but I could not check the quotes character by character against the page.
- Makers' own pages come first. Secondary sources are marked **(secondary)** and are used only where the maker says nothing.
- "not stated" means the maker's page doesn't give it. "(my arithmetic)" marks unit conversions I worked out. "(inference)" marks anything I'm reading into a page rather than reading off it.
- No eBay pages were opened.

## Nvidia Quadro P620

- Max power: "Max Power Consumption: 40 W". [NVIDIA P620 datasheet]
- Form factor and size: "2.713” H x 5.7” L, Single Slot, Low Profile". [NVIDIA P620 datasheet]. 2.713 in ≈ 68.9 mm and 5.7 in ≈ 144.8 mm (my arithmetic).
  - Disagreement: PNY gives "2.713” H × 5.906” L, Single Slot", about 150 mm long (my arithmetic). [PNY P620]
  - Gigabyte's P620 page matches NVIDIA: "2.713" H x 5.7" L, Single Slot, Low Profile". [Gigabyte P620]
  - **(secondary)** TechPowerUp: "The card measures 145 mm in length". [TPU P620]
- Datasheet text: "a flexible single-slot, lowprofile form factor makes it compatible with even the most space and power-constrained chassis." [NVIDIA P620 datasheet]
- PCIe: "PCI Express 3.0 x16". [NVIDIA P620 datasheet]
- Display outputs: "4x Mini DisplayPort 1.4". "4 direct, 4x DisplayPort 1.4 Multi-Stream". Max resolution "4x 4096x2160 @ 60 Hz" / "4x 5120x2880 @ 60Hz". Footnote: "VGA/DVI/HDMI support via adapter/connector/bracket". [NVIDIA P620 datasheet]
- Power connector: not stated by NVIDIA, PNY or Gigabyte. **(secondary)** TechPowerUp: "does not require any additional power connector". [TPU P620]
- Memory: "2 GB GDDR5", "128-bit", "Up to 80 GB/s". CUDA cores "512". Thermal "Active". [NVIDIA P620 datasheet]
- Brackets and box: NVIDIA's datasheet says nothing about brackets.
  - PNY package: "NVIDIA Quadro P620 professional graphics board with attached low-profile (SFF) bracket", "Unattached full-height (ATX) bracket", "Four mDP to DP adapters". [PNY P620]
  - Gigabyte accessories: "1x Quick Start Guide 1x Driver DVD 1x miniDP to DVI-D Cable 1x miniDP to DP Cable 1x Low Profile Bracket". [Gigabyte P620]
- Datasheet date: "FEB18". [NVIDIA P620 datasheet]

Sources:
- [NVIDIA P620 datasheet] https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/productspage/quadro/quadro-desktop/quadro-pascal-p620-data-sheet-a4-nv-704415-r1.pdf
- [PNY P620] https://www.pny.com/nvidia-quadro-p620
- [Gigabyte P620] https://www.gigabyte.com/ph/Professional-Graphics-Card/NVIDIA-QUADRO-P620/sp
- [TPU P620] (secondary) https://techpowerup.com/gpu-specs/quadro-p620.c3085
