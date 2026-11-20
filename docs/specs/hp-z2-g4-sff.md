# HP Z2 G4 (SFF)

- **Form factor:** Z2 Small Form Factor G4. See `hp-z2-g4-tower.md` for what the name covers.
- **CPU:**
  - "Intel® C246 chipset", "Single LGA 1151" ([QS-S]).
  - Families: Xeon (the G models listed include E-2286G, E-2278G, E-2276G, E-2274G, E-2244G, E-2226G and E-2224G), 9th-gen Core i3/i5/i7/i9, 8th-gen Core i7-8700, i5-8500 and i3-8100, and Pentium G5400. No Celeron ([QS-S]). The document's family line names only the Intel Xeon E-2100 family; calling the E-22xx models "E-2200" is the researcher's reading of the model numbers.
  - Max TDP 95 W (Xeon E-2286G, Core i9-9900K, i7-9700K) ([QS-S]).
- **Memory:**
  - DDR4 UDIMM, ECC and non-ECC. "Maximum Memory 128GB". "8GB, 16GB and 32GB ECC unbuffered DIMMs are supported". 4 slots ([QS-S]).
  - DDR4-2666. The i3-8100 and Pentium G5400 are listed at 2400 ([QS-S]).
  - ECC with Xeon E, Core i3 and Pentium. Core i5/i7 are non-ECC only. Core i9 is not addressed in the extracted text. No mixing ([QS-S]).
  - Change note: factory "2666" memory moving to "3200" parts, which HP says does not change performance ([QS-S]).
- **Built-in graphics:** P630 on the listed Xeon G models. The E-2136 and E-2236 show "N/A" (no iGPU). Core: UHD 630. Pentium: UHD 610 ([QS-S]).
- **Expansion slots:**
  - "(all slots are Low Profile)" ([QS-S]):
    - "1 PCI Express Gen3 slot x16 mechanical/ x16 electrical (LP, half length)".
    - Two "x4 mechanical/ x1 electrical (LP, half length)".
    - "1 PCI Express Gen3 slot x16 mechanical/ x4 electrical (LP, half length)".
  - Supported graphics, all low profile ([QS-S]):
    - Quadro P400 (30 W, up to 2 cards).
    - P620 (40 W).
    - P1000 (47 W).
    - Radeon Pro WX3100 (50 W).
    - WX3200 (56 W).
    - WX4100 (50 W).
  - No system-wide graphics power limit is stated. A PCIe graphics power connector is not mentioned ([QS-S]).
- **Storage:**
  - Two M.2 storage slots, PCIe Gen3 x4, "up to 80mm". One M.2 WLAN slot, PCIe Gen3 x1 with Intel CNVi ([QS-S]). M.2 SATA support: not stated.
  - Bays: "1 shared internal/external 3.5" bay", "1 internal 3.5" bay", "1 internal 2.5" bay (for SSD only)", plus a slim ODD bay ([QS-S]).
  - SATA: 4 ports at 6 Gb/s, RAID 0/1 ([QS-S]).
- **Power supply:** "400W internal power adapter, up to 92% efficiency, active PFC" (HP's wording), "310W 90% Efficiency", "250W 92% Efficiency" ([QS-S]). Proprietary connector: not stated.
- **Networking:**
  - Intel I219LM GbE (vPro/AMT 12.0) ([QS-S]).
  - Factory Wi-Fi: Intel 9560 + BT5 (M.2). Option kit: Intel AX200 Wi-Fi 6 as a PCIe card ([QS-S]).
  - M.2 key: not stated.
- **Upgrade trip-ups the docs state:**
  - Low-profile, half-length cards only.
  - Graphics options top out around 56 W.
  - 2.5" bay is SSD only.
  - M.2 storage up to 80 mm (the Tower takes up to 110 mm).
  - Core i5/i7 run non-ECC only.

<a id="z2sff-sources"></a>Sources:
- [QS-S] HP QuickSpecs "HP Z2 Small Form Factor G4 Workstation", footer "c05987487 — DA-16217 — Worldwide — Version 17 — March 1, 2023". The copy on HP's community host: https://h30434.www3.hp.com/psg/attachments/psg/Business-PC-Workstation-POS/45153/1/HP%20Z2%20SFF%20G4%20Workstation%20QuickSpecs.pdf. The extraction was truncated in the networking section (page 56).

Second check, 2026-11-20: 16 facts checked against the cited pages; 0 corrected; 2 couldn't be checked.
