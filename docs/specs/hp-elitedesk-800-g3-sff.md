# HP EliteDesk 800 G3 SFF

- **Form factors under this name:** the EliteDesk 800 G3 came as Tower, Small Form Factor and Desktop Mini, and the EliteOne 800 G3 is the all-in-one. All of these are in one QuickSpecs ([QS](#800g3-sources)). **The facts below are for the SFF.**
- **CPU:**
  - Chipset "Intel® Q270" ([QS], [DS]).
  - "Processor support up to 65W on SFF, DM and AiO; up to 91W on the 800 G3 TWR" ([QS]). So the 91 W i7-7700K is a Tower-only part (inference from that line).
  - Families: 6th-gen and 7th-gen Core i3/i5/i7, Pentium and Celeron. Examples in the SFF datasheet start with the i7-7700 ([DS], [QS]).
  - Socket: not stated (LGA1151, from memory, unchecked).
- **Memory:**
  - DDR4, "4 DIMM", maximum 64 GB. The largest module listed is "16,384 MB" (16 GB) ([QS], [DS]).
  - Speed "DDR4-2400 (Transfer rates up to 2400 MT/s)". The actual data rate is "determined by the system's configured processor" ([QS]).
  - **Speed is limited by the CPU** ([QS], processor tables):
    - "Supports DDR4 memory up to 2400 MT/s data rate" applies to the 7th-gen i7/i5/i3 and the Pentium G4560, G4560T, G4600, G4600T and G4620 (no G4620T is listed).
    - "up to 2133 MT/s" applies to the 6th-gen i7-6700/i5-6500/i5-6600/i3-6100 (and their T versions) and the Celeron G3930/G3950.
  - ECC: not mentioned anywhere in the QuickSpecs pages that were read.
  - Datasheet note: "If you mix memory speeds, the system will perform at the lower memory speed" ([DS]).
- **Built-in graphics** ([DS] footnotes):
  - HD 630 on 7th-gen Core i7/i5/i3 and the Pentium G4620/G4600.
  - HD 530 on 6th-gen Core.
  - HD 610 on the Pentium G4560 and Celeron G3950/G3930.
  - No CPU in the list is said to lack graphics.
- **Expansion slots:**
  - SFF overview: "(2) PCI Express x16 graphics connectors; one wired as an x4" and "(2) PCI Express x1 accessory connectors" ([QS]).
  - Slot table, SFF column **(column inferred)** ([QS]):
    - PCIe x1 (v3.0): 2 slots, "2.5” low profile, 6.6” length, 10W max. power".
    - PCIe x16 wired as x4: 1 slot, "2.5” low profile, 6.6” length, 35W max. power".
    - PCIe x16: 1 slot, "2.5” low profile, 6.6” length, 35W max. power".
    - The 75 W x16 entry belongs to the Tower.
  - Datasheet: "2 low-profile PCIe (x1)" and "2 low-profile PCIe x16" ([DS]).
  - Graphics cards in the SFF datasheet: NVIDIA GeForce GT 730 (1 GB HDMI, and 2 GB DP) ([DS]).
  - QuickSpecs cards marked "*Requires 500W chassis" (RX 480, GTX 1060/1070/1080) need the 500 W PSU, which is a Tower option ([QS]). The document does not say "not SFF" in so many words.
  - PCIe power cable: not stated.
- **Storage:**
  - M.2: "(1) internal M.2 SSD storage (2230 or 2280 connector)" and "(1) internal M.2 WLAN (2230 connector)" ([QS]). The slot table gives "M.2 PCIe x4-2280 (for storage)" and "M.2 PCIe x1-2230 (for WLAN)" **(column inferred)**. **These disagree on the storage length:** the overview says 2230 or 2280, but the slot table and the datasheet ("1 M.2 2280 for optional SSD drive", [DS]) give 2280 only, so 2230 SSD support on the SFF is uncertain.
  - M.2 SATA support: not stated.
  - Bays, **two sources disagree**:
    - QuickSpecs: "(1) 2.5” internal storage drive bay", "(2) 3.5” internal storage drive bay (convertible to 2.5”)" and "(1) 9.5mm slim optical drive bay".
    - Datasheet: internal "One 6.35 cm (2.5"); One 8.9 cm (3.5")" and external "One 9.5 mm slim" ([DS]).
  - SATA ports: "Internal SATA storage connector(s) N/A 3 5 N/A" under the headers DM SFF TWR AiO, so the SFF has 3 ([QS]).
- **Power supply:**
  - Datasheet: "180 W, up to 82% efficient, active PFC" ([DS]).
  - QuickSpecs PSU table, SFF column **(column inferred)**: "180W active PFC" in both 80 PLUS Bronze and 80 PLUS Platinum versions, with a 70 mm variable-speed fan. A "Standard Efficiency" row ("90W active PFC…") could not be placed in a column ([QS]).
  - Proprietary connector: not stated.
- **Networking:**
  - "Intel® I219LM Gigabit Network Connection LOM (standard)". Optional "Intel® Ethernet I210-T1 PCIe x1" NIC ([QS], [DS]).
  - Wi-Fi is optional on the M.2 2230 WLAN slot. Options include Intel 8265, 7265 and 3168 ([QS]).
  - QuickSpecs: "Wireless LAN (optional and all except for 7265 for SFF/TWR must be bought at purchase)".
  - M.2 key: not stated.
- **Upgrade trip-ups the docs state:**
  - 65 W CPU cap on the SFF.
  - 6th-gen Core and the Celerons run memory at 2133 MT/s.
  - Low-profile cards only, 6.6" long, 35 W per x16 slot (QS slot table).
  - No BIOS requirement for the 6th vs 7th generation is stated.

<a id="800g3-sources"></a>Sources:
- [QS] HP QuickSpecs "HP EliteDesk 800 G3 and HP EliteOne 800 G3 Business Desktops PCs", footer "c05378305 — DA 15829 — Worldwide — Version 33 — December, 2017". Mirror: https://media.bargainhardware.co.uk/media/quick-specs/desktops/HP-EliteDesk-800-G3-Quick-Specs.pdf (the HP-hosted copy was refused).
- [DS] HP datasheet "HP EliteDesk 800 G3 Small Form Factor PC", 4AA6-9331EEE, February 2017: https://cc.cs.1worldsync.com/vcs/hp/inline-content/7F/F/6/D/8/6/F6D8634F806BACAF80730697A708F9A0AD0B9A62_source.PDF

Second check, 2026-11-20: 22 facts checked against the cited pages; 0 corrected; 1 couldn't be checked.
