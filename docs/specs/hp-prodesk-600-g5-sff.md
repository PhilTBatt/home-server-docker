# HP ProDesk 600 G5 SFF

- **Form factors under this name:** Microtower, SFF and Desktop Mini, plus a ProOne AiO in the same QuickSpecs. **The facts below are for the SFF.**
- **CPU:**
  - Chipset "Intel® Q370 (vPro); Intel® Q370 (non-vPro)" ([DS], [QS]).
  - "Processor support up to 65W for MT/SFF/AiO and up to 35W for Desktop Mini" ([QS]).
  - 65 W parts marked for SFF/MT/AiO **(column inferred)** ([QS]):
    - 9th gen: i9-9900, i7-9700, i5-9600/9500/9400, i3-9300/9100.
    - 8th gen: i7-8700, i5-8500/8400, i3-8100.
    - Pentium G5620/G5600/G5420.
    - Celeron G4930.
  - Whether 35 W "T" parts are offered on the SFF is unclear ([QS]).
  - Socket: not stated (LGA1151, from memory, unchecked).
- **Memory:**
  - "128 GB DDR4-2666 SDRAM", "4 DIMM" ([DS]). The QuickSpecs says the SFF supports up to 128 GB, and its largest module listed is 32 GB ([QS]).
  - The service guide's parts list says "Memory modules (4, DDR4-2666, 1.2-V, NECC, UDIMM)" ([MSG]). "NECC" is HP's shorthand for non-ECC (from memory, unchecked).
  - QuickSpecs: "UDIMM 2666 1DPC & 2DPC, capable when same UDIMM part number is populated within each channel". Data rate is "determined by the system's configured processor", and some i3 and Pentium/Celeron parts list 2400 MT/s ([QS]).
  - Service guide: "DIMM1 must be installed before DIMM2, and DIMM3 must be installed before DIMM4" ([MSG]).
- **Built-in graphics:** UHD 630 and UHD 610 ([DS]).
- **Expansion slots:**
  - QuickSpecs overview: 1 PCIe x16 and 1 PCIe x4 ([QS]). The datasheet says "1 PCIe 3 x4", "1 PCIe 3 x16" ([DS]).
  - Slot height: not stated.
  - Graphics cards in the datasheet: GT 730 2 GB, Radeon R7 430 2 GB, Radeon RX 550X 4 GB ([DS]). The QuickSpecs lists RX 550X, R7 430 and Radeon 520 as LP PCBs at "<50W" each, and its change log says "AMD Radeon RX 550X 4GB Display Card set for SFF only" ([QS]). Within the QuickSpecs, the RX 550X's card name reads "AMD® Radeon™ RX 550X 4GB FH DP+HDMI", which does not match its "LP (low profile) PCB with FH/LP bracket" spec ([QS]). The "FH" in the name probably refers to the fitted bracket (inference, not stated).
  - The "single graphics card up to 75W" limit is stated for the MT only ([QS]). PCIe power cable: not stated.
- **Storage:**
  - M.2: "M.2 PCIe x4 2280/2230 combo" ×1 (storage) and "M.2 PCIe x1 2230" ×1 (WLAN) ([QS]). The datasheet says "1 M.2 2230; 1 M.2 2230/2280" ([DS]).
  - M.2 SATA support: not stated.
  - Bays: "(1) 3.5" internal storage drive bay or (2) 2.5" internal storage drive bays" and "SFF can be configured with either (1) 3.5” or (2) 2.5” internal storage drive", plus a 9.5 mm slim ODD ([QS]). The datasheet says "One 3.5" HDD convertible to two 2.5" HDD" ([DS]).
  - SATA ports: 3 **(column inferred)** ([QS]).
  - QuickSpecs note: "2.5" SATA storage drive cannot be selected if 2nd M.2 is installed" ([QS]).
- **Power supply:**
  - "180 W internal power supply, up to 92% efficiency, active PFC" ([DS]).
  - QuickSpecs PSU table: "180W active PFC", "80 PLUS Platinum", with the SFF column most likely but **(column inferred)**. It also gives a 50 mm fan and PSU dimensions of 200×85×53 mm ([QS]).
  - The service guide's parts list has 310 W, 250 W and 180 W supplies ("12-V … 2 out connectors, 1 control cable connector") and does not say which is SFF and which is MT ([MSG]). The guide's parts list also covers MT boards.
  - Proprietary connector: not stated as such. The parts descriptions show a 12 V-only supply with "2 out connectors, 1 control cable connector" ([MSG]).
- **Networking:**
  - Intel I219-LM GbE standard. Optional I210-T1 (SFF applicability unclear) ([QS], [DS]).
  - Wi-Fi options: Intel 9560 (vPro and non-vPro), Realtek RTL8822BE, Realtek RTL8821CE ([QS]).
  - M.2 key: not stated.
- **Upgrade trip-ups the docs state:**
  - 65 W CPU cap.
  - Some i3/Pentium/Celeron run memory at 2400.
  - The 2.5" drive vs 2nd M.2 configuration note.
  - The 3.5" bay is either one 3.5" drive or two 2.5" drives, not both.

<a id="600g5-sources"></a>Sources:
- [QS] HP QuickSpecs "HP ProDesk 600 G5 Business Desktops PC", footer "c06336904 – DA-16477 – Worldwide — Version 16 — June 16, 2020". Mirror: https://gc3.de/files/quickspecs/qs_600G5.pdf
- [DS] HP datasheet "HP ProDesk 600 G5 Small Form Factor PC", 4AA7-4965EEAP, May 2020: https://bargainhardware.co.uk/media/quick-specs/desktops/HP-ProDesk-600-G5-SFF-Quick-Specs.pdf
- [MSG] HP "Maintenance and Service Guide, HP ProDesk 600 G5 SFF", L16887-003, Third Edition September 2019: https://h10032.www1.hp.com/ctg/Manual/c06442415.pdf. Its system-board connector table and memory spec section did not come through in extraction.

Second check, 2026-11-20: 23 facts checked against the cited pages; 0 corrected; 0 couldn't be checked.
