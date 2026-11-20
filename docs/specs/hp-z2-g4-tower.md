# HP Z2 G4 (Tower)

- **Form factors under this name:** Z2 Tower G4 and Z2 SFF G4, which have separate QuickSpecs. There is also a Z2 Mini G4 (from memory, unchecked; not researched). **This file is the Tower.**
- **CPU:**
  - "Intel® C246 chipset", "Single LGA-1151" ([QS-T]).
  - Families: Xeon E-2100, 9th-gen Core i3/i5/i7/i9, 8th-gen Core i3/i5/i7 and Pentium G5400. No Celeron ([QS-T]).
  - Highest TDP listed is 95 W (Core i9/i7/i5). No Xeon row in this table exceeds 80 W ([QS-T]).
  - **Two HP documents disagree on Xeon wattage:** this Tower QuickSpecs (v13) gives the E-2286G as 80 W, while the Z2 SFF G4 QuickSpecs (v17) gives it as 95 W ([QS-S](#z2sff-sources)). This table's wattage column also shows 95 W for the i3-9100, which suggests the column may not be the CPU's own TDP (inference, not stated). Don't treat 80 W as a Xeon limit without a second source.
  - This version (Sept 2019) also lists E-22xx parts: the processor table has the E-2286G, E-2278G, E-2276G, E-2274G, E-2244G, E-2236, E-2226G and E-2224G alongside the E-21xx parts, all under the heading "Intel® Xeon® processor E-2100 family" ([QS-T]) (corrected on a second check, 2026-11-20). The later SFF QuickSpecs (2023) lists E-2200 parts too.
- **Memory:**
  - DDR4 unbuffered (UDIMM), ECC or non-ECC. 4 slots, 128 GB max, largest DIMM listed 32 GB ([QS-T]).
  - DDR4-2666. "The CPUs determine the speed at which the memory is clocked". The i3-8100 and Pentium G5400 are listed at 2400 MT/s ([QS-T]).
  - ECC with Xeon E, i3 and Pentium. "Intel® Core i5/i7 processors only support non-ECC memory". ECC and non-ECC cannot be mixed. At least one DIMM per channel is needed for full performance ([QS-T]).
- **Built-in graphics:**
  - "Integrated Intel® UHD graphics P630 is supported on the select Intel® Xeon E processors" ([QS-T]).
  - The Xeon table shows "N/A" for integrated graphics on the E-2136 (and E-2236), so those have no iGPU. The doc does not say a card is required, but there is nothing else to drive a display.
  - Core: UHD 630. Pentium: UHD 610.
  - "Flex IO DisplayPort Alt Mode doesn't work if the CPU lacks integrated graphics" (paraphrase) ([QS-T]).
- **Expansion slots:**
  - All full-height, full-length ([QS-T]):
    - PCIe Gen3 x16 mechanical / x16 electrical.
    - Two PCIe Gen3 x4 mechanical / x1 electrical.
    - One PCIe Gen3 x16 mechanical / x4 electrical.
  - Graphics PSU rules: the footnote "Requires 500W PSU. Not supported with 250W PSU." marks the WX 7100, P4000, P5000, RTX 4000 and RTX 5000 ([QS-T]) (corrected on a second check, 2026-11-20). The RTX 6000 is marked "Requires 650W. Not supported with 250W or 500W PSU" ([QS-T]).
  - Card aux power: P4000 uses one 6-pin; RTX 4000/5000/6000 one 8-pin each. The number of PSU-side PCIe cables is not described ([QS-T]).
  - No chassis card-length limit is stated (P4000 9.5", RTX 5000 10.5" are listed). No total graphics power budget is stated ([QS-T]).
- **Storage:**
  - Two M.2 storage slots, "PCIe Gen3 x4", "up to 110mm". One M.2 WLAN slot, "PCIe Gen3 x1 plus Intel CNVi" ([QS-T]). M.2 SATA support: not stated.
  - Bays: two external half-height 5.25" and two internal 3.5". No 2.5" bay is listed ([QS-T]).
  - SATA: 4 integrated 6 Gb/s ports, one optionally eSATA ([QS-T]).
  - RAID 0/1/5/10 via Intel RST on Windows. "SATA hardware RAID isn't supported on Linux" (paraphrase) ([QS-T]).
- **Power supply:** 250 W (92 %), 500 W (90 %) and 650 W (90 %), all wide-ranging with active PFC ([QS-T]). Proprietary connector: not stated.
- **Networking:**
  - Intel I219LM GbE (vPro, AMT 12.0). "If AMT is provisioned, LAN teaming isn't possible" (paraphrase) ([QS-T]).
  - Factory Wi-Fi: Intel 9560 + BT5 on M.2 (CNVi slot) ([QS-T]).
  - M.2 key: not stated.
- **Upgrade trip-ups the docs state:**
  - Core i5/i7 run non-ECC only, and ECC cannot be mixed with non-ECC.
  - Non-iGPU Xeons have no display output of their own (inference, not stated).
  - Bigger Quadro cards need the 500 W or 650 W PSU.
  - The Wi-Fi slot is a CNVi slot (CNVi cards need a CNVi-capable platform; from memory, unchecked).

<a id="z2twr-sources"></a>Sources:
- [QS-T] HP QuickSpecs "HP Z2 Tower G4 Workstation", footer "c05987463 —DA 16215 – Worldwide — Version 13 — September 1, 2019". Mirror: https://www.rackfinity.com/content/Z2G4TWR-QuickSpecs.pdf. The extraction was truncated around page 55 (SD reader section), but every section used above had already appeared.

Second check, 2026-11-20: 22 facts checked against the cited pages; 2 corrected; 1 couldn't be checked.
