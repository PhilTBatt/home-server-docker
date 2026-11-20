# HP EliteDesk 800 G4 Mini (Desktop Mini)

- **Form factors under this name:** "HP EliteDesk 800 35W G4 Desktop Mini PC" ([DS35]) and "HP EliteDesk 800 65W G4 Desktop Mini PC" ([DS65]). The QuickSpecs power section also has headers for "(35W)", "(65W)" and "(95W)" Desktop Mini variants ([QS]). The variants share a name, so check which variant a unit is. None of the documents read says there is a wattage label on the chassis. **The facts below apply to the Desktop Mini, with the variant noted where the docs split.**
- **CPU:**
  - Chipset "Intel® Q370" ([DS35]).
  - 8th-gen Core plus Pentium. The 35 W datasheet lists T parts such as the i7-8700T and the Pentium G5400T/G5500T ([DS35]).
  - QuickSpecs: "Processors up to 95W on TWR, SFF and DM" ([QS]). Which CPUs fit which DM variant is not clearly extractable.
  - Socket: not stated (LGA1151, from memory, unchecked).
- **Memory:**
  - "32 GB DDR4-2666 SDRAM", "2 SODIMM" (both datasheets).
  - "actual data rate is determined by the system's configured processor" ([DS65]).
  - The 35 W datasheet footnote also says "up to 2133 MT/s", which conflicts ([DS35]).
  - ECC: not stated.
- **Built-in graphics:** UHD 630 and UHD 610 ([DS35], [DS65]).
- **Expansion:**
  - No PCIe card slots: the PCIe x1/x16 rows are "N/A" for DM ([QS]).
  - "1 M.2 2230; 2 M.2 2230/2280 (1 M.2 slot for WLAN and 2 M.2 2230/2280 slot for storage.)" ([DS65]).
  - QuickSpecs: "(1) M.2 PCIe x1 2230 (for WLAN)" and "(2) M.2 PCIe x4 2280/2230 Combo (for storage)" ([QS]).
  - Optional discrete AMD Radeon RX 560 (later renamed RX 560X, per [QS]): "35W processor model can be configured with an AMD Radeon™ RX560 graphics or Thunderbolt™" ([DS65]).
  - "only one M.2 drive can be populated if an optional discrete graphics card is installed" ([DS35], [DS65]).
- **Storage:**
  - "One 2.5" HDD" bay ([DS35], [DS65]).
  - "Internal SATA storage connector (Data and Power) 1 N/A N/A N/A" under DM SFF TWR AiO, so the DM has 1 ([QS]).
  - "For Desktop Mini with M.2 Storage config, there will be no SATA drive bracket" ([QS]).
  - QuickSpecs note: the 2.5" SATA drive "cannot be selected if 2nd M.2, discrete graphic card, or 95W processor is selected" ([QS]).
  - M.2 SATA support: not stated.
- **Power supply (external adapter):**
  - 35 W model: "65 W external power adapter, up to 89% efficiency", and "150 W external power adapter … active PFC" when ordered with the RX 560 ([DS35]).
  - 65 W model: "90 W external power adapter, up to 89% efficiency, active PFC" ([DS65]).
  - QuickSpecs EPS list: 65 W, 90 W and 150 W, "89% average efficiency", with no mapping to variant ([QS]).
  - Barrel/connector type: not stated.
- **Networking:**
  - "Integrated Intel® I219LM GbE LOM" ([DS35], [DS65]).
  - Wi-Fi optional on the M.2 2230 slot, e.g. "Intel® Dual Band Wireless-AC 9560 802.11ac (2x2) and Bluetooth® 5 M.2" ([DS35]). The 65 W datasheet lists "1 external antenna connector" ([DS65]).
  - M.2 key: not stated.
- **Upgrade trip-ups the docs state:**
  - The adapter wattage and CPU class depend on the 35 W / 65 W / 95 W variant.
  - The discrete GPU (35 W model only) takes away one M.2 storage slot.
  - The 2.5" drive is excluded by a 2nd M.2, a GPU or a 95 W CPU.
  - Power delivery over USB-C display only on the 35 W model ([DS65]).

<a id="800g4dm-sources"></a>Sources:
- [QS] HP QuickSpecs c06040430, Version 36, Feb 18 2020 (same file as the 800 G4 SFF): https://h30434.www3.hp.com/psg/attachments/psg/Business-PC-Workstation-POS/52518/1/HP%20EliteDesk%20800%20G4%20DM%20etc%20QuickSpecs%20v20.pdf
- [DS35] HP datasheet "HP EliteDesk 800 35W G4 Desktop Mini PC", 4AA7-3269ENUC, August 3rd 2018: https://bargainhardware.co.uk/media/quick-specs/desktops/HP-EliteDesk-800-G4-Mini-Quick-Specs.pdf
- [DS65] HP datasheet "HP EliteDesk 800 65W G4 Desktop Mini PC", 4AA7-3270, 2019 November 13: https://www.barcodesinc.com/media/pdf/HP/elitedesk-800-g4-dm.pdf

Second check, 2026-11-20: 20 facts checked against the cited pages; 0 corrected; 0 couldn't be checked.
