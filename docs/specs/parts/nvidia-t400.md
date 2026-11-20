# NVIDIA T400

Part of the parts spec reference: [README.md](README.md) says how it was made and how far to trust each fact. Only a fact given as the maker's own words or figures, with its source and no mark against it, is settled.

## How the pages were read

How this was gathered (read before trusting a figure):
- Direct downloads (curl) to intel.com, nvidia.com and amd.com were refused by this session's network proxy (HTTP 403), so every page was read through a web-fetch tool that summarises the page with a small model. Text in quotes is what that tool returned as verbatim. I re-asked for the raw label and value wherever a figure mattered (power, connector, PSU, slot, length), but I could not check the quotes character by character against the page.
- Makers' own pages come first. Secondary sources are marked **(secondary)** and are used only where the maker says nothing.
- "not stated" means the maker's page doesn't give it. "(my arithmetic)" marks unit conversions I worked out. "(inference)" marks anything I'm reading into a page rather than reading off it.
- No eBay pages were opened.

## Nvidia T400

- One NVIDIA datasheet covers both "NVIDIA T400" ("2 GB GDDR6") and "NVIDIA T400 4GB" ("4 GB GDDR6"). Memory "64-bit", "Up to 80GB/s". CUDA cores "384". Copyright line "Nov21". [NVIDIA T400 datasheet]
- Max power: "Max Power Consumption: 30 W". [NVIDIA T400 datasheet]
- Form factor: "2.713 inches H x 6.137 inches L, single slot". [NVIDIA T400 datasheet]. 6.137 in ≈ 155.9 mm (my arithmetic).
  - NVIDIA's datasheet does **not** use the words "low profile" or "bracket". Its headings include "Full-Size Features. Compact Design." and "Power and Performance in a Small Form Factor". [NVIDIA T400 datasheet]
  - PNY T400 4GB: "2.713” H x 6.137” L, Low-Profile Single Slot". [PNY T400 4GB]
- PCIe: "PCI Express 3.0 x 16". [NVIDIA T400 datasheet]
  - PNY lists "PCI Express 3.0 x16" as the system interface. Its minimum system requirements say "PCI Express 4.0 x16 (preferred) expansion slot". That is quoted as written. PNY doesn't explain why it prefers a 4.0 slot for a 3.0 card. [PNY T400 4GB]
- Display outputs: "3 x mDP 1.4 with latching mechanism". "3x 3840 x 2160 @ 120Hz" and "3x 5120 x 2880 @ 60Hz". [NVIDIA T400 datasheet]
- Power connector: not stated by NVIDIA or PNY. **(secondary)** TechPowerUp: "does not require any additional power connector". [TPU T400]
- Thermal: "Active". [NVIDIA T400 datasheet]
- Package (PNY T400 4GB), under "PACKAGE CONTAINS": "NVIDIA T400 4GB professional graphics card", "Attached low-profile (SFF) bracket", "Unattached full-height (ATX) bracket". No display adapters are listed in the package. [PNY T400 4GB]
  - Adapters are separate accessories, not in the box: PNY lists HDMI adapter packs under "AVAILABLE ACCESSORIES", each with its own part number: "MDP-HDMI-FOUR-PCK" ("The four included DisplayPort to HDMI adapters...") and "MDP-HDMI-SINGLE-PCK" ("The included mini-DisplayPort to HDMI adapter..."). The word "included" there describes the adapters in each accessory pack, not the card's box. The four-pack's description gives its part number as "DP-HDMI FOUR-PCK", unlike its title; two separate fetches returned this, so it appears to be on the page. [PNY T400 4GB]
- I did not open PNY's 2 GB T400 page.

Sources:
- [NVIDIA T400 datasheet] https://www.NVIDIA.com/content/dam/en-zz/Solutions/design-visualization/productspage/quadro/quadro-desktop/nvidia-t400-datasheet-1987150-r3.pdf
- [PNY T400 4GB] https://www.pny.com/nvidia-t400-4gb
- [TPU T400] (secondary) https://techpowerup.com/gpu-specs/t400.c3808
