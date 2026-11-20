# HP EliteDesk 800 G5 SFF

- **Form factors under this name:** Tower, SFF and Desktop Mini, plus the EliteOne 800 G5 AiO in a separate PDF. **The facts below are for the SFF.**
- **CPU:**
  - "Intel® 9th and select 8th generation Core™ processors", plus Pentium and Celeron ([QS]).
  - "Processors up to 95W on TWR, SFF and DM" ([QS]). The datasheet says "up to a 95W 9th Gen Intel® Core™ processors" and "95W processor is an optional feature" ([DS]).
  - Chipset "Intel® Q370" ([DS]) (corrected on a second check, 2026-11-20).
  - Socket: not stated (LGA1151, from memory, unchecked).
- **Memory:**
  - Datasheet: "128 GB DDR4-2666 SDRAM", "4 DIMM" ([DS]).
  - QuickSpecs: "DDR4-2666 (Transfer rates up to 2666 MT/s), 128 GB, 4 DIMM" (the form-factor mark is unclear in extraction). Largest module listed "32 GB (1 x 32 GB)". "actual data rate is determined by the system's configured processor" ([QS]).
  - The processor tables in this QuickSpecs give no per-CPU memory speeds ([QS]).
  - The datasheet has a footnote "Memory modules support data transfer rates up to 2133 MT/s", which contradicts its own 2666 ([DS]).
  - ECC: not mentioned.
- **Built-in graphics:** "Integrated: Intel® UHD Graphics 630; Intel® UHD Graphics 610" ([DS]), not broken down per CPU. Per-CPU graphics were not captured for this model.
- **Expansion slots:**
  - QuickSpecs slot table (headers DM | SFF | TWR | AiO): SFF has PCIe v3.0 x1 ×2, "x16 (wired as x4)" ×1, x16 ×1 ([QS]).
  - Datasheet: "1 PCIe 3.0 x16", "1 PCIe 3.0 x16 (wired as x4)", "2 PCIe 3.0 x1" ([DS]).
  - Slot height: the datasheet says "The HP EliteDesk 800 SFF has enormous expandability with four bays and four half-height slots" ([DS]) (corrected on a second check, 2026-11-20). It does not spell out whether "half-height" means low profile. The QuickSpecs lists cards as "LP PCB with LP bracket" (Quadro P620/P400) and "LP PCB with FH/LP bracket" (R7 430), but does not tie them to the SFF ([QS]). Low profile is stated for the sister 800 G4 SFF; no G5 document read says it.
  - The SFF datasheet's discrete cards are GT 730 2 GB, Radeon R7 430 2 GB and "AMD Radeon™ RX 550 Graphics (4 GB GDDR5 dedicated)" ([DS]) (corrected on a second check, 2026-11-20).
  - The QuickSpecs "up to 75W" single-card limit is stated for the Tower, and nothing equivalent is given for the SFF ([QS]).
  - PCIe power cable: not stated.
- **Storage:**
  - M.2: "(2) internal M.2 SSD storage (2230 or 2280 connector)", "M.2 PCIe x4 2280/2230 combo (storage)" ×2, and "M.2 PCIe x1 2230 (WLAN)" ×1 ([QS]). The datasheet says "1 M.2 2230", "2 M.2 2230/2280" ([DS]).
  - M.2 SATA support: not stated.
  - Bays: "(1) 2.5" internal storage drive bay", two 3.5" bays "(convertible to 2.5")" and a 9.5 mm slim ODD ([QS]). The datasheet says "1 slim ODD; One 2.5" HDD; Two 3.5" HDD" ([DS]).
  - SATA: "Internal SATA storage connector(s)" N/A | 3 | 4 | 2 (DM | SFF | TWR | AiO), so the SFF has 3 ([QS]).
  - Same QuickSpecs note as the G4: the 2.5" SATA drive is not selectable with a 2nd M.2, a discrete GPU or a 95 W CPU ([QS]).
- **Power supply:**
  - "250 W internal power supply, up to 92% efficiency, active PFC" ([DS]).
  - QuickSpecs PSU table lists "250W active PFC / 80 PLUS Platinum" and "210W active PFC / 80 PLUS Platinum*", with columns unclear ([QS]).
  - Proprietary connector: not stated.
- **Networking:**
  - Intel I219-LM GbE LOM. Optional Intel I210-T1 PCIe NIC ([DS], [QS]).
  - Wi-Fi optional: Intel Wi-Fi 6 AX200 and Intel 9560 (vPro and non-vPro) ([QS], [DS]).
  - M.2 key: not stated.
- **Upgrade trip-ups the docs state:** the same 2.5" drive vs 2nd M.2 / GPU / 95 W CPU configuration note. Nothing else captured.

<a id="800g5-sources"></a>Sources:
- [QS] HP QuickSpecs "HP EliteDesk 800 G5 and HP EliteOne 800 G5 Business Desktops PCs" (TWR/SFF/DM file), footer "c06320288 – DA-16479 – Worldwide – Version 21 – March 4, 2020". Mirror: https://hp.it-shop.bg/uploaded/8/5/EliteDesk-800-G5-TWR-SFF-DM-QS.pdf
- [DS] HP datasheet "HP EliteDesk 800 G5 Small Form Factor PC", July 2019: https://www.laptopsdirect.co.uk/PDFs/7PF01ET_ProductDataSheetBrochure2.PDF

Second check, 2026-11-20: 21 facts checked against the cited pages; 3 corrected; 2 couldn't be checked.
